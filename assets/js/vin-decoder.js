(() => {
  'use strict';
  const form = document.getElementById('vin-form');
  if (!form) return;
  const input = form.elements.vin, year = form.elements.year;
  const button = document.getElementById('vin-submit'), message = document.getElementById('vin-message');
  const result = document.getElementById('vin-result');
  year.max = String(new Date().getUTCFullYear() + 2);
  let controller, revision = 0;
  function status(text) { message.textContent = text; message.hidden = !text; }
  function stop() {
    revision++; controller?.abort(); controller = null;
    button.disabled = false; button.textContent = 'Decode VIN'; form.removeAttribute('aria-busy');
  }
  function changed() {
    stop(); result.hidden = true; status('');
    input.removeAttribute('aria-invalid'); year.removeAttribute('aria-invalid');
    document.getElementById('vin-count').textContent = `${input.value.length} / 17 characters`;
  }
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); changed(); });
  year.addEventListener('input', changed);
  form.addEventListener('reset', () => { stop(); setTimeout(changed, 0); });
  document.getElementById('vin-example').addEventListener('click', () => {
    input.value = '1HGCM82633A004352'; year.value = '2003'; changed(); form.requestSubmit();
  });
  const groups = [
    ['Vehicle identity', [['year','Model year'],['make','Make'],['model','Model'],['trim','Trim'],['series','Series'],['body_type','Body style']]],
    ['Engine & drivetrain', [['engine_displacement_l','Engine displacement',' L'],['cylinders','Cylinders'],['engine_model','Engine model'],['engine_configuration','Engine configuration'],['fuel_type','Fuel type'],['fuel_type_secondary','Secondary fuel'],['electrification_level','Electrification'],['drivetrain','Drivetrain'],['transmission','Transmission'],['transmission_speeds','Transmission speeds']]],
    ['Body & manufacturing', [['doors','Doors'],['seats','Seats'],['seat_rows','Seat rows'],['plant_country','Assembly country']]],
  ];
  form.addEventListener('submit', async event => {
    event.preventDefault(); stop(); result.hidden = true;
    const vin = input.value.trim().toUpperCase(); input.value = vin;
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      input.setAttribute('aria-invalid','true'); status('Enter exactly 17 letters and numbers. VINs do not use I, O or Q.'); input.focus(); return;
    }
    if (year.value && !year.validity.valid) {
      year.setAttribute('aria-invalid','true'); status(`Enter a whole model year from 1981 to ${year.max}, or leave it blank.`); year.focus(); return;
    }
    input.removeAttribute('aria-invalid'); year.removeAttribute('aria-invalid');
    const current = revision;
    controller = new AbortController();
    const activeController = controller;
    const timeout = setTimeout(() => activeController.abort(), 12000);
    button.disabled = true; button.textContent = 'Looking up VIN...'; form.setAttribute('aria-busy', 'true'); status('Looking up vehicle specifications...');
    try {
      const response = await fetch('/api/tools/vin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vin, ...(year.value ? { year: Number(year.value) } : {}) }), signal: controller.signal });
      const data = await response.json();
      if (current !== revision) return;
      if (!response.ok) {
        status(response.status === 429 ? 'Too many lookups. Please wait a minute and try again.' : response.status === 400 ? 'Check the VIN and model year, then try again.' : 'The vehicle data service is temporarily unavailable. Please try again in a minute.'); return;
      }
      if (!['complete','partial'].includes(data.status)) {
        status(data.status === 'review' ? 'This VIN needs verification. Check the VIN and model year against the vehicle, then try again. NHTSA could not confirm a reliable decode.' : 'No reliable specifications were found. Check the VIN, add the model year if known, or try another vehicle.'); return;
      }
      const details = data.data;
      if (data.vin !== vin || !details?.year || !details.make || !details.model) throw new Error('invalid_response');
      const sections = [];
      for (const [title, fields] of groups) {
        const available = fields.filter(([key]) => details[key] !== undefined && details[key] !== null && details[key] !== '');
        if (!available.length) continue;
        const section = document.createElement('section'), heading = document.createElement('h3'), list = document.createElement('dl');
        heading.textContent = title;
        for (const [key, label, suffix = ''] of available) {
          const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
          dt.textContent = label;
          dd.textContent = (key === 'engine_displacement_l' && typeof details[key] === 'number' ? details[key].toFixed(1) : String(details[key])) + suffix;
          row.append(dt,dd); list.append(row);
        }
        section.append(heading,list); sections.push(section);
      }
      document.getElementById('vin-specs').replaceChildren(...sections);
      document.getElementById('vin-result-title').textContent = [details.year,details.make,details.model].join(' ');
      document.getElementById('vin-result-code').textContent = vin;
      document.getElementById('vin-result-note').textContent = data.status === 'partial' ? 'Some specifications are not available for this VIN. Available fields are shown below.' : 'Available manufacturer specifications are shown below. Fields not supplied by the source are omitted.';
      result.hidden = false; status(''); document.getElementById('vin-result-title').focus({ preventScroll: true });
      result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    } catch {
      if (current === revision) status('The lookup could not be completed. Check your connection and try again in a moment.');
    } finally {
      clearTimeout(timeout);
      if (current === revision) { button.disabled = false; button.textContent = 'Decode VIN'; form.removeAttribute('aria-busy'); controller = null; }
    }
  });
})();
