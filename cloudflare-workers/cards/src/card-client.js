// Equal payments at the chosen frequency, with a nominal annual rate divided
// by 12, 26 or 52. These are regular payments, not accelerated payments.
function calculateVehiclePayment({ price, downPayment, annualRate, termMonths, frequency, taxRate = 0 }) {
  const periods = { monthly: 12, biweekly: 26, weekly: 52 };
  if (![price, downPayment, annualRate, termMonths, taxRate].every(Number.isFinite)
    || price <= 0 || downPayment < 0 || annualRate < 0 || annualRate > 100 || taxRate < 0 || taxRate > 100
    || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120 || !Object.hasOwn(periods, frequency)) return null;
  const salesTax = Math.round(price * taxRate) / 100;
  const priceWithTax = Math.round((price + salesTax) * 100) / 100;
  if (downPayment > priceWithTax) return null;
  const principal = Math.round((priceWithTax - downPayment) * 100) / 100;
  const periodsInTerm = termMonths * periods[frequency] / 12;
  const fullPayments = Math.floor(periodsInTerm);
  const partialPeriod = periodsInTerm - fullPayments;
  const payments = Math.ceil(periodsInTerm);
  const rate = annualRate / 100 / periods[frequency];
  // log1p/expm1 retain precision even for very small positive interest rates.
  const payment = principal === 0 ? 0 : rate === 0 ? principal / periodsInTerm
    : principal * rate / -Math.expm1(-periodsInTerm * Math.log1p(rate));
  // A custom month count may end between weekly/bi-weekly dates. Pay the
  // remaining balance at that point, rather than displaying fractional payments.
  const finalPayment = partialPeriod === 0 ? payment : rate === 0 ? payment * partialPeriod
    : payment * Math.expm1(partialPeriod * Math.log1p(rate)) / rate;
  const totalPayments = payment * fullPayments + (partialPeriod ? finalPayment : 0);
  return { principal, salesTax, priceWithTax, payments, fullPayments, partialPeriod, payment, finalPayment,
    totalPayments, totalInterest: Math.max(0, totalPayments - principal) };
}

(() => {
  'use strict';
  document.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
  document.querySelectorAll('[data-enhanced]').forEach(element => { element.hidden = false; });
  const track = document.querySelector('.photo-track');
  const dialog = document.querySelector('.lightbox');
  const photos = [...document.querySelectorAll('.slide img')];
  const thumbnails = [...document.querySelectorAll('[data-photo]')];
  let current = 0;

  function photoState(img) {
    const failed = img.complete && img.naturalWidth === 0;
    img.hidden = failed;
    const fallback = img.parentElement.querySelector('.photo-unavailable');
    if (fallback) fallback.hidden = !failed;
  }
  photos.forEach(img => {
    img.addEventListener('error', () => photoState(img));
    img.addEventListener('load', () => photoState(img));
    if (img.complete) photoState(img);
  });

  function lightboxImage() {
    if (!dialog?.open) return;
    const img = dialog.querySelector('img');
    img.hidden = false;
    dialog.querySelector('.photo-unavailable').hidden = true;
    img.src = photos[current].src;
    img.alt = photos[current].alt;
    dialog.querySelector('[data-lightbox-number]').textContent = String(current + 1);
    if (img.complete) photoState(img);
  }
  function select(index, scroll = true) {
    if (!photos.length) return;
    current = (index + photos.length) % photos.length;
    document.querySelector('[data-photo-number]').textContent = String(current + 1);
    thumbnails.forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    if (scroll) track.scrollTo({ left: current * track.clientWidth, behavior: 'instant' });
    const thumb = thumbnails[current];
    if (thumb) {
      const list = thumb.parentElement;
      if (thumb.offsetLeft < list.scrollLeft || thumb.offsetLeft + thumb.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollTo({ left: thumb.offsetLeft - list.clientWidth / 2 + thumb.clientWidth / 2, behavior: 'instant' });
      }
    }
    lightboxImage();
  }
  if (track) {
    track.addEventListener('scroll', () => {
      const index = Math.round(track.scrollLeft / track.clientWidth);
      if (index !== current) select(index, false);
    }, { passive: true });
    thumbnails.forEach((button, i) => button.addEventListener('click', () => select(i)));
    document.querySelectorAll('[data-previous]').forEach(b => b.addEventListener('click', () => select(current - 1)));
    document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => select(current + 1)));
    const openButton = document.querySelector('[data-expand]');
    openButton.addEventListener('click', () => { dialog.showModal(); lightboxImage(); });
    document.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => openButton.focus({ preventScroll: true }));
    dialog.querySelector('img').addEventListener('error', event => photoState(event.target));
    dialog.querySelector('img').addEventListener('load', event => photoState(event.target));
    const arrows = event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        select(current + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    track.addEventListener('keydown', arrows);
    dialog.addEventListener('keydown', arrows);
    let touchStart;
    dialog.addEventListener('touchstart', event => {
      touchStart = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null;
    }, { passive: true });
    dialog.addEventListener('touchend', event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart[0], dy = event.changedTouches[0].clientY - touchStart[1];
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) select(current + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, { passive: true });
    new ResizeObserver(() => { track.scrollLeft = current * track.clientWidth; }).observe(track);
  }

  function setupPaymentCalculator() {
    const calculator = document.querySelector('[data-payment-calculator]');
    if (!calculator) return () => {};
    const form = calculator.querySelector('[data-payment-form]');
    const down = form.elements.namedItem('downPayment');
    const rate = form.elements.namedItem('annualRate');
    const termPreset = form.elements.namedItem('termPreset');
    const term = form.elements.namedItem('termMonths');
    const province = form.elements.namedItem('province');
    const tax = form.elements.namedItem('taxRate');
    const frequency = form.elements.namedItem('frequency');
    const defaults = { rate: rate.value, term: term.value, frequency: frequency.value, province: province.value, tax: tax.value };
    const error = calculator.querySelector('#payment-error');
    const result = calculator.querySelector('[data-payment-result]');
    const breakdown = calculator.querySelector('[data-payment-breakdown]');
    const customTerm = calculator.querySelector('[data-custom-term]');
    const finalPaymentNote = calculator.querySelector('[data-payment-final]');
    const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
    const percent = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 });
    const taxPercent = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 3 });
    const units = { monthly: ' / month', biweekly: ' / 2 weeks', weekly: ' / week' };
    const schedules = { monthly: 'monthly', biweekly: 'bi-weekly', weekly: 'weekly' };
    let price = null, downEdited = false;
    const defaultDown = () => (Math.round(price * 10) / 100).toFixed(2);
    const write = (selector, value) => { calculator.querySelector(selector).textContent = value; };

    function renderPayment() {
      if (calculator.hidden) return;
      let invalid = null, message = '';
      [down, rate, term, tax].forEach(input => input.removeAttribute('aria-invalid'));
      const validTax = tax.validity.valid && Number.isFinite(tax.valueAsNumber);
      const priceWithTax = validTax ? Math.round((price + Math.round(price * tax.valueAsNumber) / 100) * 100) / 100 : price;
      down.max = String(priceWithTax);
      if (!validTax) {
        invalid = tax;
        message = 'Enter a sales tax rate from 0% to 100%, using up to three decimal places.';
      } else if (!down.validity.valid || !Number.isFinite(down.valueAsNumber)) {
        invalid = down;
        message = `Enter a down payment from $0 to ${currency.format(priceWithTax)} (price including tax), using up to two decimal places.`;
      } else if (!rate.validity.valid || !Number.isFinite(rate.valueAsNumber)) {
        invalid = rate;
        message = 'Enter an annual interest rate from 0% to 100%, using up to two decimal places.';
      } else if (!term.validity.valid || !Number.isInteger(term.valueAsNumber)) {
        invalid = term;
        message = 'Enter a whole number of months from 1 to 120.';
      }
      const estimate = invalid ? null : calculateVehiclePayment({ price, downPayment: down.valueAsNumber,
        annualRate: rate.valueAsNumber, termMonths: term.valueAsNumber, frequency: frequency.value, taxRate: tax.valueAsNumber });
      if (!estimate && !message) message = 'Choose a loan term and payment frequency to calculate your payment.';
      if (invalid) invalid.setAttribute('aria-invalid', 'true');
      error.textContent = message;
      error.hidden = !message;
      result.hidden = !estimate;
      breakdown.hidden = !estimate;
      calculator.querySelector('[data-tax-note]').hidden = province.value !== 'BC';
      write('[data-down-percent]', !down.validity.valid || !Number.isFinite(down.valueAsNumber) ? ''
        : `${percent.format(down.valueAsNumber / price * 100)}% of price`);
      if (!estimate) return;
      write('[data-payment-amount]', currency.format(estimate.payment));
      write('[data-payment-unit]', units[frequency.value]);
      write('[data-payment-tax-included]', `Including ${taxPercent.format(tax.valueAsNumber)}% sales tax`);
      write('[data-payment-schedule]', estimate.principal === 0 ? 'Fully covered by your down payment'
        : `${estimate.payments} ${estimate.partialPeriod ? '' : schedules[frequency.value] + ' '}payments over ${term.value} ${Number(term.value) === 1 ? 'month' : 'months'}`);
      finalPaymentNote.hidden = !estimate.partialPeriod || estimate.principal === 0;
      finalPaymentNote.textContent = `Final payment: ${currency.format(estimate.finalPayment)} for the shorter last period`;
      write('[data-payment-tax-label]', `Sales tax (${taxPercent.format(tax.valueAsNumber)}%)`);
      write('[data-payment-tax]', currency.format(estimate.salesTax));
      write('[data-payment-principal]', currency.format(estimate.principal));
      write('[data-payment-interest]', currency.format(estimate.totalInterest));
      write('[data-payment-total]', currency.format(estimate.totalPayments));
    }

    function updateVehicle(nextPrice, active) {
      price = nextPrice;
      calculator.hidden = active === false || !Number.isFinite(price) || price <= 0;
      if (calculator.hidden) return;
      if (!downEdited) down.value = defaultDown();
      renderPayment();
    }
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', event => {
      if (event.target === down) downEdited = true;
      if (event.target === tax) province.value = 'custom';
      if (event.target === termPreset) {
        customTerm.hidden = termPreset.value !== 'custom';
        if (!customTerm.hidden) term.focus();
        else term.value = termPreset.value;
      }
      if (event.target === province && province.value !== 'custom') {
        tax.value = province.selectedOptions[0].dataset.taxRate;
      }
      renderPayment();
    });
    form.addEventListener('change', renderPayment);
    calculator.querySelector('[data-payment-reset]').addEventListener('click', () => {
      downEdited = false;
      down.value = defaultDown();
      rate.value = defaults.rate;
      term.value = defaults.term;
      termPreset.value = defaults.term;
      customTerm.hidden = true;
      province.value = defaults.province;
      tax.value = defaults.tax;
      frequency.value = defaults.frequency;
      renderPayment();
    });
    updateVehicle(calculator.dataset.vehiclePrice === '' ? null : Number(calculator.dataset.vehiclePrice),
      calculator.dataset.vehicleActive !== 'false');
    return updateVehicle;
  }

  // Also runs on the static demo, which deliberately has no live-inventory hook.
  const updatePaymentVehicle = setupPaymentCalculator();
  const card = document.querySelector('[data-vehicle-card]');
  if (!card) return;
  let refreshing = false, accessDisabled = false, lastCheck = Date.now();
  const note = document.querySelector('[data-refresh-note]');
  const pricePanel = document.querySelector('[data-price-panel]');
  function updateSpecifications(groups) {
    const target = document.querySelector('[data-spec-groups]');
    if (!target || !Array.isArray(groups) || groups.length > 3) return;
    if (!groups.every(group => typeof group.title === 'string' && Array.isArray(group.rows) && group.rows.length <= 20
      && group.rows.every(row => Array.isArray(row) && row.length === 2 && row.every(value => typeof value === 'string')))) return;
    const sections = groups.map(group => {
      const section = document.createElement('section');
      section.className = 'spec-group';
      const heading = document.createElement('h3');
      heading.textContent = group.title;
      const list = document.createElement('dl');
      list.className = 'specifications';
      for (const [label, value] of group.rows) {
        const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
        term.textContent = label;
        detail.textContent = value;
        row.append(term, detail);
        list.append(row);
      }
      section.append(heading, list);
      return section;
    });
    target.replaceChildren(...sections);
  }
  function setAvailability(value) {
    const badge = document.querySelector('[data-availability]');
    badge.textContent = value === false ? 'No longer listed' : value === true ? 'Available' : 'Check availability';
    badge.classList.toggle('inactive', value === false);
    badge.classList.toggle('unknown', value === null);
    pricePanel.hidden = value === false;
    document.querySelector('[data-inactive-note]').hidden = value !== false;
  }
  async function refresh(force = false) {
    if (document.hidden || refreshing || accessDisabled || (!force && Date.now() - lastCheck < 15000)) return;
    refreshing = true;
    lastCheck = Date.now();
    try {
      const response = await fetch(card.dataset.endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (response.status === 403 && (await response.json()).error === 'cards_disabled') {
        accessDisabled = true;
        dialog?.close();
        card.remove();
        window.location.reload();
        return;
      }
      if (response.status === 404) {
        setAvailability(false);
        updatePaymentVehicle(null, false);
        note.hidden = true;
        return;
      }
      if (!response.ok) throw new Error('refresh_failed');
      const { vehicle } = await response.json();
      if (!vehicle || ![true, false, null].includes(vehicle.is_active)
        || (vehicle.price !== null && (typeof vehicle.price !== 'number' || !Number.isFinite(vehicle.price)))) throw new Error('invalid_response');
      setAvailability(vehicle.is_active);
      updateSpecifications(vehicle.spec_groups);
      updatePaymentVehicle(vehicle.price, vehicle.is_active);
      document.querySelector('[data-price]').textContent = vehicle.price === null || vehicle.price <= 0 ? 'Contact for price'
        : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: Number.isInteger(vehicle.price) ? 0 : 2 }).format(vehicle.price);
      document.querySelector('[data-currency]').hidden = !vehicle.price || vehicle.price <= 0;
      note.hidden = true;
    } catch {
      note.textContent = 'Live updates are temporarily unavailable. Please confirm the price with the dealership.';
      note.hidden = false;
    } finally { refreshing = false; }
  }
  setInterval(() => refresh(), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', () => refresh());
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(true); });
})();
