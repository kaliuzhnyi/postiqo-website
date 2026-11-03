import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../../../../', import.meta.url), artifacts = new URL('../artifacts/finance/', import.meta.url);
test('loan and lease calculator interaction, explanations, graphs and exports', async t => {
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const errors = [], dataRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') dataRequests.push(request.url()); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.hostname !== 'postiqo.io') return route.abort();
    const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    try { return route.fulfill({ body: await readFile(new URL('.' + path, root)), contentType: { html:'text/html', js:'application/javascript', mjs:'application/javascript', css:'text/css', woff2:'font/woff2', ttf:'font/ttf', png:'image/png' }[path.split('.').at(-1)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status:404, body:'Not found' }); }
  });
  const waitPayment = amount => page.waitForFunction(value => document.querySelector('#finance-payment').textContent === value && !document.querySelector('#finance-summary').hidden, amount);
  await mkdir(artifacts, { recursive: true });
  await page.goto('https://postiqo.io/tools/car-payment-calculator/'); await waitPayment('$611.71');
  await t.test('every input has detailed help; hover, click, keyboard and dismissal work', async () => {
    const missing = await page.locator('main input, main select').evaluateAll(fields => fields.filter(field => !(field.getAttribute('aria-describedby') || '').split(' ').some(id => document.getElementById(id)?.classList.contains('help-popover'))).map(field => field.id || field.name));
    assert.deepEqual(missing, []);
    const button = page.locator('[aria-controls="help-loan-price"]'), tip = page.locator('#help-loan-price');
    await button.hover(); await tip.waitFor({ state:'visible' }); assert.match(await tip.innerText(), /negotiated vehicle price/);
    await button.click(); assert.equal(await button.getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape'); await tip.waitFor({ state:'hidden' });
    await page.locator('#loan-price').click(); await button.focus(); await tip.waitFor({ state:'visible' });
    await page.keyboard.press('Enter'); await page.locator('#finance-result-label').click(); await tip.waitFor({ state:'hidden' });
    await button.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await tip.waitFor({ state:'hidden' });
    await page.locator('#tab-loan').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-lease').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home'); assert.equal(await page.locator('#tab-loan').getAttribute('aria-selected'),'true');
  });
  await t.test('three graph series reconcile with the ledger and show the selected payment split', async () => {
    assert.equal(await page.locator('#chart-balance-value').innerText(), '$30,468.28');
    assert.equal(await page.locator('#chart-principal-value').innerText(), '$431.72');
    assert.equal(await page.locator('#chart-interest-value').innerText(), '$179.99');
    assert.match(await page.locator('#finance-payment-parts').innerText(), /Principal \$431.72 \(70.6%\)/);
    assert.match(await page.locator('#finance-payment-parts').innerText(), /Interest \$179.99 \(29.4%\)/);
    await page.locator('#finance-inspect').focus(); await page.keyboard.press('End');
    assert.equal(await page.locator('#chart-principal-value').innerText(), await page.locator('#finance-principal').innerText());
    assert.equal(await page.locator('#chart-interest-value').innerText(), await page.locator('#finance-interest').innerText());
    assert.equal(await page.locator('#chart-balance-value').innerText(), '$0.00');
    await page.setViewportSize({ width:390, height:950 });
    assert.equal(await page.locator('#finance-inspect').inputValue(), '60', 'resizing preserves the inspected payment');
    await page.keyboard.press('Home'); assert.equal(await page.locator('#finance-payment-detail').isVisible(),false);
    assert.equal(await page.locator('#chart-principal-value').innerText(),'$0.00');
    await page.setViewportSize({ width:1280, height:950 });
    await page.locator('#loan-rate').fill('0'); await waitPayment('$515.00');
    assert.match(await page.locator('#finance-payment-parts').innerText(), /Principal \$515.00 \(100%\)/);
    assert.match(await page.locator('#finance-payment-parts').innerText(), /Interest \$0.00 \(0%\)/);
    await page.locator('#loan-rate').fill('100'); await page.locator('#loan-months').fill('120');
    await page.waitForFunction(()=>document.querySelector('#finance-inspect').max==='120');
    await page.locator('#finance-inspect').focus(); await page.keyboard.press('End');
    const charges=+(await page.locator('#chart-interest-value').innerText()).replace(/[$,]/g,'');
    assert.ok(charges>30900,'valid long, high-rate loans can accrue more interest than principal');
    for(const id of ['balance-line','principal-line','interest-line']) {
      const path=await page.locator('#'+id).getAttribute('d'); assert.doesNotMatch(path,/NaN|Infinity/);
      for(const match of path.matchAll(/[ML]([\d.]+),([\d.]+)/g)) assert.ok(+match[2]>=27.99&&+match[2]<=210.01, id+' stays within the chart');
    }
    await page.getByRole('button',{name:'Reset loan',exact:true}).click(); await waitPayment('$611.71');
  });
  await t.test('extra payments reduce the term; chart, annual totals and CSV reconcile', async () => {
    await page.locator('#loan-form .finance-options').evaluate(el => { el.open=true; });
    await page.locator('#loan-extra').fill('200');
    await page.locator('#finance-savings').waitFor({ state:'visible' });
    assert.match(await page.locator('#finance-savings').innerText(), /save.*interest/);
    await page.locator('.finance-schedule summary').click();
    assert.equal(await page.locator('#schedule-rows tr').count(),12);
    await page.locator('#schedule-next').click(); assert.equal(await page.locator('#schedule-page').innerText(),'Page 2 of 4');
    await page.locator('[data-group="years"]').click(); assert.equal(await page.locator('#schedule-rows tr').count(),4);
    await page.locator('#finance-inspect').focus(); await page.keyboard.press('End');
    assert.match(await page.locator('#finance-inspect-result').innerText(), /\$0.00 remaining/);
    const downloading = page.waitForEvent('download'); await page.locator('#finance-download').click();
    const download = await downloading; assert.equal(download.suggestedFilename(),'postiqo-loan-schedule.csv');
    const csv = await readFile(await download.path(),'utf8');
    const lines = csv.trim().split('\r\n'), start = lines.findIndex(line => line.startsWith('"Payment","Month elapsed"'));
    const rows = lines.slice(start + 1).map(line => line.split(',').map(x => x.replaceAll('"','')));
    assert.ok(rows.length > 12); assert.equal(rows.at(-1).at(-1),'0.00');
    const total = rows.reduce((s,row)=>s+Math.round(+row[2]*100),0);
    const visibleTotal = await page.locator('#finance-payments').innerText(); assert.equal(total,Math.round(+visibleTotal.replace(/[$,]/g,'')*100));
    for(const row of rows) assert.equal(Math.round(+row[2]*100),Math.round(+row[3]*100)+Math.round(+row[4]*100));
    await page.locator('#loan-price').fill(''); await page.locator('#loan-error').waitFor({ state:'visible' });
    assert.equal(await page.locator('#finance-timeline').isVisible(),false);
    await page.getByRole('button',{name:'Reset loan',exact:true}).click(); await waitPayment('$611.71');
  });
  await t.test('lease methods use the quote, preserve loan inputs and separate optional buyout', async () => {
    await page.locator('#loan-down').fill('4000'); await page.locator('#tab-lease').click();
    await page.locator('#lease-price').fill('50000'); await page.locator('#lease-down').fill('8000'); await page.locator('#lease-residual').fill('25000');
    await page.locator('#lease-form .finance-options').evaluate(el=>{el.open=true;});
    await page.locator('#lease-trade').fill('5000'); await page.locator('#lease-tax').fill('6');
    await waitPayment('$516.89');
    await page.locator('#lease-rateType').selectOption('factor'); await waitPayment('$517.63');
    assert.equal(await page.locator('#lease-rate').isVisible(),false); assert.equal(await page.locator('#lease-factor').isVisible(),true);
    assert.equal(await page.locator('#finance-buyout').innerText(),'$26,500.00');
    assert.equal(await page.locator('#finance-upfront').innerText(),'$8,997.63');
    assert.equal(await page.locator('#finance-total').innerText(),'$27,114.81');
    await page.locator('#finance-inspect').focus(); await page.keyboard.press('End');
    assert.match(await page.locator('#finance-inspect-result').innerText(), /\$25,000.00 unpaid value/);
    assert.equal(await page.locator('#chart-principal-value').innerText(), '$12,000.00');
    assert.equal(await page.locator('#chart-interest-value').innerText(), '$5,580.00');
    assert.match(await page.locator('#finance-payment-parts').innerText(), /Tax \$29.31/);
    assert.match(await page.locator('#chart-principal-label').innerText(), /Depreciation/);
    await page.locator('#lease-timing').selectOption('arrears'); assert.equal(await page.locator('#finance-upfront').innerText(),'$8,480.00');
    assert.equal(await page.locator('#finance-total').innerText(),'$27,114.81');
    await page.locator('#lease-factor').fill('6'); await page.locator('#lease-error').waitFor({state:'visible'});
    await page.locator('#lease-rateType').selectOption('annual'); await page.locator('#finance-summary').waitFor({state:'visible'});
    assert.equal(await page.locator('#lease-error').isVisible(),false,'disabled money factor does not invalidate annual interest');
    await page.locator('#tab-loan').click(); assert.equal(await page.locator('#loan-down').inputValue(),'4000');
    await page.locator('#tab-lease').click(); assert.equal(await page.locator('#lease-price').inputValue(),'50000');
    await page.getByRole('button',{name:'Reset lease',exact:true}).click();
    await page.locator('#lease-price').evaluate(el=>el.blur());
    await page.waitForFunction(()=>document.querySelector('#lease-price').value==='30000');
  });
  await t.test('mobile help stays in view; estimates remain accessible and layouts fit', async () => {
    for(const mode of ['loan','lease']) {
      await page.locator('#tab-'+mode).click();
      for(const width of [1280,900,768,390,320]) {
        await page.setViewportSize({width,height:950});
        await page.locator('#'+mode+'-price').scrollIntoViewIfNeeded();
        const button=page.locator('[aria-controls="help-'+mode+'-price"]'); await button.click();
        const bounds=await page.locator('#help-'+mode+'-price').boundingBox();
        assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=950,`help bounds ${mode}/${width}`);
        await page.keyboard.press('Escape');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${mode}/${width}`);
        if([1280,390].includes(width)) {
          await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:fileURLToPath(new URL(`${mode}-${width}.png`,artifacts)),fullPage:true});
          await page.locator('#finance-timeline').screenshot({path:fileURLToPath(new URL(`${mode}-schedule-${width}.png`,artifacts))});
        }
      }
    }
    await page.setViewportSize({width:390,height:700});
    await page.locator('#lease-price').scrollIntoViewIfNeeded(); await page.locator('#finance-jump').waitFor({state:'visible'});
    await page.locator('#finance-jump').click(); assert.equal(await page.locator('#finance-summary').evaluate(el=>el===document.activeElement),true);
  });
  assert.deepEqual(errors,[]); assert.deepEqual(dataRequests,[],'financial inputs never leave the browser');
});
