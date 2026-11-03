// CAD estimates. Ledger rows use integer cents; only rate calculations use floats.
const cents = amount => Math.round((amount + Number.EPSILON) * 100);
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const error = (field, message) => ({ error: message, field });
const periods = { monthly: 12, biweekly: 26, weekly: 52 };

function validate(input, money, rates = ['rate', 'tax']) {
  for (const field of money) {
    const value = input[field];
    if (!Number.isFinite(value) || value < 0 || value > 1e9 || Math.abs(value * 100 - Math.round(value * 100)) > .0001) {
      return error(field, 'Enter an amount from $0 to $1 billion, using at most two decimal places.');
    }
  }
  if (input.price <= 0) return error('price', 'Enter a vehicle price greater than $0.');
  for (const field of rates) if (!Number.isFinite(input[field]) || input[field] < 0 || input[field] > 100) return error(field, 'Enter a percentage from 0 to 100.');
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 120) return error('months', 'Enter a whole number of months from 1 to 120.');
  if (input.trade > input.price) return error('trade', 'Trade-in value cannot exceed the vehicle price in this estimate.');
  return null;
}

export function periodicPayment(principal, rate, periodsInTerm, residual = 0) {
  if (rate === 0) return (principal - residual) / periodsInTerm;
  return (principal - residual) * rate / -Math.expm1(-periodsInTerm * Math.log1p(rate)) + residual * rate;
}

function loanLedger(principal, rate, months, frequency, payment, extra) {
  let balance = principal;
  const count = months * frequency / 12, rows = [];
  for (let i = 1; balance > 0 && i <= Math.ceil(count); i++) {
    const fraction = Math.min(1, count - i + 1);
    const interest = Math.round(balance * Math.expm1(fraction * Math.log1p(rate)));
    const paid = i === Math.ceil(count) ? balance + interest : Math.min(balance + interest, payment + extra);
    const repaid = paid - interest;
    balance -= repaid;
    rows.push({ number: i, months: Math.min(i, count) * 12 / frequency, payment: paid, principal: repaid, interest, tax: 0, balance });
  }
  return rows;
}

export function calculateLoan(values) {
  const input = { trade: 0, payoff: 0, taxableFees: 0, otherFees: 0, extra: 0, financeCosts: true, ...values };
  const invalid = validate(input, ['price', 'down', 'trade', 'payoff', 'taxableFees', 'otherFees', 'extra']);
  if (invalid) return invalid;
  if (!Object.hasOwn(periods, input.frequency)) return error('frequency', 'Choose a payment frequency.');
  if (typeof input.financeCosts !== 'boolean') return error('financeCosts', 'Choose whether to finance taxes and fees.');
  if (input.payoff > 0 && input.trade === 0) return error('payoff', 'Enter the value of the vehicle being traded in, or set its loan balance to $0.');
  const price = cents(input.price), trade = cents(input.trade), down = cents(input.down), payoff = cents(input.payoff);
  const fees = cents(input.taxableFees) + cents(input.otherFees);
  const salesTax = Math.round((price - trade + cents(input.taxableFees)) * input.tax / 100);
  const beforeDown = price - trade + payoff + (input.financeCosts ? fees + salesTax : 0);
  if (down > beforeDown) return error('down', 'The down payment exceeds the amount left to finance after trade-in and the selected costs.');
  const principal = beforeDown - down, frequency = periods[input.frequency], rate = input.rate / 100 / frequency;
  const exactPayment = periodicPayment(principal / 100, rate, input.months * frequency / 12);
  const regularPayment = cents(exactPayment), extra = cents(input.extra);
  const rows = loanLedger(principal, rate, input.months, frequency, regularPayment, extra);
  const baseline = extra > 0 ? loanLedger(principal, rate, input.months, frequency, regularPayment, 0) : rows;
  const totalInterest = sum(rows, 'interest'), totalPayments = sum(rows, 'payment');
  const upfront = down + (input.financeCosts ? 0 : fees + salesTax);
  return { mode: 'loan', rows, principal, salesTax, totalInterest, totalPayments, upfront,
    totalCash: upfront + totalPayments, regularPayment, scheduledPayment: rows[0]?.payment || 0, exactPayment,
    finalPayment: rows.at(-1)?.payment || 0, endMonths: rows.at(-1)?.months || 0, residual: 0,
    interestSaved: sum(baseline, 'interest') - totalInterest, paymentsSaved: baseline.length - rows.length,
    components: [
      { label: 'Vehicle after trade-in', value: price - trade, colour: '#0868cb' },
      { label: 'Trade-in loan payoff', value: payoff, colour: '#8463be' },
      { label: 'Sales tax', value: salesTax, colour: '#d89122' },
      { label: 'Fees', value: fees, colour: '#728698' },
      { label: 'Interest', value: totalInterest, colour: '#08756b' },
    ].filter(part => part.value > 0),
  };
}

export function calculateLease(values) {
  const input = { trade: 0, fees: 0, upfrontFees: 0, rateType: 'annual', factor: .0025, timing: 'advance', ...values };
  const invalid = validate(input, ['price', 'down', 'trade', 'residual', 'fees', 'upfrontFees'], input.rateType === 'factor' ? ['tax'] : ['rate', 'tax']);
  if (invalid) return invalid;
  if (!['annual', 'factor'].includes(input.rateType)) return error('rateType', 'Choose the rate format used in your lease quote.');
  if (!['advance', 'arrears'].includes(input.timing)) return error('timing', 'Choose when the monthly payment is due.');
  if (input.rateType === 'factor' && (!Number.isFinite(input.factor) || input.factor < 0 || input.factor > .05)) return error('factor', 'Enter a money factor from 0 to 0.05. For example, 0.002500.');
  const cap = cents(input.price) + cents(input.fees) - cents(input.down) - cents(input.trade), residual = cents(input.residual);
  if (cap < 0) return error('down', 'Down payment and trade-in exceed the vehicle price plus financed fees.');
  if (residual > cap) return error('residual', 'The residual value exceeds the adjusted lease amount. Check the quote or reduce the down payment or trade-in.');
  const r = input.rate / 1200, n = input.months, advance = input.timing === 'advance';
  const factorMethod = input.rateType === 'factor';
  const depreciation = (cap - residual) / n, rent = (cap + residual) * input.factor;
  const exact = factorMethod ? depreciation + rent : periodicPayment(cap, r, n, residual) / (advance ? 1 + r : 1);
  const basePayment = factorMethod ? Math.round(depreciation) + Math.round(rent) : Math.round(exact), rows = [];
  let balance = cap;
  for (let i = 1; i <= n; i++) {
    let payment, interest, principal;
    if (factorMethod) {
      principal = i === n ? balance - residual : Math.min(balance - residual, Math.round(depreciation));
      interest = Math.round(rent); payment = principal + interest;
    } else if (i === n) {
      payment = Math.round(advance ? balance - residual / (1 + r) : balance * (1 + r) - residual);
      principal = balance - residual; interest = payment - principal;
    } else {
      payment = basePayment;
      interest = Math.min(payment, Math.round((balance - (advance ? payment : 0)) * r));
      principal = payment - interest;
      // A cent-rounded payment must not reduce the remaining value below the residual.
      if (principal > balance - residual) { principal = balance - residual; payment = principal + interest; }
    }
    balance -= principal;
    const tax = Math.round(payment * input.tax / 100);
    rows.push({ number: i, months: i, payment: payment + tax, principal, interest, tax, balance });
  }
  const down = cents(input.down), downTax = Math.round(down * input.tax / 100), fees = cents(input.upfrontFees);
  const totalPayments = sum(rows, 'payment'), totalInterest = sum(rows, 'interest'), salesTax = sum(rows, 'tax') + downTax;
  const initialCash = down + downTax + fees;
  return { mode: 'lease', rows, principal: cap, residual, basePayment, regularPayment: basePayment + Math.round(basePayment * input.tax / 100),
    scheduledPayment: basePayment + Math.round(basePayment * input.tax / 100), finalPayment: rows.at(-1).payment,
    totalPayments, totalInterest, salesTax, upfront: initialCash + (advance ? rows[0].payment : 0), totalCash: initialCash + totalPayments,
    buyout: residual + Math.round(residual * input.tax / 100), endMonths: n, interestSaved: 0, paymentsSaved: 0,
    components: [
      { label: 'Depreciation in payments', value: cap - residual, colour: '#0868cb' },
      { label: 'Down payment', value: down, colour: '#8463be' },
      { label: 'Finance charges', value: totalInterest, colour: '#08756b' },
      { label: 'Sales tax', value: salesTax, colour: '#d89122' },
      { label: 'Upfront fees', value: fees, colour: '#728698' },
    ].filter(part => part.value > 0),
  };
}

export function annualSchedule(rows) {
  const years = [];
  for (const row of rows) {
    const year = Math.max(1, Math.ceil((row.months - 1e-8) / 12));
    let group = years.at(-1);
    if (group?.number !== year) { group = { number: year, payment: 0, principal: 0, interest: 0, tax: 0, balance: 0, months: 0 }; years.push(group); }
    for (const key of ['payment', 'principal', 'interest', 'tax']) group[key] += row[key];
    group.balance = row.balance; group.months = row.months;
  }
  return years;
}
