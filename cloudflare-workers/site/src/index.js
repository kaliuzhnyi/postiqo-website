import { VIN_PATTERN, normalizeDecode } from '../../cards/src/vin.js';

const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';
const headers = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex',
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
const busy = () => json({ error: 'temporarily_unavailable', message: 'The vehicle data service is busy. Please try again in a minute.' }, 503, { 'Retry-After': '60' });

async function boundedJson(stream, limit) {
  if (!stream) throw new Error('invalid_body');
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('too_large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function decodeVin(request, env, ctx, { upstream = fetch, cache = caches.default } = {}) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({ error: 'origin_not_allowed' }, 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'json_required' }, 415);
  }
  if (Number(request.headers.get('Content-Length')) > 1024) return json({ error: 'request_too_large' }, 413);
  let input;
  try { input = await boundedJson(request.body, 1024); }
  catch (error) { return json({ error: error.message === 'too_large' ? 'request_too_large' : 'invalid_json' }, error.message === 'too_large' ? 413 : 400); }
  const vin = typeof input?.vin === 'string' ? input.vin.trim().toUpperCase() : '';
  const year = input?.year ?? null;
  if (!VIN_PATTERN.test(vin) || (year !== null && (!Number.isInteger(year) || year < 1981 || year > new Date().getUTCFullYear() + 2))) {
    return json({ error: 'invalid_input', message: 'Enter a 17-character VIN without I, O or Q and a valid model year, if known.' }, 400);
  }
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if (!(await env.VIN_RATE_LIMITER.limit({ key: 'public-vin:' + ip })).success) {
      return json({ error: 'rate_limited', message: 'Too many lookups. Please wait a minute and try again.' }, 429, { 'Retry-After': '60' });
    }
    const key = new Request(`${url.origin}/api/tools/vin/cache/v1/${vin}/${year || 'auto'}`);
    const cached = await cache.match(key);
    if (cached) return new Response(cached.body, { headers });
    const cooldownKey = new Request(url.origin + '/api/tools/vin/provider-cooldown');
    if (await cache.match(cooldownKey)) return busy();
    if (!(await env.VIN_PROVIDER_LIMITER.limit({ key: 'public-vin-provider' })).success) return busy();
    let decoded;
    try {
      const response = await upstream(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ format: 'json', data: year ? `${vin},${year}` : vin }).toString(),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('provider_error'); }
      const body = await boundedJson(response.body, 64 * 1024);
      if (!Array.isArray(body.Results) || body.Results.length !== 1) throw new Error('invalid_response');
      decoded = normalizeDecode(body.Results[0], vin, year);
      for (const value of Object.values(decoded.data)) if (typeof value === 'string' && value.length > 200) throw new Error('invalid_response');
    } catch {
      ctx.waitUntil(cache.put(cooldownKey, new Response('busy', { headers: { 'Cache-Control': 'public, max-age=60' } })).catch(() => {}));
      return busy();
    }
    const body = { vin, ...decoded, source: 'NHTSA vPIC' };
    const ttl = ['complete', 'partial'].includes(decoded.status) ? 604800 : 3600;
    ctx.waitUntil(cache.put(key, json(body, 200, { 'Cache-Control': `public, max-age=${ttl}` })).catch(() => {}));
    return json(body);
  } catch { return busy(); }
}

export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/api/tools/vin') return decodeVin(request, env, ctx);
    if (path.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
