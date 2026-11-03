(() => {
  'use strict';
  const form = document.querySelector('#loan-form');
  if (!form) return;
  const field = name => form.elements.namedItem(name);
  const get = name => Number(field(name).value);
  const output = id => document.getElementById('loan-' + id);
  const money = amount => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
  let timer;
  function render() {
    const price = get('price'), down = get('down'), trade = get('trade'), tax = get('tax');
    let message = '';
    for (const input of form.querySelectorAll('input[type=number]')) {
      const invalid = !input.validity.valid || input.value.trim() === '';
      input.setAttribute('aria-invalid', String(invalid));
      if (invalid && !message) message = 'Check ' + form.querySelector(`label[for="${input.id}"]`).textContent.toLowerCase() + ': enter a number within the allowed range.';
    }
    if (!message && trade > price) {
      message = 'Trade-in value cannot exceed the vehicle price in this estimate.';
      field('trade').setAttribute('aria-invalid', 'true');
    }
    const balance = Math.round((price - trade) * 100) / 100;
    const salesTax = Math.round(balance * tax) / 100;
    const maxDown = Math.round((balance + salesTax) * 100) / 100;
    if (!message && down > maxDown) {
      message = `Down payment cannot exceed ${money(maxDown)} after trade-in and tax.`;
      field('down').setAttribute('aria-invalid', 'true');
    }
    // Reuse the Cards calculation with the price after the personal trade-in.
    // A trade-in covering the entire price has no loan to amortize.
    const result = message ? null : balance === 0 ? { payment: 0, principal: 0, salesTax: 0, totalInterest: 0, totalPayments: 0, partialPeriod: 0 }
      : calculateVehiclePayment({ price: balance, downPayment: down, annualRate: get('rate'), termMonths: get('months'), frequency: field('frequency').value, taxRate: tax });
    if (!message && !result) message = 'Check the price, down payment, interest rate and loan term.';
    output('error').textContent = message;
    output('error').hidden = !message;
    output('result').hidden = !!message;
    output('placeholder').hidden = !message;
    output('placeholder').textContent = 'Your estimate will appear here once the highlighted details are corrected.';
    const province = field('province').value;
    output('tax-note').textContent = 'Tax is estimated on the price minus a personal, lien-free trade-in. Cash down reduces the loan, not the tax.'
      + (province === 'BC' ? ' B.C. vehicle tax can exceed this base rate. Adjust it for your vehicle.' : province === 'QC' ? ' Quebec vehicle valuation rules may change the taxable amount. Confirm it with the dealer.' : '');
    if (!result) return;
    const frequency = field('frequency').value;
    output('amount').textContent = money(result.payment);
    output('unit').textContent = { monthly: '/ month', biweekly: '/ two weeks', weekly: '/ week' }[frequency];
    output('schedule').textContent = result.principal === 0 ? 'Fully covered. No loan needed.'
      : `${result.payments} payments over ${get('months')} months. Includes ${tax}% estimated sales tax.`;
    output('final').hidden = !result.partialPeriod || result.principal === 0;
    output('final').textContent = result.partialPeriod ? `${result.fullPayments} regular payments, then a final payment of ${money(result.finalPayment)}.` : '';
    for (const [id, key] of [['sales-tax','salesTax'],['principal','principal'],['interest','totalInterest'],['total','totalPayments']]) output(id).textContent = money(result[key]);
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => {
    if (event.target === field('tax')) field('province').value = 'custom';
    if (event.target === field('months')) field('term').value = [...field('term').options].some(o => o.value === field('months').value) ? field('months').value : 'custom';
    clearTimeout(timer); timer = setTimeout(render, 120);
  });
  form.addEventListener('change', event => {
    if (event.target === field('province') && field('province').value !== 'custom') field('tax').value = field('province').selectedOptions[0].dataset.tax;
    if (event.target === field('term')) {
      if (field('term').value !== 'custom') field('months').value = field('term').value;
      else field('months').focus();
    }
    clearTimeout(timer); render();
  });
  form.addEventListener('reset', () => { clearTimeout(timer); setTimeout(render, 0); });
  render();
})();
