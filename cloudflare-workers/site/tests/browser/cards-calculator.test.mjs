import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../../../../', import.meta.url);
const renderer = (await readFile(new URL('cloudflare-workers/cards/src/render.js', root), 'utf8'))
  .replace("import { urls } from '../generated/assets.js';", `const urls = {
    css: '/assets/css/cards-template.css', js: '/assets/js/cards-template.js',
    font: '/assets/fonts/Nunito-VariableFont_wght.ttf'
  };`);
const { renderPage, projectVehicle } = await import(`data:text/javascript;base64,${Buffer.from(renderer).toString('base64')}`);

test('Cards payment calculator works in the demo and follows live inventory', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  async function open({ live = false, price = 32995, active = true, javaScriptEnabled = true } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, javaScriptEnabled });
    const errors = [], requests = [];
    const state = { status: 200, price, active };
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      requests.push({ path: url.pathname, method: route.request().method() });
      if (url.hostname !== 'cards.test') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ status: state.status, json: state.status === 403 ? { error: 'cards_disabled' }
          : { vehicle: { price: state.price, is_active: state.active } } });
      }
      if (url.pathname === '/100/TEST') {
        return route.fulfill({ contentType: 'text/html', body: renderPage(projectVehicle({
          title: '2023 Toyota RAV4', make: 'Toyota', model: 'RAV4', year: 2023,
          price, is_active: active === null ? null : Number(active), photos_json: '[]',
          dealer_name: 'Test Motors', vin: '2T3P1RFV1PC000001',
        }), '/100/TEST') });
      }
      const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      try {
        const body = await readFile(new URL('.' + path, root));
        await route.fulfill({ body, contentType: {
          html: 'text/html', css: 'text/css', js: 'application/javascript',
          webp: 'image/webp', ttf: 'font/ttf', png: 'image/png', ico: 'image/x-icon',
        }[path.split('.').at(-1)] || 'application/octet-stream' });
      } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
    await page.goto(`https://cards.test${live ? '/100/TEST' : '/products/postiqo-cards/demo/'}`);
    return { page, state, errors, requests };
  }
  async function refresh(page) {
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/')),
      page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))),
    ]);
    await response.finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  await t.test('defaults, every frequency, editable values, validation, reset and keyboard controls', async () => {
    const { page, errors, requests } = await open();
    const amount = page.locator('[data-payment-amount]');
    assert.equal(await page.locator('#payment-down').inputValue(), '3299.50');
    assert.equal(await page.locator('#payment-rate').inputValue(), '7.99');
    assert.equal(await page.locator('#payment-term').inputValue(), '60');
    assert.equal(await page.locator('#payment-province').inputValue(), 'ON');
    assert.equal(await page.locator('#payment-tax-rate').inputValue(), '13');
    assert.equal(await page.locator('[data-payment-tax]').innerText(), '$4,289.35');
    assert.equal(await page.locator('[data-payment-principal]').innerText(), '$33,984.85');
    const monthly = await amount.innerText();
    assert.match(monthly, /^\$[\d,]+\.\d{2}$/);
    await page.getByText('Bi-weekly', { exact: true }).click();
    assert.match(await page.locator('[data-payment-schedule]').innerText(), /^130 bi-weekly/);
    assert.notEqual(await amount.innerText(), monthly);
    await page.getByRole('radio', { name: 'Bi-weekly' }).press('ArrowRight');
    assert.equal(await page.getByRole('radio', { name: 'Weekly', exact: true }).isChecked(), true);
    assert.match(await page.locator('[data-payment-schedule]').innerText(), /^260 weekly/);
    await page.locator('#payment-tax-rate').fill('0');
    await page.locator('#payment-down').fill('6995');
    await page.locator('#payment-rate').fill('0');
    await page.locator('#payment-term').selectOption('12');
    assert.equal(await amount.innerText(), '$500.00');
    assert.equal(await page.locator('[data-payment-interest]').innerText(), '$0.00');
    await page.locator('#payment-down').fill('32995');
    assert.equal(await amount.innerText(), '$0.00');
    assert.match(await page.locator('[data-payment-schedule]').innerText(), /Fully covered/);
    for (const [id, values] of [['payment-down', ['', '-1', '40000', '1.001']], ['payment-rate', ['', '-1', '101', '2.001']], ['payment-tax-rate', ['', '-1', '101', '14.9751']]]) {
      for (const value of values) {
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.locator(`#${id}`).fill(value);
        assert.equal(await page.locator('[data-payment-result]').isVisible(), false, `${id}: ${value}`);
        assert.equal(await page.locator('#payment-error').isVisible(), true);
        assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true');
      }
    }
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await amount.innerText(), monthly);
    assert.equal(await page.locator('#payment-error').isVisible(), false);
    await page.locator('#payment-rate').press('Enter');
    assert.match(page.url(), /\/products\/postiqo-cards\/demo\/$/);
    await page.getByRole('button', { name: 'Next photo', exact: true }).click();
    assert.equal(await page.locator('[data-photo-number]').innerText(), '2');
    assert.equal(requests.some(request => request.path.startsWith('/api/') || request.method !== 'GET'), false);
    assert.deepEqual(errors, []);
    await page.close();
  });

  await t.test('live price updates preserve edited inputs and handle unavailable inventory', async () => {
    const { page, state, errors } = await open({ live: true });
    state.price = 40000;
    await refresh(page);
    assert.equal(await page.locator('#payment-down').inputValue(), '4000.00');
    await page.locator('#payment-down').fill('5000');
    await page.locator('#payment-rate').fill('6.25');
    await page.locator('#payment-term').selectOption('72');
    await page.getByText('Bi-weekly', { exact: true }).click();
    state.price = 30000;
    await refresh(page);
    assert.equal(await page.locator('#payment-down').inputValue(), '5000');
    assert.equal(await page.locator('#payment-rate').inputValue(), '6.25');
    assert.equal(await page.locator('#payment-term').inputValue(), '72');
    assert.equal(await page.getByRole('radio', { name: 'Bi-weekly' }).isChecked(), true);
    assert.equal(await page.locator('[data-payment-principal]').innerText(), '$28,900.00');
    state.price = 4000;
    await refresh(page);
    assert.equal(await page.locator('#payment-error').isVisible(), true);
    assert.equal(await page.locator('[data-payment-result]').isVisible(), false);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await page.locator('#payment-down').inputValue(), '400.00');
    for (const values of [{ price: null }, { price: 0 }, { price: 32995, active: false }, { status: 404 }]) {
      Object.assign(state, values);
      await refresh(page);
      assert.equal(await page.locator('[data-payment-calculator]').isVisible(), false);
    }
    Object.assign(state, { status: 200, price: 32995, active: true });
    await refresh(page);
    assert.equal(await page.locator('[data-payment-calculator]').isVisible(), true);
    state.status = 503;
    await refresh(page);
    assert.equal(await page.locator('[data-refresh-note]').isVisible(), true);
    assert.equal(await page.locator('[data-payment-calculator]').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.close();
  });

  await t.test('no estimate appears for missing prices or inactive vehicles, and it can appear after refresh', async () => {
    for (const options of [{ price: null }, { price: 0 }, { active: false }]) {
      const { page, state } = await open({ live: true, ...options });
      assert.equal(await page.locator('[data-payment-calculator]').isVisible(), false);
      Object.assign(state, { price: 20000, active: true });
      await refresh(page);
      await page.locator('[data-payment-calculator]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#payment-down').inputValue(), '2000.00');
      await page.close();
    }
    const { page } = await open({ javaScriptEnabled: false });
    assert.equal(await page.locator('[data-payment-calculator]').isVisible(), false);
    assert.equal(await page.locator('[data-price]').innerText(), '$32,995');
    await page.close();
  });

  await t.test('province presets, manual tax rates and arbitrary month counts recalculate the estimate', async () => {
    const { page, errors } = await open();
    for (const [province, taxRate] of [['ON', '13'], ['AB', '5'], ['BC', '12'], ['MB', '12'], ['NB', '15'],
      ['NL', '15'], ['NT', '5'], ['NS', '14'], ['NU', '5'], ['PE', '15'], ['QC', '14.975'], ['SK', '11'], ['YT', '5']]) {
      await page.locator('#payment-province').selectOption(province);
      assert.equal(await page.locator('#payment-tax-rate').inputValue(), taxRate, province);
      assert.equal(await page.locator('[data-tax-note]').isVisible(), province === 'BC');
      assert.equal(await page.locator('[data-payment-tax-included]').innerText(), `Including ${taxRate}% sales tax`);
    }
    await page.locator('#payment-province').selectOption('ON');
    await page.locator('#payment-tax-rate').fill('12.5');
    assert.equal(await page.locator('#payment-province').inputValue(), 'custom');
    assert.equal(await page.locator('[data-payment-tax]').innerText(), '$4,124.38');
    await page.locator('#payment-down').fill('37119.38');
    assert.equal(await page.locator('[data-payment-amount]').innerText(), '$0.00');
    await page.locator('#payment-down').fill('0');
    await page.locator('#payment-tax-rate').fill('0');
    await page.locator('#payment-rate').fill('0');
    await page.locator('#payment-term').selectOption('custom');
    assert.equal(await page.locator('#payment-months').isVisible(), true);
    await page.locator('#payment-months').fill('20');
    assert.equal(await page.locator('[data-payment-amount]').innerText(), '$1,649.75');
    assert.equal(await page.locator('[data-payment-schedule]').innerText(), '20 monthly payments over 20 months');
    await page.locator('#payment-months').fill('23');
    assert.equal(await page.locator('[data-payment-amount]').innerText(), '$1,434.57');
    await page.getByText('Bi-weekly', { exact: true }).click();
    assert.equal(await page.locator('[data-payment-schedule]').innerText(), '50 payments over 23 months');
    assert.equal(await page.locator('[data-payment-final]').isVisible(), true);
    for (const invalid of ['', '0', '-1', '20.5', '121']) {
      await page.locator('#payment-months').fill(invalid);
      assert.equal(await page.locator('[data-payment-result]').isVisible(), false, invalid);
      assert.equal(await page.locator('#payment-months').getAttribute('aria-invalid'), 'true');
    }
    await page.locator('#payment-term').selectOption('60');
    assert.equal(await page.locator('#payment-months').isVisible(), false);
    assert.equal(await page.locator('[data-payment-result]').isVisible(), true);
    assert.equal(await page.locator('[data-payment-final]').isVisible(), false);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await page.locator('#payment-province').inputValue(), 'ON');
    assert.equal(await page.locator('#payment-tax-rate').inputValue(), '13');
    assert.equal(await page.locator('#payment-term').inputValue(), '60');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await t.test('desktop, tablet and phone layouts fit the screen', async () => {
    const { page, errors } = await open();
    const artifacts = new URL('cloudflare-workers/cards/artifacts/', root);
    await mkdir(artifacts, { recursive: true });
    assert.equal(await page.locator('[data-payment-amount]').evaluate(element => getComputedStyle(element).color),
      await page.locator('[data-price]').evaluate(element => getComputedStyle(element).color));
    await page.locator('#payment-down').click();
    assert.equal(await page.locator('#payment-down').evaluate(element => getComputedStyle(element).outlineStyle), 'auto');
    assert.equal(await page.locator('.payment-input-prefix').evaluate(element => getComputedStyle(element).borderStyle), 'none');
    assert.ok(await page.locator('#payment-term').evaluate(element => parseFloat(getComputedStyle(element).paddingRight) >= 32));
    for (const width of [1280, 950, 768, 701, 540, 390, 320]) {
      await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`);
      const bounds = await page.locator('[data-payment-calculator]').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `calculator bounds at ${width}px`);
      if ([1280, 390, 320].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`payment-${width}.png`, artifacts)), fullPage: true });
      await page.locator('#payment-term').selectOption('custom');
      await page.locator('#payment-months').fill('23');
      await page.locator('#payment-province').selectOption('QC');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `custom inputs overflow at ${width}px`);
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
});
