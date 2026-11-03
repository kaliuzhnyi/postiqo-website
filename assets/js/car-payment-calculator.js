import { calculateLoan, calculateLease, annualSchedule } from './vehicle-finance.mjs?v=2';

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value / 100);
const shortMoney = value => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
const decimal = value => (value / 100).toFixed(2);
const text = (id, value) => { $(id).textContent = value; };
const show = (id, visible) => { $(id).hidden = !visible; };
const svg = (name, attrs) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node;
};
const forms = { loan: $('loan-form'), lease: $('lease-form') };
let mode = 'loan', result, values, grouping = 'payments', page = 0, debounce, formVisible = false, summaryVisible = false;
const pageSize = 12;
let chartWidth = 900;

function read(form) {
  const input = {};
  for (const field of form.querySelectorAll('input, select')) {
    field.removeAttribute('aria-invalid');
    if (field.disabled || (field.type === 'radio' && !field.checked)) continue;
    if (!field.validity.valid || (field.type === 'number' && field.value.trim() === '')) {
      const name = form.querySelector(`label[for="${field.id}"]`)?.textContent || 'this field';
      return { error: `Check ${name.toLowerCase()}. ${field.validationMessage || 'Enter a number.'}`, field: field.name };
    }
    input[field.name] = field.type === 'number' ? field.valueAsNumber : field.value;
  }
  if (mode === 'loan') input.financeCosts = input.financeCosts === 'finance';
  return input;
}

function prepare(form) {
  const id = form === forms.loan ? 'loan' : 'lease';
  form.querySelectorAll('[data-term]').forEach(button => button.setAttribute('aria-pressed', String(+button.dataset.term === +form.elements.months.value)));
  if (id === 'lease') {
    const factor = form.elements.rateType.value === 'factor';
    for (const name of ['rate', 'factor']) {
      const hide = name === 'rate' ? factor : !factor;
      form.elements[name].disabled = hide; form.elements[name].closest('[data-field]').hidden = hide;
    }
    text('lease-method-note', factor ? 'Monthly payments. Use the exact money factor from your quote.' : 'Monthly payments. Annual interest uses a declining balance.');
  }
  text(id + '-tax-note', id === 'loan' ? 'Tax applies after an eligible trade-in, before cash down. Check the rate for your vehicle.' : 'Tax applies to lease payments and cash down. Check the rate for your vehicle.');
}

function render() {
  clearTimeout(debounce);
  const form = forms[mode]; prepare(form); values = read(form);
  result = values.error ? values : (mode === 'loan' ? calculateLoan(values) : calculateLease(values));
  const invalid = Boolean(result.error);
  show(mode + '-error', invalid); text(mode + '-error', result.error || '');
  show('finance-summary', !invalid); show('finance-timeline', !invalid); show('finance-empty', invalid);
  mobileEstimate();
  if (invalid) {
    const field = form.elements[result.field];
    if (field?.setAttribute) { field.setAttribute('aria-invalid', 'true'); const details = field.closest('details'); if (details) details.open = true; }
    $('finance-empty').querySelector('p').textContent = 'Check the highlighted field to see your estimate.';
    return;
  }
  const lease = mode === 'lease', r = result;
  text('finance-result-label', lease ? 'Estimated lease payment' : values.extra > 0 ? 'Payment including extra' : 'Estimated loan payment');
  text('finance-payment', money(r.scheduledPayment));
  text('finance-unit', lease || values.frequency === 'monthly' ? '/ month' : values.frequency === 'biweekly' ? '/ 2 weeks' : '/ week');
  text('finance-mobile-payment', money(r.scheduledPayment) + ' ' + $('finance-unit').textContent);
  text('finance-mobile-label', lease ? 'Estimated lease payment' : 'Estimated loan payment');
  text('finance-tax-line', lease ? ` / includes ${money(r.regularPayment - r.basePayment)} tax` : values.financeCosts ? ' / taxes and fees financed' : ' / taxes and fees paid upfront');
  text('finance-schedule-note', !r.rows.length ? 'No loan needed with these amounts.' : `${r.rows.length} payments over ${Number(r.endMonths.toFixed(1))} months${lease ? (values.timing === 'advance' ? ', first payment at signing.' : ', first payment after one month.') : '.'}`);
  text('finance-principal-label', lease ? 'Adjusted lease amount' : 'Amount financed'); text('finance-principal', money(r.principal));
  text('finance-interest-label', lease ? 'Total finance charges' : 'Total interest'); text('finance-interest', money(r.totalInterest));
  text('finance-upfront-label', lease ? 'Cash due at signing' : 'Cash due upfront'); text('finance-upfront', money(r.upfront));
  text('finance-payments-label', lease ? 'Total lease payments' : 'Total loan payments'); text('finance-payments', money(r.totalPayments));
  show('finance-savings', !lease && values.extra > 0 && r.interestSaved > 0);
  text('finance-savings', `Extra payments save ${money(r.interestSaved)} in interest and ${r.paymentsSaved} payment${r.paymentsSaved === 1 ? '' : 's'}.`);
  show('finance-final', r.rows.length > 0 && r.finalPayment !== r.scheduledPayment);
  text('finance-final', `Final payment: ${money(r.finalPayment)}. The last payment settles the remaining amount after rounding${!lease && r.endMonths % 1 ? ' and any partial period' : ''}.`);
  show('finance-buyout-box', lease); text('finance-buyout', money(r.buyout || 0)); text('finance-total', money(r.totalCash));
  text('finance-cost-caption', lease ? 'Cash over the lease, before any buyout' : 'Cash over the loan, including upfront costs');
  text('finance-cost-note', lease ? 'Includes the first payment once. Trade-in value is a non-cash contribution. Optional buyout and return charges are excluded.' : 'Includes cash down once. Trade-in value is a non-cash contribution. Interest includes any extra payments selected.');
  text('finance-disclaimer', lease ? 'CAD estimate, not a lease quote. Mileage, wear, return fees, refundable deposits and special tax rules are excluded. Confirm the rate method and timing with your lessor.' : 'CAD estimate, not a financing offer. General tax presets exclude luxury tax and special vehicle rules. Lender dates, compounding and rounding can differ.');
  renderDonut(); page = 0; renderGraph(); renderSchedule();
}

function renderDonut() {
  const segments = $('donut-segments'), legend = $('finance-legend'); segments.replaceChildren(); legend.replaceChildren();
  const circumference = 2 * Math.PI * 62; let offset = 0;
  for (const part of result.components) {
    const length = result.totalCash ? part.value / result.totalCash * circumference : 0;
    const circle = svg('circle', { cx: 80, cy: 80, r: 62, fill: 'none', stroke: part.colour, 'stroke-width': 18, 'stroke-dasharray': `${length} ${circumference - length}`, 'stroke-dashoffset': -offset });
    const title = svg('title', {}); title.textContent = `${part.label}: ${money(part.value)}`; circle.append(title); segments.append(circle); offset += length;
    const row = document.createElement('li'), dot = document.createElement('span'), label = document.createElement('span'), amount = document.createElement('strong');
    dot.className = 'legend-dot'; dot.style.backgroundColor = part.colour; label.textContent = part.label; amount.textContent = money(part.value); row.append(dot, label, amount); legend.append(row);
  }
  text('donut-title', `Total cash ${money(result.totalCash)}. ${result.components.map(p => `${p.label}: ${money(p.value)}`).join('. ')}`);
}

function point(row) {
  const x = 76 + row.months / (result.endMonths || 1) * (chartWidth - 104);
  const y = 210 - row.balance / (result.principal || 1) * 182;
  return { x, y };
}
function renderGraph() {
  const lease = mode === 'lease', r = result;
  chartWidth = innerWidth <= 540 ? 450 : 900;
  $('balance-chart').setAttribute('viewBox', `0 0 ${chartWidth} 250`);
  text('timeline-title', lease ? 'See the value left at the end' : 'Watch your balance go down');
  text('timeline-description', lease ? `The unpaid value ends at the ${money(r.residual)} residual, before buyout tax.` : `From ${money(r.principal)} financed to a zero balance. Explore any payment below.`);
  text('balance-chart-title', `${lease ? 'Unpaid lease value' : 'Loan balance'} over ${Number(r.endMonths.toFixed(1))} months, from ${money(r.principal)} to ${money(r.residual)}.`);
  const points = [{ months: 0, balance: r.principal }, ...r.rows].map(point);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  $('balance-line').setAttribute('d', path); $('balance-area').setAttribute('d', `${path} L${points.at(-1).x},210 L76,210 Z`);
  const axis = $('balance-axis'); axis.replaceChildren();
  for (let i = 0; i <= 4; i++) {
    const y = 210 - i * 182 / 4;
    axis.append(svg('line', { x1: 76, x2: chartWidth - 28, y1: y, y2: y, stroke: '#dce6ef', 'stroke-dasharray': '3 5' }));
    const label = svg('text', { x: 62, y: y + 5, 'text-anchor': 'end' }); label.textContent = shortMoney(r.principal * i / 4); axis.append(label);
    if (chartWidth === 450 && i % 2) continue;
    const tick = svg('text', { x: 76 + i * (chartWidth - 104) / 4, y: 240, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' });
    tick.textContent = `${Number((r.endMonths * i / 4).toFixed(1))} mo`; axis.append(tick);
  }
  $('finance-inspect').max = r.rows.length; $('finance-inspect').value = 0; $('finance-inspect').disabled = !r.rows.length; inspect();
  $('finance-download').disabled = !r.rows.length;
  text('schedule-title', lease ? 'Monthly lease schedule' : 'Payment-by-payment schedule'); text('schedule-count', `${r.rows.length} payments`);
  text('schedule-timing', lease ? (values.timing === 'advance' ? 'Payments are due at the start of each month. Values show the end of that month.' : 'Payments are due at the end of each month.') : 'Balance shown after each payment.');
  text('schedule-assumptions', lease ? `${values.rateType === 'factor' ? 'Money factor uses level depreciation and rent charges.' : 'Annual interest uses the declining unpaid value; finance charges accrue over each month.'} Values are rounded to cents. This is a payment illustration, not an early-termination or market-value quote. Buyout is excluded.` : 'Interest and payments are rounded to cents. A partial final period uses the equivalent fractional-period rate. The final payment clears the balance. Actual lender schedules can differ.');
}
function inspect() {
  const index = +$('finance-inspect').value;
  const row = index ? result.rows[index - 1] : { months: 0, balance: result.principal };
  const { x, y } = point(row);
  $('balance-cursor').setAttribute('x1', x); $('balance-cursor').setAttribute('x2', x);
  $('balance-dot').setAttribute('cx', x); $('balance-dot').setAttribute('cy', y);
  const value = `${index ? `Payment ${index}` : 'Start'}: ${money(row.balance)} ${mode === 'lease' ? 'unpaid value' : 'remaining'}${index ? ` / ${money(row.payment)} paid` : ''}`;
  text('finance-inspect-result', value); $('finance-inspect').setAttribute('aria-valuetext', value);
}

function renderSchedule() {
  const lease = mode === 'lease', r = result, rows = grouping === 'years' ? annualSchedule(r.rows) : r.rows;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)); page = Math.min(page, pages - 1);
  text('schedule-period', grouping === 'years' ? 'Year' : 'Payment'); text('schedule-principal', lease ? 'Depreciation' : 'Principal');
  text('schedule-interest', lease ? 'Finance charge' : 'Interest'); text('schedule-balance', lease ? 'Unpaid value' : 'Balance');
  text('schedule-caption', `${lease ? 'Lease' : 'Loan'} schedule by ${grouping === 'years' ? 'year' : 'payment'} in CAD`);
  document.querySelectorAll('[data-lease-column]').forEach(cell => { cell.hidden = !lease; });
  document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === grouping)));
  const body = $('schedule-rows'); body.replaceChildren();
  const append = (container, label, row) => {
    const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = label; tr.append(th);
    for (const key of ['payment', 'principal', 'interest', ...(lease ? ['tax'] : []), 'balance']) { const td = document.createElement('td'); td.textContent = money(row[key]); tr.append(td); }
    container.append(tr);
  };
  for (const row of rows.slice(page * pageSize, (page + 1) * pageSize)) append(body, row.number, row);
  const foot = $('schedule-totals'); foot.replaceChildren();
  append(foot, 'Full term', { payment: r.totalPayments, principal: r.principal - r.residual, interest: r.totalInterest, tax: r.rows.reduce((sum, row) => sum + row.tax, 0), balance: r.residual });
  text('schedule-page', `Page ${page + 1} of ${pages}`); $('schedule-prev').disabled = page === 0; $('schedule-next').disabled = page === pages - 1;
}

function switchMode(next, focus = false) {
  mode = next; document.dispatchEvent(new Event('tool-help-close'));
  for (const id of ['loan', 'lease']) {
    show('panel-' + id, id === mode); $('tab-' + id).setAttribute('aria-selected', String(id === mode)); $('tab-' + id).tabIndex = id === mode ? 0 : -1;
  }
  if (focus) $('tab-' + mode).focus(); render();
}
for (const [id, form] of Object.entries(forms)) {
  $('tab-' + id).addEventListener('click', () => { switchMode(id); history.replaceState(null, '', id === 'lease' ? '#lease' : location.pathname + location.search); });
  $('tab-' + id).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const next = event.key === 'Home' ? 'loan' : event.key === 'End' ? 'lease' : mode === 'loan' ? 'lease' : 'loan'; switchMode(next, true); history.replaceState(null, '', next === 'lease' ? '#lease' : location.pathname + location.search);
    }
  });
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => { if (event.target.name === 'tax') form.elements.province.value = 'custom'; clearTimeout(debounce); debounce = setTimeout(render, 120); });
  form.addEventListener('change', event => {
    if (event.target.name === 'province' && form.elements.province.value !== 'custom') form.elements.tax.value = form.elements.province.selectedOptions[0].dataset.tax;
    render();
  });
  form.addEventListener('reset', () => { document.dispatchEvent(new Event('tool-help-close')); setTimeout(render, 0); });
  form.querySelectorAll('[data-term]').forEach(button => button.addEventListener('click', () => { form.elements.months.value = button.dataset.term; render(); }));
}
$('finance-inspect').addEventListener('input', inspect);
document.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => { grouping = button.dataset.group; page = 0; renderSchedule(); }));
$('schedule-prev').addEventListener('click', () => { page--; renderSchedule(); }); $('schedule-next').addEventListener('click', () => { page++; renderSchedule(); });
$('balance-chart').addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !result || result.error) return;
  const rect = $('balance-chart').getBoundingClientRect();
  const months = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * chartWidth - 76) / (chartWidth - 104))) * result.endMonths;
  let index = 0, distance = months;
  result.rows.forEach((row, i) => { if (Math.abs(row.months - months) < distance) { index = i + 1; distance = Math.abs(row.months - months); } });
  $('finance-inspect').value = index; inspect();
});
$('finance-download').addEventListener('click', () => {
  if (!result || result.error) return;
  const r = result, lease = mode === 'lease';
  const rows = [ ['Postiqo ' + (lease ? 'lease' : 'loan') + ' estimate', 'CAD'], ['Source', 'https://postiqo.io/tools/car-payment-calculator/'],
    ['Vehicle price', values.price.toFixed(2)], ['Down payment before tax', values.down.toFixed(2)], ['Trade-in value', values.trade.toFixed(2)],
    ['Term (months)', values.months], ['Rate method', lease ? values.rateType : 'annual'], [lease && values.rateType === 'factor' ? 'Money factor' : 'Annual rate (%)', lease && values.rateType === 'factor' ? values.factor : values.rate],
    ['Sales tax (%)', values.tax], ['Payment timing', lease ? values.timing : 'end of period'],
    ...(lease ? [['Residual before tax', values.residual.toFixed(2)], ['Financed fees before tax', values.fees.toFixed(2)], ['Upfront fees including tax', values.upfrontFees.toFixed(2)]]
      : [['Payment frequency', values.frequency], ['Trade-in loan payoff', values.payoff.toFixed(2)], ['Taxable fees before tax', values.taxableFees.toFixed(2)], ['Other fees including tax', values.otherFees.toFixed(2)], ['Taxes and fees', values.financeCosts ? 'financed' : 'upfront'], ['Extra per payment', values.extra.toFixed(2)]]),
    ['Cash due upfront', decimal(r.upfront)], ['Total payments', decimal(r.totalPayments)],
    ['Total cash excluding optional buyout', decimal(r.totalCash)], ['Optional buyout including tax', decimal(r.buyout || 0)], ['Notes', $('schedule-assumptions').textContent], [],
    ['Payment', 'Month elapsed', 'Paid (CAD)', lease ? 'Depreciation (CAD)' : 'Principal (CAD)', 'Finance charge (CAD)', 'Tax (CAD)', lease ? 'Unpaid value (CAD)' : 'Balance (CAD)'],
    ...r.rows.map(row => [row.number, row.months.toFixed(4), ...['payment','principal','interest','tax','balance'].map(key => decimal(row[key]))]) ];
  const csv = rows.map(row => row.map(value => '"' + String(value).replaceAll('"','""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `postiqo-${mode}-schedule.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
addEventListener('hashchange', () => switchMode(location.hash === '#lease' ? 'lease' : 'loan'));
addEventListener('resize', () => { if (result && !result.error && chartWidth !== (innerWidth <= 540 ? 450 : 900)) renderGraph(); });
function mobileEstimate() { show('finance-mobile-estimate', Boolean(result && !result.error && formVisible && !summaryVisible)); }
const visibility = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.target === $('finance-summary')) summaryVisible = entry.isIntersecting;
    else formVisible = entry.isIntersecting;
  }
  mobileEstimate();
}, { rootMargin: '-90px 0px -100px 0px' });
visibility.observe(document.querySelector('.finance-input-panel')); visibility.observe($('finance-summary'));
$('finance-jump').addEventListener('click', () => { $('finance-summary').setAttribute('tabindex', '-1'); $('finance-summary').scrollIntoView({ block: 'start' }); $('finance-summary').focus({ preventScroll: true }); });
switchMode(location.hash === '#lease' ? 'lease' : 'loan');
