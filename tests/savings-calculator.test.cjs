const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimateListingWork } = require('../assets/js/savings-calculator.js');

const example = { inventory: 90, hourlyCost: 30, postingMinutes: 15, removalMinutes: 3, sharingMinutes: 2, rotationDays: 7, accounts: 1 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

test('90 vehicles rotate over seven days without rounding the daily workload', () => {
  const result = estimateListingWork(example);
  closeTo(result.dailyListings, 12.857142857142857);
  closeTo(result.monthlyListings, 385.7142857142857);
  assert.equal(result.minutesPerListing, 20);
  closeTo(result.manualHours, 128.57142857142858);
  closeTo(result.manualCost, 3857.142857142857);
  assert.equal(result.subscription, 100);
  closeTo(result.netValue, 3757.142857142857);
});

test('five-account discount applies to the total subscription without multiplying inventory again', () => {
  assert.equal(estimateListingWork({ ...example, accounts: 4 }).subscription, 400);
  const result = estimateListingWork({ ...example, accounts: 5 });
  assert.equal(result.subscription, 450);
  closeTo(result.manualHours, 128.57142857142858);
  closeTo(result.netValue, 3407.142857142857);
});

test('zero inventory retains the subscription and a negative difference', () => {
  const result = estimateListingWork({ ...example, inventory: 0 });
  assert.equal(result.dailyListings, 0);
  assert.equal(result.manualHours, 0);
  assert.equal(result.manualCost, 0);
  assert.equal(result.netValue, -100);
});

test('a zero hourly cost produces no labour savings', () => {
  const result = estimateListingWork({ ...example, hourlyCost: 0 });
  assert.equal(result.manualCost, 0);
  assert.equal(result.netValue, -100);
});

test('a fourteen-day rotation halves the workload without changing the subscription', () => {
  const result = estimateListingWork({ ...example, rotationDays: 14 });
  closeTo(result.manualHours, 64.28571428571429);
  assert.equal(result.subscription, 100);
});

test('publishing time can be changed from five to twenty-five minutes', () => {
  closeTo(estimateListingWork({ ...example, postingMinutes: 5 }).manualHours, 64.28571428571429);
  closeTo(estimateListingWork({ ...example, postingMinutes: 25 }).manualHours, 192.85714285714286);
});

test('removal and sharing each contribute once per vehicle rotation and can be disabled', () => {
  closeTo(estimateListingWork({ ...example, sharingMinutes: 0 }).manualHours, 115.71428571428571);
  closeTo(estimateListingWork({ ...example, removalMinutes: 0, sharingMinutes: 0 }).manualHours, 96.42857142857143);
  assert.equal(estimateListingWork({ ...example, postingMinutes: 0, removalMinutes: 0, sharingMinutes: 0 }).netValue, -100);
});

test('the visible inputs and static no-script example match the default calculation', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const page = readFileSync(join(__dirname, '../index.html'), 'utf8');
  const section = page.match(/<section class="calculator-section section"[\s\S]*?<\/section>/)[0];
  const mainFields = section.match(/<fieldset>[\s\S]*?<\/fieldset>/)[0];
  assert.deepEqual([...mainFields.matchAll(/<input[^>]+name="([^"]+)"/g)].map(match => match[1]), ['inventory', 'hourlyCost']);
  const attributes = [...section.matchAll(/<input\s[^>]+>/g)].map(match => Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]])));
  const defaults = Object.fromEntries(attributes.map(input => [input.name, Number(input.value)]));
  assert.deepEqual(defaults, example);
  assert.equal(attributes.find(input => input.name === 'rotationDays').min, '1');
  const result = estimateListingWork(defaults);
  for (const [id, value] of [['calculator-manual', result.manualCost], ['calculator-subscription', result.subscription], ['calculator-value', result.netValue]]) {
    assert.equal(section.match(new RegExp(`id="${id}">([^<]+)<`))[1], `C$${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(value)}`);
  }
  assert.match(section, /id="calculator-hours">128\.6 staff hours \/ month/);
  assert.doesNotMatch(section, /reviewHours|calc-review|break-even|newListings|refreshMinutes/);
});
