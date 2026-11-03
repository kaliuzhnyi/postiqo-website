import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler'))('miniflare');

test('workerd performs VIN fetches and cache reuse, and rejects provider redirects', async t => {
  let calls = 0, redirect = false;
  const mf = new Miniflare({ telemetry: { enabled: false }, host: '127.0.0.1', workers: [{ config: {
    name: 'public-vin', type: 'worker', compatibilityDate: '2026-09-10',
    manifest: { mainModule: 'test.js', modulesRoot: '/', modules: {
      'test.js': { type: 'esm', contents: `import worker from './site/src/index.js';
        export default { async fetch(request) {
          const pending = [], limiter = { limit: async () => ({ success: true }) };
          const response = await worker.fetch(request, { VIN_RATE_LIMITER: limiter, VIN_PROVIDER_LIMITER: limiter }, { waitUntil(p) { pending.push(p); } });
          await Promise.all(pending); return response;
        } };` },
      'site/src/index.js': { type: 'esm', contents: await readFile(new URL('../src/index.js', import.meta.url), 'utf8') },
      'cards/src/vin.js': { type: 'esm', contents: await readFile(new URL('../../cards/src/vin.js', import.meta.url), 'utf8') },
    } },
  }, dev: { outboundService: { type: 'fetcher', handler: async request => {
    calls++;
    assert.equal(request.url, 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/');
    assert.equal(request.method, 'POST');
    assert.equal(new URLSearchParams(await request.text()).get('data'), '1HGCM82633A004352,2003');
    if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
    return Response.json({ Results: [{ VIN: '1HGCM82633A004352', ErrorCode: '0', ModelYear: '2003', Make: 'HONDA', Model: 'Accord' }] });
  } } } }] });
  t.after(() => mf.dispose());
  const run = (host = 'postiqo.test') => mf.dispatchFetch(`https://${host}/api/tools/vin`, { method: 'POST', headers: { Origin: `https://${host}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ vin: '1HGCM82633A004352', year: 2003 }) });
  const result = await run();
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).data.model, 'Accord');
  assert.equal((await run()).status, 200); assert.equal(calls, 1, 'second lookup uses real Cache API');
  redirect = true;
  assert.equal((await run('redirect.test')).status, 503); assert.equal(calls, 2, 'redirect not followed');
  assert.equal((await run('redirect.test')).status, 503); assert.equal(calls, 2, 'real cooldown cache prevents another provider request');
});
