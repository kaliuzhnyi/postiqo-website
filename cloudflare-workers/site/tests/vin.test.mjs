import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVin } from '../src/index.js';

const vin = '1HGCM82633A004352';
export const fixture = { VIN: vin, ErrorCode: '0', ModelYear: '2003', Make: 'HONDA', Model: 'Accord', Trim: 'EX-V6', BodyClass: 'Coupe', TransmissionStyle: 'Automatic', FuelTypePrimary: 'Gasoline', DisplacementL: '2.998832712', EngineCylinders: '6', Doors: '2', PlantCountry: 'UNITED STATES (USA)' };
export function setup() {
  const saved = new Map(), pending = [], calls = [];
  const cache = { async match(key) { return saved.get(key.url)?.clone(); }, async put(key, response) { saved.set(key.url, response.clone()); } };
  const env = { VIN_RATE_LIMITER: { limit: async () => ({ success: true }) }, VIN_PROVIDER_LIMITER: { limit: async () => ({ success: true }) } };
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  const state = { row: fixture, response: null };
  const upstream = async (url, options) => { calls.push({ url, options }); return state.response || Response.json({ Results: [state.row] }); };
  const request = (body = { vin, year: 2003 }, headers = {}, method = 'POST') => new Request('https://postiqo.io/api/tools/vin', { method, headers: { Origin: 'https://postiqo.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  return { cache, saved, pending, env, ctx, calls, state, upstream, request, run: async req => decodeVin(req || request(), env, ctx, { cache, upstream }) };
}

test('VIN lookup reuses normalized specifications, sends only one VIN, and caches by VIN and year', async () => {
  const s = setup();
  const response = await s.run(s.request({ vin: vin.toLowerCase(), year: 2003 }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  const body = await response.json();
  assert.equal(body.status, 'partial'); assert.equal(body.data.make, 'HONDA'); assert.equal(body.data.engine_displacement_l, 2.998832712);
  assert.equal(body.data.transmission, 'Automatic transmission'); assert.equal(body.raw_json, undefined);
  assert.equal(s.calls[0].url, 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/');
  assert.equal(s.calls[0].options.method, 'POST');
  assert.equal(new URLSearchParams(s.calls[0].options.body).get('data'), vin + ',2003');
  await Promise.all(s.pending); await s.run(); assert.equal(s.calls.length, 1);
  await s.run(s.request({ vin })); assert.equal(s.calls.length, 2);
});

test('invalid inputs, cross-origin requests and oversized bodies never call the provider', async () => {
  const s = setup();
  for (const body of [{}, null, [], { vin: 'invalid' }, { vin: 'I'.repeat(17) }, { vin, year: '2003' }, { vin, year: 1900 }, { vin, year: 2003.1 }, { vin, year: 9999 }]) assert.equal((await s.run(s.request(body))).status, 400);
  assert.equal((await s.run(s.request('{'))).status, 400);
  assert.equal((await s.run(s.request('x'.repeat(1025)))).status, 413);
  assert.equal((await s.run(s.request({}, { Origin: 'https://other.test' }))).status, 403);
  assert.equal((await s.run(s.request({}, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal((await s.run(s.request({}, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await s.run(s.request({}, {}, 'GET'))).status, 405);
  assert.equal(s.calls.length, 0);
});

test('rate limits fail closed and include a retry delay', async () => {
  const s = setup();
  s.env.VIN_RATE_LIMITER.limit = async () => ({ success: false });
  const limited = await s.run();
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60'); assert.equal(s.calls.length, 0);
  s.env.VIN_RATE_LIMITER.limit = async () => { throw new Error('unavailable'); };
  assert.equal((await s.run()).status, 503); assert.equal(s.calls.length, 0);
});

test('provider failures trigger a cooldown while cached successes remain available', async () => {
  const s = setup(); await s.run(); await Promise.all(s.pending);
  s.state.response = new Response('<html>unavailable</html>', { status: 503 });
  assert.equal((await s.run(s.request({ vin, year: 2004 }))).status, 503); await Promise.all(s.pending);
  assert.equal((await s.run(s.request({ vin }))).status, 503); assert.equal(s.calls.length, 2);
  assert.equal((await s.run()).status, 200); assert.equal(s.calls.length, 2);
});

test('mismatched, malformed and oversized upstream responses are rejected', async () => {
  for (const response of [Response.json({ Results: [] }), Response.json({ Results: [{ ...fixture, VIN: 'other' }] }), Response.json({ Results: [{ ...fixture, ErrorCode: null }] }), new Response('x'.repeat(65537))]) {
    const s = setup(); s.state.response = response; assert.equal((await s.run()).status, 503);
  }
});

test('provider warnings, no data and year conflicts never expose unverified specifications', async () => {
  for (const [row, status] of [[{ ...fixture, ErrorCode: '1' }, 'review'], [{ ...fixture, ErrorCode: '7,8' }, 'no_data'], [{ ...fixture, ModelYear: '2004' }, 'review']]) {
    const s = setup(); s.state.row = row; const body = await (await s.run()).json();
    assert.equal(body.status, status); assert.deepEqual(body.data, {});
  }
});
