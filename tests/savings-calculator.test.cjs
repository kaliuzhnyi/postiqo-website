const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimateListingWork } = require('../assets/js/savings-calculator.js');

const example = { inventory: 90, hourlyCost: 20, postingMinutes: 7, removalMinutes: 1, sharingMinutes: 1, rotationDays: 7, accounts: 1 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

test('90 vehicles rotate over seven days without rounding the daily workload', () => {
  const result = estimateListingWork(example);
  closeTo(result.dailyListings, 12.857142857142857);
  closeTo(result.monthlyListings, 385.7142857142857);
  assert.equal(result.minutesPerListing, 9);
  closeTo(result.manualHours, 57.857142857142854);
  closeTo(result.manualCost, 1157.142857142857);
  assert.equal(result.subscription, 149);
  closeTo(result.netValue, 1008.142857142857);
});

test('Publisher totals keep the full per-account price for two to four accounts', () => {
  for (const [accounts, total] of [[1, 149], [2, 298], [3, 447], [4, 596], [5, 645], [6, 774]]) {
    assert.equal(estimateListingWork({ ...example, accounts }).subscription, total, `${accounts} accounts`);
  }
});

test('five-account volume pricing applies to every account without multiplying inventory again', () => {
  const result = estimateListingWork({ ...example, accounts: 5 });
  assert.equal(result.subscription, 645);
  closeTo(result.manualHours, 57.857142857142854);
  closeTo(result.netValue, 512.142857142857);
});

test('zero inventory retains the subscription and a negative difference', () => {
  const result = estimateListingWork({ ...example, inventory: 0 });
  assert.equal(result.dailyListings, 0);
  assert.equal(result.manualHours, 0);
  assert.equal(result.manualCost, 0);
  assert.equal(result.netValue, -149);
});

test('a zero hourly cost produces no labour savings', () => {
  const result = estimateListingWork({ ...example, hourlyCost: 0 });
  assert.equal(result.manualCost, 0);
  assert.equal(result.netValue, -149);
});

test('a fourteen-day rotation halves the workload without changing the subscription', () => {
  const result = estimateListingWork({ ...example, rotationDays: 14 });
  closeTo(result.manualHours, 28.928571428571427);
  assert.equal(result.subscription, 149);
});

test('publishing time can be changed from five to twenty-five minutes', () => {
  closeTo(estimateListingWork({ ...example, postingMinutes: 5 }).manualHours, 45);
  closeTo(estimateListingWork({ ...example, postingMinutes: 25 }).manualHours, 173.57142857142858);
});

test('removal and sharing each contribute once per vehicle rotation and can be disabled', () => {
  closeTo(estimateListingWork({ ...example, sharingMinutes: 0 }).manualHours, 51.42857142857143);
  closeTo(estimateListingWork({ ...example, removalMinutes: 0, sharingMinutes: 0 }).manualHours, 45);
  assert.equal(estimateListingWork({ ...example, postingMinutes: 0, removalMinutes: 0, sharingMinutes: 0 }).netValue, -149);
});

test('the visible inputs and static no-script example match the default calculation', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const page = readFileSync(join(__dirname, '../products/postiqo-publisher/index.html'), 'utf8');
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
  assert.match(section, /id="calculator-hours">57\.9 staff hours \/ month/);
  assert.doesNotMatch(section, /reviewHours|calc-review|break-even|newListings|refreshMinutes/);
});
