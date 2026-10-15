import { VIN_PATTERN, normalizeDecode } from './vin.js';

export const SCAN_LIMIT = 20;
export const DECODE_LIMIT = 3;
export const SLOT_MS = 15 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';
const queued = "status IN ('pending','processing','retry')";

async function boundedJson(response) {
  if (!response.body) throw new Error('invalid_response');
  const reader = response.body.getReader(), parts = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 128 * 1024) throw new Error('response_too_large');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

// This Worker has no public job endpoint. Every run is bounded, including scans
// of already decoded inventory. No network request runs inside a D1 transaction.
export async function runEnrichment(env, { now = Date.now(), request = fetch } = {}) {
  if (env.VIN_ENRICHMENT_ENABLED !== 'true') return { disabled: true };
  const db = env.DB, token = crypto.randomUUID(), slot = Math.floor(now / SLOT_MS);
  const stamp = new Date(now).toISOString(), metrics = { rowsRead: 0, rowsWritten: 0, attempted: 0 };
  const count = result => {
    metrics.rowsRead += result.meta?.rows_read || 0;
    metrics.rowsWritten += result.meta?.rows_written || 0;
    return result;
  };
  const execute = async statement => count(await statement.all());
  const claim = await execute(db.prepare(`UPDATE inventory_enrichment_runner
    SET last_slot = ?, locked_until = ?, run_token = ?, last_run_at = ?
    WHERE id = 1 AND last_slot < ? AND locked_until <= ?
    RETURNING scan_cursor, cooldown_until`).bind(slot, now + LEASE_MS, token, stamp, slot, now));
  if (!claim.results.length) return { skipped: true };
  let cooldown = claim.results[0].cooldown_until;
  try {
    const scan = await execute(db.prepare(`SELECT id FROM inventory INDEXED BY inventory_active_scan
      WHERE is_active = 1 AND id > ? ORDER BY id LIMIT ?`).bind(claim.results[0].scan_cursor, SCAN_LIMIT));
    if (scan.results.length) {
      // Re-read activity/context inside this statement, not from the scan snapshot.
      await execute(db.prepare(`INSERT INTO inventory_enrichment(inventory_id, vin, model_year, updated_at)
        SELECT v.id, v.vin, v.year, ? FROM json_each(?) j JOIN inventory v ON v.id = j.value
        WHERE v.is_active = 1
        ON CONFLICT(inventory_id) DO UPDATE SET vin = excluded.vin, model_year = excluded.model_year,
          status = 'pending', attempts = 0, next_attempt_at = 0, lease_token = NULL,
          decoded_json = '{}', raw_json = NULL, error_code = NULL, decoded_at = NULL, updated_at = excluded.updated_at
        WHERE inventory_enrichment.vin IS NOT excluded.vin OR inventory_enrichment.model_year IS NOT excluded.model_year
          OR (inventory_enrichment.status = 'inactive' AND inventory_enrichment.attempts < 3)`)
        .bind(stamp, JSON.stringify(scan.results.map(row => row.id))));
    }
    await execute(db.prepare('UPDATE inventory_enrichment_runner SET scan_cursor = ? WHERE id = 1 AND run_token = ?')
      .bind(scan.results.length === SCAN_LIMIT ? scan.results.at(-1).id : 0, token));
    if (cooldown > now) return metrics;
    const candidates = await execute(db.prepare(`SELECT inventory_id FROM inventory_enrichment INDEXED BY inventory_enrichment_due
      WHERE ${queued} AND next_attempt_at <= ? ORDER BY next_attempt_at, inventory_id LIMIT ?`).bind(now, DECODE_LIMIT));
    const jobs = [];
    for (const { inventory_id: id } of candidates.results) {
      // Work which was deactivated, exhausted or lost its VIN/year context ends
      // without an external request. Reactivation/context changes are found by scan.
      await execute(db.prepare(`UPDATE inventory_enrichment SET status = CASE WHEN attempts >= ? THEN 'failed' ELSE 'inactive' END,
        lease_token = NULL, updated_at = ? WHERE inventory_id = ? AND ${queued} AND next_attempt_at <= ?
        AND (attempts >= ? OR NOT EXISTS (SELECT 1 FROM inventory v WHERE v.id = inventory_id
          AND v.is_active = 1 AND v.vin IS inventory_enrichment.vin AND v.year IS model_year))`)
        .bind(MAX_ATTEMPTS, stamp, id, now, MAX_ATTEMPTS));
      const job = await execute(db.prepare(`UPDATE inventory_enrichment SET status = 'processing', attempts = attempts + 1,
        lease_token = ?, next_attempt_at = ?, updated_at = ?
        WHERE inventory_id = ? AND ${queued} AND next_attempt_at <= ? AND attempts < ?
          AND EXISTS (SELECT 1 FROM inventory v WHERE v.id = inventory_id AND v.is_active = 1
            AND v.vin IS inventory_enrichment.vin AND v.year IS model_year)
        RETURNING inventory_id, vin, model_year, attempts`).bind(token, now + LEASE_MS, stamp, id, now, MAX_ATTEMPTS));
      if (job.results.length) jobs.push(job.results[0]);
    }
    const outcomes = new Map();
    for (const job of jobs) if (!VIN_PATTERN.test(job.vin || '')) {
      outcomes.set(job.inventory_id, { status: 'skipped', data: {}, errorCode: 'invalid_vin' });
    }
    // A final activity check immediately before sending the batch. A sale during
    // the network request is also checked by the conditional result write below.
    const active = jobs.length ? await execute(db.prepare(`SELECT e.inventory_id FROM json_each(?) j
      JOIN inventory_enrichment e ON e.inventory_id = j.value JOIN inventory v ON v.id = e.inventory_id
      WHERE e.lease_token = ? AND e.status = 'processing'
      AND v.is_active = 1 AND v.vin IS e.vin AND v.year IS e.model_year`)
      .bind(JSON.stringify(jobs.map(job => job.inventory_id)), token)) : { results: [] };
    const activeIds = new Set(active.results.map(row => row.inventory_id));
    const eligible = jobs.filter(job => activeIds.has(job.inventory_id) && !outcomes.has(job.inventory_id));
    // Deduplicate the same VIN across dealers. Different year hints are deferred
    // to another run so batch replies can always be matched unambiguously by VIN.
    const hints = new Map(), deferred = [];
    const sending = eligible.filter(job => {
      if (hints.has(job.vin) && hints.get(job.vin) !== job.model_year) { deferred.push(job); return false; }
      hints.set(job.vin, job.model_year); return true;
    });
    for (const job of deferred) await execute(db.prepare(`UPDATE inventory_enrichment SET status = 'pending',
      attempts = attempts - 1, lease_token = NULL, next_attempt_at = ?, updated_at = ? WHERE inventory_id = ? AND lease_token = ?`)
      .bind(now + SLOT_MS, stamp, job.inventory_id, token));
    if (sending.length) {
      metrics.attempted = hints.size;
      let response;
      try {
        response = await request(ENDPOINT, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ format: 'json', data: [...hints].map(([vin, year]) => year >= 1980 && year <= 2200 ? `${vin},${year}` : vin).join(';') }).toString() });
        if (!response.ok) throw new Error(`http_${response.status}`);
        const body = await boundedJson(response);
        if (!Array.isArray(body.Results) || body.Results.length > DECODE_LIMIT) throw new Error('invalid_response');
        for (const job of sending) {
          const matches = body.Results.filter(row => row?.VIN?.toUpperCase() === job.vin);
          try {
            if (matches.length !== 1) throw new Error('invalid_response');
            const raw = JSON.stringify(matches[0]);
            if (raw.length > 32768) throw new Error('response_too_large');
            outcomes.set(job.inventory_id, { ...normalizeDecode(matches[0], job.vin, job.model_year), raw });
          } catch { outcomes.set(job.inventory_id, { status: job.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry', errorCode: 'invalid_response' }); }
        }
      } catch (error) {
        const code = /^http_\d+$/.test(error.message) ? error.message : 'network_or_response';
        const retryable = !response || response.status === 429 || response.status >= 500 || response.ok;
        const retryHeader = response?.headers.get('Retry-After');
        const retryTime = /^\d+$/.test(retryHeader || '') ? now + Number(retryHeader) * 1000 : Date.parse(retryHeader || '');
        // Shared cooldown prevents a provider outage from consuming the backlog.
        cooldown = Math.max(now + 60 * 60 * 1000, Number.isFinite(retryTime) ? retryTime : 0);
        for (const job of sending) outcomes.set(job.inventory_id, {
          status: retryable && job.attempts < MAX_ATTEMPTS ? 'retry' : 'failed', errorCode: code,
        });
      }
    }
    const statements = [];
    for (const job of jobs) {
      const outcome = outcomes.get(job.inventory_id);
      if (outcome) statements.push(db.prepare(`UPDATE inventory_enrichment SET status = ?, decoded_json = ?, raw_json = ?,
        error_code = ?, decoded_at = ?, updated_at = ?, next_attempt_at = ?, lease_token = NULL
        WHERE inventory_id = ? AND lease_token = ? AND EXISTS (SELECT 1 FROM inventory v WHERE v.id = inventory_id
          AND v.is_active = 1 AND v.vin IS inventory_enrichment.vin AND v.year IS model_year)`)
        .bind(outcome.status, JSON.stringify(outcome.data || {}), outcome.raw || null, outcome.errorCode,
          ['complete', 'partial'].includes(outcome.status) ? stamp : null, stamp,
          Math.max(cooldown, now + (job.attempts === 1 ? 3600000 : 21600000)), job.inventory_id, token));
      statements.push(db.prepare(`UPDATE inventory_enrichment SET status = 'inactive', lease_token = NULL, updated_at = ?
        WHERE inventory_id = ? AND lease_token = ? AND NOT EXISTS (SELECT 1 FROM inventory v WHERE v.id = inventory_id
          AND v.is_active = 1 AND v.vin IS inventory_enrichment.vin AND v.year IS model_year)`)
        .bind(stamp, job.inventory_id, token));
    }
    if (statements.length) (await db.batch(statements)).forEach(count);
    return metrics;
  } finally {
    await db.prepare(`UPDATE inventory_enrichment_runner SET locked_until = 0, run_token = NULL, cooldown_until = ?,
      last_rows_read = ?, last_rows_written = ?, last_attempted = ? WHERE id = 1 AND run_token = ?`)
      .bind(cooldown, metrics.rowsRead, metrics.rowsWritten, metrics.attempted, token).run();
  }
}

export default {
  async scheduled(_event, env) { await runEnrichment(env); },
  fetch() { return new Response('Not found', { status: 404 }); },
};
