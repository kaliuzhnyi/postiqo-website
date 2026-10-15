import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../src/card-client.js', import.meta.url), 'utf8');
const calculate = runInNewContext(`${script}\ncalculateVehiclePayment;`, {
  document: { querySelector: () => null, querySelectorAll: () => [] },
});
const example = { price: 35000, downPayment: 5000, annualRate: 5, termMonths: 60, frequency: 'monthly' };

test('matches a $30,000 loan at 5% for 60 months and excludes the down payment from interest', () => {
  const loan = calculate(example);
  assert.equal(loan.principal, 30000);
  assert.equal(loan.payments, 60);
  assert.equal(loan.payment.toFixed(2), '566.14');
  assert.equal(loan.totalPayments.toFixed(2), '33968.22');
  assert.equal(loan.totalInterest.toFixed(2), '3968.22');
});

for (const [frequency, periods] of [['monthly', 12], ['biweekly', 26], ['weekly', 52]]) {
  test(`${frequency} payments amortize the balance over the selected term`, () => {
    const loan = calculate({ ...example, frequency });
    assert.equal(loan.payments, periods * 5);
    let balance = loan.principal, interest = 0;
    for (let i = 0; i < loan.payments; i++) {
      const accrued = balance * example.annualRate / 100 / periods;
      interest += accrued;
      balance += accrued - loan.payment;
    }
    assert.ok(Math.abs(balance) < 1e-7, `remaining balance: ${balance}`);
    assert.ok(Math.abs(interest - loan.totalInterest) < 1e-7);
  });

  test(`${frequency} handles 0% interest and a fully paid vehicle`, () => {
    const zeroRate = calculate({ ...example, frequency, annualRate: 0 });
    assert.equal(zeroRate.payment, 30000 / (periods * 5));
    assert.equal(zeroRate.totalInterest, 0);
    const covered = calculate({ ...example, frequency, downPayment: example.price });
    for (const key of ['principal', 'payment', 'totalInterest', 'totalPayments']) assert.equal(covered[key], 0);
  });
}

test('small rates, cents and longer terms remain finite without early rounding', () => {
  const tinyRate = calculate({ ...example, annualRate: 0.00000001 });
  assert.ok(Math.abs(tinyRate.payment - 500) < 0.000001);
  const loan = calculate({ ...example, price: 32995.55, downPayment: 3299.56, annualRate: 7.99, termMonths: 96, frequency: 'weekly' });
  assert.equal(loan.payments, 416);
  assert.ok(Number.isFinite(loan.payment));
  assert.equal(loan.principal.toFixed(2), '29695.99');
  assert.equal(loan.totalPayments, loan.payment * loan.payments);
  assert.ok(loan.totalInterest > 0);
});

test('invalid inputs never produce a plausible payment', () => {
  for (const invalid of [
    { price: null }, { price: 0 }, { price: -1 }, { price: Infinity }, { price: '35000' },
    { downPayment: -1 }, { downPayment: 35000.01 }, { downPayment: NaN },
    { annualRate: -1 }, { annualRate: 101 }, { annualRate: NaN },
    { termMonths: 0 }, { termMonths: 20.5 }, { termMonths: 121 },
    { taxRate: -1 }, { taxRate: 101 }, { taxRate: NaN },
    { frequency: 'semimonthly' }, { frequency: 'toString' },
  ]) assert.equal(calculate({ ...example, ...invalid }), null, JSON.stringify(invalid));
});

test('sales tax applies to the whole asking price before the down payment', () => {
  const loan = calculate({ ...example, price: 30000, downPayment: 5000, taxRate: 13 });
  assert.equal(loan.salesTax, 3900);
  assert.equal(loan.priceWithTax, 33900);
  assert.equal(loan.principal, 28900);
  assert.equal(loan.payment.toFixed(2), '545.38');
  const higherDown = calculate({ ...example, price: 30000, downPayment: 10000, taxRate: 13 });
  assert.equal(higherDown.salesTax, 3900);
  assert.equal(higherDown.principal, 23900);
  const priceOnly = calculate({ ...example, price: 30000, downPayment: 30000, taxRate: 13 });
  assert.equal(priceOnly.principal, 3900, 'tax is still financed when the down payment only covers the price');
  const covered = calculate({ ...example, price: 30000, downPayment: 33900, taxRate: 13 });
  assert.equal(covered.payment, 0);
  assert.equal(covered.totalInterest, 0);
  assert.equal(calculate({ ...example, price: 30000, downPayment: 33900.01, taxRate: 13 }), null);
});

test('Canadian tax rates keep three decimal places and tax amounts round to cents', () => {
  for (const [taxRate, amount] of [[5, 1500], [11, 3300], [12, 3600], [13, 3900], [14, 4200], [14.975, 4492.50], [15, 4500]]) {
    const loan = calculate({ ...example, price: 30000, taxRate });
    assert.equal(loan.salesTax, amount);
    assert.equal(loan.principal, 25000 + amount);
  }
  assert.equal(calculate({ ...example, price: 32995, taxRate: 13 }).salesTax, 4289.35);
  assert.equal(calculate({ ...example, price: 32995.55, taxRate: 14.975 }).salesTax, 4941.08);
});

test('custom month counts repay the balance with a real final payment, never a fractional payment count', () => {
  for (const termMonths of [1, 13, 20, 23, 60, 120]) {
    for (const [frequency, periods] of [['monthly', 12], ['biweekly', 26], ['weekly', 52]]) {
      for (const annualRate of [0, 7.99, 0.00000001]) {
        const loan = calculate({ ...example, termMonths, frequency, annualRate, taxRate: 13 });
        const rate = annualRate / 100 / periods;
        let balance = loan.principal;
        for (let i = 0; i < loan.fullPayments; i++) balance = balance * (1 + rate) - loan.payment;
        if (loan.partialPeriod) balance = balance * (1 + rate) ** loan.partialPeriod - loan.finalPayment;
        assert.ok(Math.abs(balance) < 1e-6, `${termMonths} months, ${frequency}, ${annualRate}%: ${balance}`);
        assert.equal(loan.payments, Math.ceil(termMonths * periods / 12));
        assert.ok(loan.finalPayment <= loan.payment);
        assert.equal(loan.totalPayments, loan.fullPayments * loan.payment + (loan.partialPeriod ? loan.finalPayment : 0));
      }
    }
  }
});
