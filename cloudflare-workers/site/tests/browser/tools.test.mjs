import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../../../../', import.meta.url);
const artifacts = new URL('../artifacts/tools/', import.meta.url);
const vin = '1HGCM82633A004352';
test('public tools work on desktop and mobile, with accessible results and recovery', async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [], calls = [];
  let response = { vin, status: 'partial', data: { year: 2003, make: 'HONDA', model: 'Accord', trim: 'EX-V6', engine_displacement_l: 2.998832712, cylinders: 6, doors: 2 } }, status = 200, delay = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'postiqo.io') return route.abort();
    if (url.pathname === '/api/tools/vin') {
      calls.push(route.request().postDataJSON());
      if (delay) await new Promise(r => setTimeout(r, delay));
      return route.fulfill({ status, json: response }).catch(() => {});
    }
    const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    try {
      const body = await readFile(new URL('.' + path, root));
      return route.fulfill({ body, contentType: { html: 'text/html', js: 'application/javascript', css: 'text/css', png: 'image/png', woff2: 'font/woff2', ttf: 'font/ttf' }[path.split('.').at(-1)] || 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await mkdir(artifacts, { recursive: true });
  await t.test('catalog links and payment calculations use the existing Cards formula', async () => {
    await page.goto('https://postiqo.io/tools/');
    assert.equal(await page.locator('.tool-card').count(), 2);
    await page.getByRole('link', { name: 'Car payment calculator', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#loan-amount').textContent.length > 0);
    await page.locator('#loan-down').fill('5000'); await page.locator('#loan-trade').fill('10000'); await page.locator('#loan-rate').fill('0');
    await page.waitForFunction(() => document.querySelector('#loan-amount').textContent === '$293.33');
    assert.equal(await page.locator('#loan-sales-tax').innerText(), '$2,600.00');
    assert.equal(await page.locator('#loan-principal').innerText(), '$17,600.00');
    assert.equal(await page.locator('#loan-interest').innerText(), '$0.00');
    await page.locator('#loan-tax').fill('0'); await page.locator('#loan-down').fill('0'); await page.locator('#loan-term').selectOption('custom'); await page.locator('#loan-months').fill('23');
    await page.locator('[name=frequency][value=biweekly]').check();
    assert.equal(await page.locator('#loan-final').isVisible(), true);
    await page.locator('#loan-trade').fill('30001');
    await page.waitForFunction(() => !document.querySelector('#loan-error').hidden);
    assert.equal(await page.locator('#loan-result').isVisible(), false);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#loan-error').hidden);
    await page.locator('#loan-province').selectOption('QC'); assert.equal(await page.locator('#loan-tax').inputValue(), '14.975');
    await page.locator('#loan-province').selectOption('NS'); assert.equal(await page.locator('#loan-tax').inputValue(), '14');
    await page.locator('#loan-down').fill('');
    await page.waitForFunction(() => document.querySelector('#loan-down').getAttribute('aria-invalid') === 'true');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#loan-error').hidden);
    assert.equal(calls.length, 0, 'payment inputs never leave the browser');
  });
  await t.test('VIN validation, successful lookup, no data, errors and stale request cancellation', async () => {
    await page.goto('https://postiqo.io/tools/vin-decoder/');
    await page.locator('#vin-input').fill('INVALID'); await page.locator('#vin-submit').click();
    assert.equal(calls.length, 0); assert.equal(await page.locator('#vin-input').getAttribute('aria-invalid'), 'true');
    await page.getByRole('button', { name: 'Try an example VIN' }).click();
    await page.locator('#vin-result').waitFor({ state: 'visible' });
    assert.deepEqual(calls[0], { vin, year: 2003 });
    assert.equal(await page.locator('#vin-result-title').innerText(), '2003 HONDA Accord');
    assert.equal(await page.locator('#vin-specs section').count(), 3);
    response = { vin, status: 'review', data: {} }; await page.locator('#vin-submit').click();
    await page.waitForFunction(() => document.querySelector('#vin-message').textContent.includes('needs verification'));
    assert.equal(await page.locator('#vin-result').isVisible(), false);
    status = 429; await page.locator('#vin-submit').click();
    await page.waitForFunction(() => document.querySelector('#vin-message').textContent.includes('Too many'));
    status = 503; await page.locator('#vin-submit').click();
    await page.waitForFunction(() => document.querySelector('#vin-message').textContent.includes('temporarily unavailable'));
    status = 200; response = { vin, status: 'partial', data: { year: 2003, make: '<img src=x onerror=alert(1)>', model: 'Accord' } };
    await page.locator('#vin-submit').click(); await page.locator('#vin-result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#vin-result img').count(), 0);
    delay = 250; await page.locator('#vin-submit').click(); await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.waitForTimeout(350); assert.equal(await page.locator('#vin-result').isVisible(), false);
    assert.equal(await page.locator('#vin-input').inputValue(), ''); assert.equal(await page.locator('#vin-submit').isEnabled(), true);
    delay = 0; response = { vin, status: 'partial', data: { year: 2003, make: 'HONDA', model: 'Accord', trim: 'EX-V6', engine_displacement_l: 2.998832712, cylinders: 6, doors: 2 } };
    await page.getByRole('button', { name: 'Try an example VIN' }).click(); await page.locator('#vin-result').waitFor({ state: 'visible' });
  });
  await t.test('responsive pages and mobile navigation do not overflow', async () => {
    for (const [slug, path] of [['catalog','/tools/'],['calculator','/tools/car-payment-calculator/'],['vin','/tools/vin-decoder/']]) {
      await page.goto('https://postiqo.io' + path);
      if (slug === 'vin') { await page.getByRole('button', { name: 'Try an example VIN' }).click(); await page.locator('#vin-result').waitFor({ state: 'visible' }); }
      for (const width of [1280, 900, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug} overflow at ${width}`);
        if ([1280,390].includes(width)) { await page.evaluate(() => scrollTo(0,0)); await page.screenshot({ path: fileURLToPath(new URL(`${slug}-${width}.png`, artifacts)), fullPage: true }); }
      }
    }
    await page.locator('.site-menu-toggle').click();
    await page.locator('.site-nav a[href="/tools/"]').click();
    assert.equal(new URL(page.url()).pathname, '/tools/');
  });
  assert.deepEqual(errors, []);
});
