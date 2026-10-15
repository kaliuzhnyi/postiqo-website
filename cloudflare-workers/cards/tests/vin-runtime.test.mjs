import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { vin, decoded } from './vin-database.mjs';

test('workerd executes bounded VIN jobs with real D1 and exposes measured row usage', async t => {
  let requests = 0;
  const mf = new Miniflare({ telemetry: { enabled: false }, host: '127.0.0.1', workers: [{ config: {
    name: 'vin-runtime', type: 'worker', compatibilityDate: '2026-09-08',
    manifest: { mainModule: 'test.js', modulesRoot: '/', modules: {
      'test.js': { type: 'esm', contents: `import worker, {runEnrichment} from './vin.js';
        export default { async fetch(request, env) {
          if (new URL(request.url).pathname !== '/test-run') return worker.fetch(request, env);
          return Response.json(await runEnrichment(env, {now: Number(new URL(request.url).searchParams.get('now'))}));
        } };` },
      'vin.js': { type: 'esm', contents: await readFile(new URL('../dist/vin.js', import.meta.url), 'utf8') },
    } }, env: { DB: { type: 'd1', id: 'vin-runtime' }, VIN_ENRICHMENT_ENABLED: { type: 'text', value: 'true' } },
  }, dev: { outboundService: { type: 'fetcher', handler: async request => {
    requests++;
    assert.equal(request.url, 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/');
    const form = new URLSearchParams(await request.text());
    return Response.json({ Results: form.get('data').split(';').map(value => decoded(value.split(',')[0])).reverse() });
  } } } }] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE inventory(id INTEGER PRIMARY KEY, vin TEXT, year INTEGER, is_active INTEGER)').run();
  const schema = await readFile(new URL('./enrichment-schema.sql', import.meta.url), 'utf8');
  await db.batch(schema.split(';').filter(sql => sql.trim()).map(sql => db.prepare(sql)));
  await db.prepare(`INSERT INTO inventory SELECT value, '1HGCM82633A' || printf('%06d', value), 2003, 1 FROM json_each(?)`)
    .bind(JSON.stringify(Array.from({ length: 202 }, (_, i) => i + 1))).run();
  const run = async now => {
    const response = await mf.dispatchFetch(`https://vin.test/test-run?now=${now}`);
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const first = await run(Date.UTC(2026, 9, 15, 12));
  assert.equal(first.attempted, 3); assert.equal(requests, 1);
  assert.ok(first.rowsRead < 500, JSON.stringify(first));
  assert.ok(first.rowsWritten < 150, JSON.stringify(first));
  assert.equal((await db.prepare('SELECT status FROM inventory_enrichment WHERE inventory_id = 1').first()).status, 'complete');
  assert.equal((await db.prepare('SELECT vin FROM inventory WHERE id = 1').first()).vin, vin(1));
  assert.equal((await run(Date.UTC(2026, 9, 15, 12))).skipped, true);
  assert.equal((await mf.dispatchFetch('https://vin.test/')).status, 404);
  t.diagnostic(`First bounded run: ${first.rowsRead} D1 rows read, ${first.rowsWritten} rows written, ${requests} NHTSA batch. Final runner metrics update adds one row write.`);
});
