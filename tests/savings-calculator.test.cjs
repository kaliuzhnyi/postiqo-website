const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimateListingWork } = require('../assets/js/savings-calculator.js');

const example = { activeListings: 50, newListings: 20, postingMinutes: 10, refreshes: 4, refreshMinutes: 2, hourlyCost: 30, reviewHours: 2, accounts: 1 };

test('worked example includes repeat work, review labour, and the subscription', () => {
  const result = estimateListingWork(example);
  assert.equal(result.manualHours, 10);
  assert.equal(result.hoursBack, 8);
  assert.equal(result.manualCost, 300);
  assert.equal(result.assistedCost, 160);
  assert.equal(result.netValue, 140);
  assert.ok(Math.abs(result.breakEvenHours - 16 / 3) < 1e-10);
});

test('five-account discount applies to the total subscription without multiplying inventory again', () => {
  assert.equal(estimateListingWork({ ...example, accounts: 4 }).subscription, 400);
  const result = estimateListingWork({ ...example, accounts: 5 });
  assert.equal(result.subscription, 450);
  assert.equal(result.manualHours, 10);
  assert.equal(result.netValue, -210);
  assert.equal(result.breakEvenHours, 17);
});

test('zero work remains a negative result when the plan and review time cost more', () => {
  const result = estimateListingWork({ ...example, activeListings: 0, newListings: 0 });
  assert.equal(result.hoursBack, -2);
  assert.equal(result.netValue, -160);
});

test('no hourly cost produces no invented break-even or cash savings', () => {
  const result = estimateListingWork({ ...example, hourlyCost: 0 });
  assert.equal(result.breakEvenHours, null);
  assert.equal(result.netValue, -100);
});

test('fractional task times and no refreshes are supported', () => {
  const result = estimateListingWork({ ...example, newListings: 12, postingMinutes: 2.5, refreshes: 0, reviewHours: 0.5 });
  assert.equal(result.manualHours, 0.5);
  assert.equal(result.hoursBack, 0);
  assert.equal(result.netValue, -100);
});
