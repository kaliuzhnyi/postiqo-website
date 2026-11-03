import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { calculateLoan, calculateLease, annualSchedule } from '../../../assets/js/vehicle-finance.mjs';

const loan = { price: 35000, down: 5000, rate: 5, months: 60, frequency: 'monthly', tax: 0 };
const lease = { price: 50000, down: 8000, trade: 5000, residual: 25000, rate: 6, factor: .0025, months: 36, tax: 6 };
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
function reconcile(r) {
  assert.equal(r.error, undefined);
  assert.equal(sum(r.rows, 'payment'), r.totalPayments);
  assert.equal(sum(r.rows, 'interest'), r.totalInterest);
  assert.equal(sum(r.rows, 'principal'), r.principal - r.residual);
  assert.equal(sum(r.components, 'value'), r.totalCash, 'breakdown equals total cash, including down payment once');
  let balance = r.principal;
  for (const row of r.rows) {
    for (const key of ['payment','principal','interest','tax','balance']) assert.ok(Number.isSafeInteger(row[key]) && row[key] >= 0, `${key}: ${row[key]}`);
    assert.equal(row.payment, row.principal + row.interest + row.tax);
    assert.equal(row.balance, balance - row.principal); balance = row.balance;
  }
  assert.equal(balance, r.residual);
  const yearly = annualSchedule(r.rows);
  for (const key of ['payment','principal','interest','tax']) assert.equal(sum(yearly,key), sum(r.rows,key));
}

test('loan golden amount and independent present-value check match Cards regular payments', () => {
  const source = readFileSync(new URL('../../../assets/js/cards-template.js', import.meta.url), 'utf8');
  const existing = runInNewContext(source + '\ncalculateVehiclePayment;', { document: { querySelector: () => null, querySelectorAll: () => [] } });
  assert.equal(calculateLoan(loan).regularPayment, 56614);
  for (const [frequency, perYear] of [['monthly',12],['biweekly',26],['weekly',52]]) for (const months of [1,23,60,120]) for (const rate of [0,.01,5,29.99]) {
    const r = calculateLoan({ ...loan, frequency, months, rate }); reconcile(r);
    const previous = existing({ price: loan.price, downPayment: loan.down, annualRate: rate, termMonths: months, frequency });
    assert.ok(Math.abs(r.exactPayment - previous.payment) < 1e-7);
    const pv = r.rows.reduce((total,row) => total + row.payment / Math.pow(1 + rate / 100 / perYear, row.months * perYear / 12), 0);
    assert.ok(Math.abs(pv - r.principal) < r.rows.length * .51 + 1, 'discounted cent-rounded payments repay the initial principal');
  }
});
test('trade-in tax allowance, negative equity, fees and upfront payment reconcile', () => {
  const r = calculateLoan({ ...loan, price: 30000, down: 5000, trade: 10000, payoff: 12000, taxableFees: 500, otherFees: 120, tax: 13 });
  assert.equal(r.salesTax, 266500); assert.equal(r.principal, 3028500); reconcile(r);
  const upfront = calculateLoan({ ...loan, price: 30000, down: 5000, trade: 10000, payoff: 12000, taxableFees: 500, otherFees: 120, tax: 13, financeCosts: false });
  assert.equal(upfront.principal, 2700000); assert.equal(upfront.upfront, 828500); reconcile(upfront);
  assert.ok(upfront.totalInterest < r.totalInterest);
  const zero = calculateLoan({ ...loan, price: 30000, down: 5000, trade: 10000, rate: 0, tax: 13 });
  assert.equal(zero.regularPayment, 29333); assert.equal(zero.totalPayments, 1760000); reconcile(zero);
});
test('extra payments shorten the schedule and cap the last payment; fully covered loans need no payments', () => {
  const base = calculateLoan(loan), extra = calculateLoan({ ...loan, extra: 200 }); reconcile(extra);
  assert.ok(extra.rows.length < base.rows.length); assert.ok(extra.finalPayment <= extra.scheduledPayment);
  assert.equal(extra.interestSaved, base.totalInterest - extra.totalInterest);
  const covered = calculateLoan({ ...loan, down: 35000 }); reconcile(covered); assert.equal(covered.rows.length,0);
  const once = calculateLoan({ ...loan, extra: 1e6 }); reconcile(once); assert.equal(once.rows.length,1);
});
test('quoted money factor gives $517.63; payment tax and upfront first payment count once', () => {
  const r = calculateLease({ ...lease, rateType: 'factor' }); reconcile(r);
  assert.equal(r.basePayment, 48833); assert.equal(r.regularPayment, 51763); assert.equal(r.totalInterest, 558000);
  assert.equal(r.upfront, 800000 + 48000 + 51763); assert.equal(r.totalCash, 848000 + r.totalPayments);
  assert.equal(r.buyout, 2650000); assert.equal(r.rows.at(-1).balance, 2500000);
  const later = calculateLease({ ...lease, rateType: 'factor', timing: 'arrears' });
  assert.equal(later.upfront, 848000); assert.equal(later.totalCash, r.totalCash);
});
test('annual lease payments satisfy independent discounted cash flow for both payment timings', () => {
  for (const timing of ['advance','arrears']) for (const rate of [0,.01,6,25]) for (const months of [1,36,120]) {
    const r = calculateLease({ ...lease, timing, rate, months }); reconcile(r);
    const monthly = rate / 1200;
    const pv = r.rows.reduce((total,row,i) => total + (row.payment - row.tax) / Math.pow(1 + monthly, i + (timing === 'advance' ? 0 : 1)), 0) + r.residual / Math.pow(1 + monthly, months);
    assert.ok(Math.abs(pv - r.principal) < months * .51 + 1, `discounted lease payments and residual: ${pv}, principal: ${r.principal}`);
  }
  const advance = calculateLease(lease), later = calculateLease({ ...lease, timing: 'arrears' });
  assert.ok(advance.regularPayment < later.regularPayment);
  const zero = calculateLease({ ...lease, rate: 0 }); assert.equal(zero.totalInterest,0); reconcile(zero);
});
test('lease rounding remains non-negative from cent-sized balances to large amounts', () => {
  for (const price of [.01,1,100,30000,999999999.99]) for (const ratio of [0,.5,1]) for (const rate of [0,.01,6,99.99]) for (const months of [1,36,120]) for (const timing of ['advance','arrears']) {
    reconcile(calculateLease({ price, down: 0, residual: Math.floor(price * ratio * 100) / 100, rate, months, tax: 13, timing }));
  }
  reconcile(calculateLease({ ...lease, fees: 995.95, upfrontFees: 125, tax: 14.975 }));
});
test('invalid financial inputs cannot produce a plausible result', () => {
  for (const change of [{price:0},{price:Infinity},{price:'35000'},{down:NaN},{down:35001},{down:-1},{rate:-1},{months:0},{months:12.5},{months:121},{tax:101},{price:3.001},{frequency:'toString'},{trade:40000},{payoff:10},{financeCosts:'false'}]) assert.ok(calculateLoan({...loan,...change}).error, JSON.stringify(change));
  for (const change of [{residual:40000},{residual:NaN},{rateType:'APR'},{rateType:'factor',factor:.1},{rateType:'factor',factor:-1},{timing:'daily'},{down:40000}]) assert.ok(calculateLease({...lease,...change}).error, JSON.stringify(change));
});
