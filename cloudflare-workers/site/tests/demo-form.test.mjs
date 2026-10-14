import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = new URL('../../../', import.meta.url);
const names = {publisher: 'Postiqo Publisher', cards: 'Postiqo Digital Cards', website: 'Postiqo Website', pages: 'Postiqo Pages'};

test('demo forms, product CTAs, quote requests and trial isolation in a browser', async t => {
  const browser = await chromium.launch({headless: true});
  t.after(() => browser.close());
  async function open(path, options = {}) {
    const page = await browser.newPage({viewport: options.viewport || {width: 1280, height: 1000}});
    const posts = [], errors = [];
    const state = {status: 201, response: {ok: true}, token: 'local-test-token', ...options};
    page.on('pageerror', error => errors.push(error.message));
    // All network traffic is intercepted. No production leads, trial requests,
    // Cloudflare verification calls or email notifications can leave this test.
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'licensing.postiqo.io') {
        if (url.pathname.endsWith('/trial-config')) return route.fulfill({json: {ok: true, site_key: 'local-test-key'}});
        assert.equal(url.pathname, '/v1/public/demo-requests');
        assert.equal(request.method(), 'POST');
        assert.equal(request.headers()['content-type'], 'application/json');
        posts.push(request.postDataJSON());
        if (state.networkFailure) return route.abort('failed');
        return route.fulfill({status: state.status, json: state.response});
      }
      if (url.hostname === 'challenges.cloudflare.com') return route.fulfill({contentType: 'application/javascript', body: `
        window.testToken = ${JSON.stringify(state.token)};
        window.turnstile = {
          render(element, options) { window.verificationOptions = options; options.callback(); return 'local-widget'; },
          getResponse() { return window.testToken; },
          reset() { window.resetCount = (window.resetCount || 0) + 1; window.verificationOptions.callback(); }
        };`});
      if (url.hostname !== 'postiqo.io') return route.abort();
      const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      try {
        const body = await readFile(new URL('.' + path, root));
        const extension = path.split('.').at(-1);
        await route.fulfill({body, contentType: {html:'text/html', js:'application/javascript', css:'text/css', png:'image/png', svg:'image/svg+xml', webp:'image/webp', woff2:'font/woff2'}[extension] || 'application/octet-stream'});
      } catch { await route.fulfill({status: 404, body: 'Not found'}); }
    });
    await page.goto('https://postiqo.io' + path);
    if (await page.locator('.demo-form').count()) await page.waitForFunction(() => window.verificationOptions);
    return {page, posts, state, errors};
  }
  async function fill(page) {
    await page.locator('[name="name"]').fill('Demo Visitor');
    await page.locator('[name="email"]').fill('visitor@example.test');
    await page.locator('[name="dealership"]').fill('Example Business');
  }
  async function submit(page) {
    await page.locator('.demo-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('.demo-form').hasAttribute('aria-busy'));
  }

  for (const path of ['/', '/demo/']) {
    for (const [product, name] of Object.entries(names)) {
      await t.test(`${path} submits ${product} without a website or free-text message`, async () => {
        const {page, posts, errors} = await open(`${path}?product=${product}`);
        assert.equal(await page.locator('[name="product"]').inputValue(), product);
        assert.equal(await page.locator('textarea:visible').count(), 0);
        await fill(page);
        await submit(page);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].message, `${name} - Demo Request`);
        assert.equal(posts[0].website, '');
        assert.equal(posts[0].turnstile_token, 'local-test-token');
        assert.match(posts[0].request_id, /^[a-f0-9-]{36}$/);
        assert.equal(posts[0].facebook_user_id, undefined);
        assert.equal(posts[0].project_details, undefined);
        assert.equal(await page.evaluate(() => window.verificationOptions.action), 'demo_request');
        assert.equal(await page.locator('.sent-message').isVisible(), true);
        assert.match(await page.locator('.sent-message').innerText(), new RegExp(name));
        assert.equal(await page.locator('[name="product"]').inputValue(), product);
        assert.deepEqual(errors, []);
        await page.close();
      });
    }
  }
  await t.test('required fields, email and website validation; changing the default product', async () => {
    const {page, posts} = await open('/demo/?product=unknown');
    assert.equal(await page.locator('[name="product"]').inputValue(), 'publisher');
    await submit(page);
    assert.equal(posts.length, 0);
    await fill(page);
    await page.locator('[name="name"]').fill('   ');
    await submit(page);
    assert.equal(posts.length, 0);
    await fill(page);
    await page.locator('[name="email"]').fill('invalid');
    await submit(page);
    assert.equal(posts.length, 0);
    await fill(page);
    for (const website of ['not-a-website', 'ftp://example.test', 'https://user:password@example.test']) {
      await page.locator('[name="website"]').fill(website);
      await submit(page);
      assert.equal(posts.length, 0);
      assert.equal(await page.locator('[name="website"]').getAttribute('aria-invalid'), 'true');
    }
    await page.locator('[name="website"]').fill('example.test');
    await page.locator('[name="product"]').selectOption('cards');
    assert.equal(await page.locator('.demo-website-emphasis').count(), 1);
    await submit(page);
    assert.equal(posts[0].website, 'https://example.test/');
    assert.equal(posts[0].message, 'Postiqo Digital Cards - Demo Request');
    await page.close();
  });
  for (const product of ['website', 'pages']) {
    for (const path of ['/', '/demo/']) await t.test(`${product} quote works on ${path}, including legacy links`, async () => {
      const {page, posts} = await open(`${path}?product=${product}&request=quote#contact`);
      assert.equal(await page.locator('.demo-form button[type="submit"]').innerText(), 'Request a Quote');
      await fill(page);
      await page.locator('[name="project_details"]').fill('Please discuss my custom project.');
      await submit(page);
      assert.equal(posts[0].message, `${names[product]} - Quote Request\n\nPlease discuss my custom project.`);
      assert.match(await page.locator('.sent-message').innerText(), /quote request/);
      await page.locator('[name="product"]').selectOption('publisher');
      assert.equal(await page.locator('textarea:visible').count(), 0);
      assert.equal(await page.locator('.demo-form button[type="submit"]').innerText(), 'Request a Demo');
      await page.close();
    });
  }
  await t.test('failure retains input and request ID; duplicate receipt confirms saved lead', async () => {
    const {page, posts, state} = await open('/demo/?product=pages', {status: 403, response: {ok: false, error: 'origin_rejected'}});
    await fill(page);
    await submit(page);
    assert.equal(await page.locator('.sent-message').isVisible(), false);
    assert.equal(await page.locator('[name="name"]').inputValue(), 'Demo Visitor');
    assert.match(await page.locator('.error-message').innerText(), /details are still here/);
    state.status = 200; state.response = {ok: false};
    await submit(page);
    assert.equal(await page.locator('.sent-message').isVisible(), false);
    assert.equal(posts[0].request_id, posts[1].request_id);
    state.networkFailure = true;
    await submit(page);
    assert.equal(await page.locator('.sent-message').isVisible(), false);
    assert.equal(posts[0].request_id, posts[2].request_id);
    state.networkFailure = false; state.response = {ok: true, duplicate: true};
    await submit(page);
    assert.equal(posts[0].request_id, posts[3].request_id);
    assert.match(await page.locator('.sent-message').innerText(), /Postiqo Pages demo request is already/);
    await page.close();
  });
  await t.test('editing the selected product after a failure creates a new request ID', async () => {
    const {page, posts} = await open('/demo/', {status: 503, response: {ok: false, error: 'service_unavailable'}});
    await fill(page); await submit(page);
    await page.locator('[name="product"]').selectOption('website');
    await submit(page);
    assert.notEqual(posts[0].request_id, posts[1].request_id);
    assert.equal(posts[1].message, 'Postiqo Website - Demo Request');
    await page.close();
  });
  await t.test('Turnstile requires a token and rate-limit errors preserve contact details', async () => {
    const {page, posts} = await open('/demo/', {token: '', status: 429, response: {ok: false, error: 'rate_limited'}});
    await fill(page); await submit(page);
    assert.equal(posts.length, 0);
    assert.match(await page.locator('.error-message').innerText(), /complete the verification/);
    await page.evaluate(() => { window.testToken = 'verified'; });
    await submit(page);
    assert.match(await page.locator('.error-message').innerText(), /Too many requests/);
    assert.equal(await page.locator('[name="email"]').inputValue(), 'visitor@example.test');
    await page.close();
  });
  for (const product of Object.keys(names)) await t.test(`${product} demo CTA selects the right product`, async () => {
    const {page} = await open(`/products/postiqo-${product}/`);
    await page.locator(`a[href="/demo/?product=${product}"]`).first().click();
    assert.equal(await page.locator('[name="product"]').inputValue(), product);
    await page.close();
  });
  await t.test('Publisher retains self-service and mobile forms fit at 360px', async () => {
    const {page} = await open('/products/postiqo-publisher/');
    assert.equal((await page.locator('.hero-buttons a').first().innerText()).trim(), 'Request a Demo');
    await page.locator('.hero-buttons a[href="/try/"]').click();
    assert.match(await page.locator('main').innerText(), /7-day/);
    assert.ok(await page.locator('a[href="/download/"]').count());
    await page.close();
    for (const width of [320, 360, 1280]) {
      const {page} = await open('/demo/?product=cards', {viewport: {width, height: 1000}});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => window.verificationOptions.size), width < 360 ? 'compact' : 'flexible');
      if (process.env.DEMO_SCREENSHOTS) {
        await mkdir(process.env.DEMO_SCREENSHOTS, {recursive: true});
        await page.screenshot({path: `${process.env.DEMO_SCREENSHOTS}/demo-${width}.png`, fullPage: true});
      }
      await page.close();
    }
  });
});
