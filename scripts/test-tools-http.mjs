// Run against the local Postman simulation. Production code keeps its provider URL.
import assert from 'node:assert/strict';
import { decodeVin } from '../cloudflare-workers/site/src/index.js';
const base = process.env.VPIC_SIMULATION_URL;
if (!base) throw new Error('Set VPIC_SIMULATION_URL to the local simulation member URL.');
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('A local simulation is required.');
for (const [scenario, expected] of [['success',200],['unavailable',503],['rate-limit',503],['slow',503]]) {
  const request = new Request('https://postiqo.io/api/tools/vin', { method: 'POST', headers: { Origin:'https://postiqo.io', 'Content-Type':'application/json' }, body: JSON.stringify({vin:'1HGCM82633A004352',year:2003}) });
  const pending = [];
  const started = Date.now();
  const result = await decodeVin(request, { VIN_RATE_LIMITER:{limit:async()=>({success:true})}, VIN_PROVIDER_LIMITER:{limit:async()=>({success:true})} }, {waitUntil:p=>pending.push(p)}, {
    cache: {match:async()=>undefined,put:async()=>{}},
    upstream: (url, options) => fetch(base + new URL(url).pathname, {...options,headers:{...options.headers,'x-test-scenario':scenario}}),
  });
  await Promise.all(pending);
  assert.equal(result.status, expected, scenario);
  const body = await result.json();
  if (expected === 200) assert.equal(body.data.model, 'Accord');
  else assert.equal(body.error, 'temporarily_unavailable');
  if (scenario === 'slow') assert.ok(Date.now() - started < 8800, '8-second upstream deadline');
  console.log(`PASS real HTTP ${scenario}: ${result.status} (${Date.now()-started}ms)`);
}
