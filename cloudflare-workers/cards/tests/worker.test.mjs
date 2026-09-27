import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, VIN, insertVehicle } from './fixture.mjs';
import { assets, urls } from '../generated/assets.js';

let mf, db;
before(async () => { ({ mf, db } = await createRuntime()); });
after(async () => { await mf?.dispose(); });
const get = (path, options) => mf.dispatchFetch(`https://cards.postiqo.io${path}`, options);

test('QR URL returns a complete server-rendered card, without a brand header', async () => {
  const response = await get(`/100/${VIN}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const value of ['2018 BMW 3 Series', '$12,888', 'CAD', '181,913 km', '4-cylinder', 'Automatic transmission', 'Black', 'Example Motors', VIN, 'Powered by']) assert.ok(html.includes(value), value);
  assert.match(html, /<footer class="footer">Powered by <a href="https:\/\/postiqo\.io\/products\/postiqo-cards\/"[^>]*>Postiqo Cards<\/a><\/footer>/);
  assert.doesNotMatch(html, /<header|PRIVATE-INVENTORY|private-content-hash|<script[^>]*>[^<]+<\/script>/);
  assert.match(html, /<div class="description">[\s\S]*power sunroof/);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
});

test('same VIN is scoped to the correct dealer and an absent dealer is not found', async () => {
  const first = await (await get(`/api/100/${VIN}`)).json();
  const second = await (await get(`/api/101/${VIN}`)).json();
  assert.equal(first.vehicle.price, 12888);
  assert.equal(second.vehicle.price, 25900);
  assert.equal(second.vehicle.dealer_name, 'Second Dealer');
  assert.equal((await get(`/102/${VIN}`)).status, 404);
  assert.equal((await get(`/api/102/${VIN}`)).status, 404);
  assert.doesNotMatch(JSON.stringify(first), /inventory_key|vehicle_key|content_hash|license|PRIVATE|dealer_id/);
});

test('price updates are read immediately, even without changing the record timestamp', async () => {
  await db.prepare('UPDATE inventory SET price = 11995.5 WHERE dealer_id = 100').run();
  const response = await get(`/api/100/${VIN}`);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal((await response.json()).vehicle.price, 11995.5);
  assert.match(await (await get(`/100/${VIN}`)).text(), /\$11,995\.50/);
  await db.prepare('UPDATE inventory SET price = 12888 WHERE dealer_id = 100').run();
});

test('invalid routes, unsafe IDs and VINs, methods and URL casing are handled', async () => {
  for (const path of ['/', '/100', `/99/${VIN}`, `/9007199254740992/${VIN}`, '/100/IIIIIIIIIIIIIIIII', `/100/${VIN}/extra`, '/api/inventory', '/assets/missing.css']) {
    assert.equal((await get(path)).status, 404, path);
  }
  const redirect = await get(`/100/${VIN.toLowerCase()}/`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), `/100/${VIN}`);
  const post = await get(`/100/${VIN}`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  const head = await get(`/100/${VIN}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('missing price, missing photos and unknown or inactive status are honest', async () => {
  await db.prepare('UPDATE inventory SET price = NULL, is_active = NULL WHERE dealer_id = 100').run();
  let html = await (await get(`/100/${VIN}`)).text();
  assert.match(html, /Contact for price/);
  assert.match(html, /Photos coming soon/);
  assert.match(html, /Check availability/);
  assert.doesNotMatch(html, /class="lightbox"/);
  await db.prepare('UPDATE inventory SET price = 0, is_active = 0 WHERE dealer_id = 100').run();
  html = await (await get(`/100/${VIN}`)).text();
  assert.match(html, /No longer listed/);
  assert.match(html, /data-price-panel hidden/);
  assert.doesNotMatch(html, /Sold|\$0/);
  await db.prepare('UPDATE inventory SET price = 12888, is_active = 1 WHERE dealer_id = 100').run();
});

test('stored markup and dangerous URLs cannot execute, and photo order is preserved', async () => {
  const badVin = '1HGCM82633A123456';
  await insertVehicle(db, 100, { vin: badVin, make: '<script>alert(1)</script>',
    description: '<img src=x onerror="alert(1)">\nFull description & more.',
    video: 'javascript:alert(1)', photos_json: JSON.stringify([
      'https://example.com/2.jpg', 'javascript:alert(1)', 'https://example.com/1.jpg',
      'https://example.com/2.jpg', 'https://user:password@example.com/private.jpg', 'http://example.com/3.jpg',
    ]) });
  const html = await (await get(`/100/${badVin}`)).text();
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /javascript:|user:password|<img src=x|<script>alert/);
  const { vehicle } = await (await get(`/api/100/${badVin}`)).json();
  assert.deepEqual(vehicle.photos, ['https://example.com/2.jpg', 'https://example.com/1.jpg', 'https://example.com/3.jpg']);
  assert.equal(vehicle.video, '');
});

test('versioned assets are complete and cached; unknown assets never return HTML as CSS', async () => {
  for (const [path, asset] of Object.entries(assets)) {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), asset.type);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'), asset.body);
  }
  const css = await (await get(urls.css)).text();
  assert.ok(css.includes(urls.font));
  assert.ok(!css.includes('__FONT_URL__'));
  assert.match(await (await get('/robots.txt')).text(), /Disallow: \//);
});

test('deleting a vehicle returns 404, while a database outage returns 503 without internals', async () => {
  await db.prepare('DELETE FROM inventory WHERE dealer_id = 101').run();
  assert.equal((await get(`/api/101/${VIN}`)).status, 404);
  await db.prepare('ALTER TABLE inventory RENAME TO inventory_unavailable').run();
  try {
    const response = await get(`/100/${VIN}`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '30');
    assert.doesNotMatch(await response.text(), /SQLITE|D1_ERROR|SELECT|no such table/);
    const api = await get(`/api/100/${VIN}`);
    assert.equal(api.status, 503);
    assert.deepEqual(await api.json(), { error: 'temporarily_unavailable' });
  } finally { await db.prepare('ALTER TABLE inventory_unavailable RENAME TO inventory').run(); }
});
