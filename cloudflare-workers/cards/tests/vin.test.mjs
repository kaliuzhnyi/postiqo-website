import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDecode, mergeEnrichment } from '../src/vin.js';
import { runEnrichment, SLOT_MS, SCAN_LIMIT, DECODE_LIMIT } from '../src/vin-worker.js';
import { localDatabase, add, vin, decoded, decoder } from './vin-database.mjs';

const start = Date.UTC(2026, 9, 15, 12);
const env = db => ({ DB: db, VIN_ENRICHMENT_ENABLED: 'true' });
const state = (db, id) => db.sqlite.prepare('SELECT * FROM inventory_enrichment WHERE inventory_id = ?').get(id);

test('decoder classifies PHEV, keeps unknown data empty, and requires a clean matching VIN', () => {
  const result = normalizeDecode(decoded(vin(1), { FuelTypePrimary: 'Electric', FuelTypeSecondary: 'Gasoline',
    ElectrificationLevel: 'PHEV (Plug-in Hybrid Electric Vehicle)', DisplacementL: '2.000', Seats: '5-7', EngineHP: '180' }), vin(1), 2003);
  assert.equal(result.data.fuel_type, 'Plug-in hybrid');
  assert.equal(result.data.engine_displacement_l, 2);
  assert.equal(result.data.seats, undefined);
  assert.equal(result.data.engine_hp, undefined);
  for (const ErrorCode of ['1', '6', '0,14', '5,6,14']) assert.equal(normalizeDecode(decoded(vin(1), { ErrorCode }), vin(1), 2003).status, 'review');
  assert.equal(normalizeDecode(decoded(vin(1), { ErrorCode: '7,8' }), vin(1), 2003).status, 'no_data');
  assert.equal(normalizeDecode(decoded(vin(1)), vin(1), 2004).status, 'review');
  for (const changes of [{ ErrorCode: '' }, { VIN: vin(2) }, { ErrorCode: null }]) assert.throws(() => normalizeDecode(decoded(vin(1), changes), vin(1), 2003));
});

test('website fills blanks only and never takes prices, colors or identity from arbitrary JSON', () => {
  const row = { vin: vin(1), year: 2003, make: 'Honda', model: 'Accord', trim: '  ', cylinders: 0,
    fuel_type: 'Other', price: 0, exterior_color: 'Red', enrichment_vin: vin(1), enrichment_status: 'complete',
    enrichment_json: JSON.stringify({ ...normalizeDecode(decoded(vin(1)), vin(1), 2003).data,
      price: 99999, exterior_color: 'Blue', is_active: 1, dealer_email: 'bad@example.test' }) };
  const merged = mergeEnrichment(row);
  assert.equal(merged.trim, 'EX'); assert.equal(merged.cylinders, 0); assert.equal(merged.fuel_type, 'Other');
  assert.equal(merged.engine_displacement_l, 2.4); assert.equal(merged.exterior_color, 'Red'); assert.equal(merged.price, 0);
  assert.equal(merged.dealer_email, undefined); assert.equal(merged.is_active, undefined);
  assert.equal(mergeEnrichment({ ...row, trim: 'Dealer trim' }).trim, 'Dealer trim');
  for (const changes of [{ year: 2004 }, { make: 'Ford' }, { model: 'Civic' }, { enrichment_vin: vin(2) }, { enrichment_status: 'review' }]) {
    assert.equal(mergeEnrichment({ ...row, ...changes }).engine_displacement_l, undefined);
  }
});

test('bounded discovery includes historical active vehicles, excludes inactive ones and keeps source writes untouched', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close());
  for (let id = 1; id <= 55; id++) add(db, id, { active: id === 1 ? 0 : 1 });
  const before = db.sqlite.prepare('SELECT * FROM inventory ORDER BY id').all(), calls = [];
  const request = decoder(calls, values => values.reverse());
  const metrics = await runEnrichment(env(db), { now: start, request });
  assert.equal(metrics.attempted, DECODE_LIMIT);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM inventory_enrichment').get().n, SCAN_LIMIT);
  assert.equal(state(db, 1), undefined); assert.equal(state(db, 2).status, 'complete');
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST');
  assert.deepEqual(Object.keys(calls[0].form).sort(), ['data', 'format']);
  assert.equal((await runEnrichment(env(db), { now: start + 1, request })).skipped, true);
  await runEnrichment(env(db), { now: start + SLOT_MS, request });
  assert.equal(calls.length, 2);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM inventory ORDER BY id').all(), before);
  assert.equal(state(db, 2).attempts, 1);
  assert.match(db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM inventory INDEXED BY inventory_active_scan WHERE is_active=1 AND id>0 ORDER BY id LIMIT 20').all().map(r => r.detail).join(' '), /inventory_active_scan/);
});

test('a vehicle deactivated before work or during the request receives no decode; reactivation is discovered', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close());
  add(db, 1); add(db, 2); add(db, 3, { active: 0 });
  const calls = [];
  await runEnrichment(env(db), { now: start, request: decoder(calls, values => {
    db.sqlite.prepare('UPDATE inventory SET is_active = 0 WHERE id = 1').run(); return values;
  }) });
  assert.equal(state(db, 1).status, 'inactive'); assert.equal(state(db, 1).decoded_json, '{}');
  assert.equal(state(db, 3), undefined); assert.equal(state(db, 2).status, 'complete');
  db.sqlite.prepare('UPDATE inventory SET is_active = 1 WHERE id = 1').run();
  await runEnrichment(env(db), { now: start + SLOT_MS, request: decoder(calls) });
  assert.equal(state(db, 1).status, 'complete'); assert.equal(state(db, 2).attempts, 1);
  add(db, 4);
  await runEnrichment(env(db), { now: start + 2 * SLOT_MS, request: decoder(calls, values => {
    db.sqlite.prepare('UPDATE inventory SET year = 2004 WHERE id = 4').run(); return values;
  }) });
  assert.equal(state(db, 4).status, 'inactive'); assert.equal(state(db, 4).decoded_json, '{}');
});

test('provider errors respect cooldown and stop after three attempts', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close()); add(db, 1);
  let calls = 0;
  const request = async () => { calls++; return new Response('Busy', { status: 429, headers: { 'Retry-After': '7200' } }); };
  await runEnrichment(env(db), { now: start, request });
  assert.equal(state(db, 1).status, 'retry');
  await runEnrichment(env(db), { now: start + SLOT_MS, request }); assert.equal(calls, 1);
  await runEnrichment(env(db), { now: start + 7200000, request }); assert.equal(calls, 2);
  await runEnrichment(env(db), { now: start + 8 * 3600000, request }); assert.equal(calls, 3);
  assert.equal(state(db, 1).status, 'failed');
  await runEnrichment(env(db), { now: start + 24 * 3600000, request }); assert.equal(calls, 3);
});

test('invalid VIN and warning results finish without repeated attempts; concurrent runs share one slot', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close()); add(db, 1, { value: null }); add(db, 2);
  const calls = [], request = decoder(calls, values => values.map(row => ({ ...row, ErrorCode: '0,14' })));
  await Promise.all([runEnrichment(env(db), { now: start, request }), runEnrichment(env(db), { now: start, request })]);
  assert.equal(calls.length, 1); assert.equal(state(db, 1).status, 'skipped'); assert.equal(state(db, 2).status, 'review');
  await runEnrichment(env(db), { now: start + SLOT_MS, request }); assert.equal(calls.length, 1);
  db.sqlite.prepare('DELETE FROM inventory WHERE id = 2').run(); assert.equal(state(db, 2), undefined);
});

test('two dealers share a provider lookup, while different year hints are processed separately', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close());
  add(db, 1); add(db, 2, { value: vin(1), dealer: 101 }); add(db, 3, { value: vin(1), year: 2004, dealer: 102 });
  const calls = [], request = decoder(calls);
  await runEnrichment(env(db), { now: start, request });
  assert.equal(calls[0].form.data, `${vin(1)},2003`);
  assert.equal(state(db, 1).status, 'complete'); assert.equal(state(db, 2).status, 'complete');
  assert.equal(state(db, 3).status, 'pending'); assert.equal(state(db, 3).attempts, 0);
  await runEnrichment(env(db), { now: start + SLOT_MS, request });
  assert.equal(calls[1].form.data, `${vin(1)},2004`);
  assert.equal(state(db, 3).status, 'review');
});

test('queued vehicles that become inactive are skipped before HTTP; obsolete leases cannot save', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close());
  for (let id = 1; id <= 5; id++) add(db, id);
  const calls = [];
  await runEnrichment(env(db), { now: start, request: decoder(calls) });
  db.sqlite.prepare('UPDATE inventory SET is_active = 0 WHERE id = 4').run();
  await runEnrichment(env(db), { now: start + SLOT_MS, request: decoder(calls, values => [...values, ...values]) });
  assert.equal(calls[1].form.data, `${vin(5)},2003`);
  assert.equal(state(db, 4).status, 'inactive'); assert.equal(state(db, 5).status, 'retry');
  await runEnrichment(env(db), { now: start + 2 * 3600000, request: decoder(calls, values => {
    db.sqlite.prepare("UPDATE inventory_enrichment SET lease_token = 'replacement' WHERE inventory_id = 5").run(); return values;
  }) });
  assert.equal(state(db, 5).decoded_json, '{}'); assert.equal(state(db, 5).lease_token, 'replacement');
});

test('expired leases recover without unlimited retries and a deleted row cannot be resurrected', async t => {
  const db = localDatabase(); t.after(() => db.sqlite.close()); add(db, 1); add(db, 2);
  db.sqlite.exec(`INSERT INTO inventory_enrichment(inventory_id, vin, model_year, status, attempts, updated_at)
    SELECT id, vin, year, 'processing', CASE id WHEN 1 THEN 2 ELSE 3 END, 'old' FROM inventory;`);
  const calls = [];
  await runEnrichment(env(db), { now: start, request: decoder(calls, values => {
    db.sqlite.prepare('DELETE FROM inventory WHERE id = 1').run(); return values;
  }) });
  assert.equal(calls.length, 1); assert.equal(state(db, 1), undefined); assert.equal(state(db, 2).status, 'failed');
});
