import { urls } from '../generated/assets.js';

export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function number(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function safeUrl(value, image = false) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return '';
    // Browsers upgrade mixed-content images anyway. Use HTTPS explicitly so the
    // page never sends a visitor to an insecure image endpoint.
    if (image) u.protocol = 'https:';
    return u.href;
  } catch { return ''; }
}

export function projectVehicle(row) {
  const vehicle = {};
  for (const key of ['title', 'vin', 'stockno', 'make', 'model', 'trim', 'description', 'drivetrain',
    'vehicle_type', 'vehicle_condition', 'body_type', 'exterior_color', 'interior_color', 'fuel_type',
    'transmission', 'location', 'dealer_name', 'dealer_address', 'dealer_phone', 'dealer_email']) vehicle[key] = text(row[key]);
  for (const key of ['year', 'price', 'mileage', 'cylinders']) vehicle[key] = number(row[key]);
  vehicle.is_active = row.is_active === 1 ? true : row.is_active === 0 ? false : null;
  vehicle.video = safeUrl(row.video);
  vehicle.dealer_website = safeUrl(row.dealer_website);
  let photos = [];
  try { photos = JSON.parse(row.photos_json); } catch { /* Keep an honest empty gallery. */ }
  vehicle.photos = Array.isArray(photos) ? [...new Set(photos.filter(p => typeof p === 'string').map(p => safeUrl(p, true)).filter(Boolean))].slice(0, 100) : [];
  return vehicle;
}

const shapes = {
  arrow: '<path d="m9 5 7 7-7 7"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  car: '<path d="m5 7 2-4h10l2 4 2 3v8h-3v-3H6v3H3v-8l2-3Zm0 0h14M3 11h18M7 11v2m10-2v2"/>',
  gauge: '<path d="M4 18a10 10 0 1 1 16 0M12 12l4-5"/><circle cx="12" cy="12" r="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3Z"/>',
  fuel: '<path d="M4 21V3h9v18M4 9h9M2 21h13m-2-10h3v6a2 2 0 0 0 4 0V8l-3-3"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="m5 3 4 4-2 3a16 16 0 0 0 7 7l3-2 4 4-2 2C9 22 2 15 3 5Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  link: '<path d="M14 3h7v7m0-7L10 14m-1-9H4v15h15v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
function icon(name) { return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${shapes[name]}</svg>`; }
const integer = value => new Intl.NumberFormat('en-CA').format(value);
export const money = value => value === null || value <= 0 ? 'Contact for price' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
function status(v) { return v.is_active === false ? 'No longer listed' : v.is_active === true ? 'Available' : 'Check availability'; }

function shell(title, body, options = {}) {
  return `<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><meta name="theme-color" content="#f3f9ff"><meta name="robots" content="noindex,nofollow">
<meta name="description" content="${escape(options.description || 'Vehicle photos, details and current price.')}"/>
${options.path ? `<link rel="canonical" href="https://cards.postiqo.io${escape(options.path)}"><meta property="og:url" content="https://cards.postiqo.io${escape(options.path)}">` : ''}
<meta property="og:title" content="${escape(title)}"><meta property="og:type" content="website">
${options.photo ? `<meta property="og:image" content="${escape(options.photo)}">` : ''}
<link rel="preload" href="${urls.font}" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="${urls.css}"><script src="${urls.js}" defer></script></head>
<body>${body}<footer class="footer">Powered by <a href="https://postiqo.io/" target="_blank" rel="noopener">Postiqo.io</a></footer></body></html>`;
}

function gallery(v) {
  if (!v.photos.length) return `<section class="gallery empty-gallery" aria-label="Vehicle photos">${icon('car')}<p>Photos coming soon</p><span>Ask the dealership for a closer look.</span></section>`;
  return `<section class="gallery" aria-label="Vehicle photos">
    <div class="photo-stage"><div class="photo-track" id="photo-track" tabindex="0" aria-label="Vehicle photos. Use the arrow keys to browse.">
    ${v.photos.map((src, i) => `<figure class="slide"><img src="${escape(src)}" alt="${escape(v.title)} - photo ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" referrerpolicy="no-referrer"><span class="photo-unavailable" hidden>Photo unavailable</span></figure>`).join('')}
    </div><div class="gallery-tools" data-enhanced hidden><span class="photo-count" aria-live="polite"><span data-photo-number>1</span> / ${v.photos.length}</span><button class="icon-button expand-button" aria-label="View fullscreen photos" data-expand>${icon('expand')}</button></div>
    ${v.photos.length > 1 ? `<div class="gallery-arrows" data-enhanced hidden><button class="icon-button previous" aria-label="Previous photo" data-previous>${icon('arrow')}</button><button class="icon-button" aria-label="Next photo" data-next>${icon('arrow')}</button></div>` : ''}</div>
    ${v.photos.length > 1 ? `<div class="thumbnails" data-enhanced hidden aria-label="Choose a photo">${v.photos.map((src, i) => `<button class="thumbnail" data-photo="${i}" aria-label="Show photo ${i + 1}" aria-pressed="${i === 0}"><img src="${escape(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>`).join('')}</div>` : ''}
    <dialog class="lightbox" aria-label="Fullscreen vehicle photos"><div class="lightbox-top"><span><span data-lightbox-number>1</span> / ${v.photos.length}</span><button class="icon-button" aria-label="Close fullscreen photos" data-close>${icon('close')}</button></div><div class="lightbox-stage"><img alt="" referrerpolicy="no-referrer"><span class="photo-unavailable" hidden>Photo unavailable</span></div>${v.photos.length > 1 ? `<button class="icon-button previous lightbox-prev" aria-label="Previous fullscreen photo" data-previous>${icon('arrow')}</button><button class="icon-button lightbox-next" aria-label="Next fullscreen photo" data-next>${icon('arrow')}</button>` : ''}</dialog>
  </section>`;
}

function specs(v) {
  const rows = [['Year', v.year], ['Make', v.make], ['Model', v.model], ['Trim', v.trim],
    ['Body style', v.body_type || v.vehicle_type], ['Condition', v.vehicle_condition],
    ['Mileage', v.mileage === null ? '' : `${integer(v.mileage)} km`], ['Transmission', v.transmission],
    ['Drivetrain', v.drivetrain], ['Engine', v.cylinders ? `${v.cylinders}-cylinder` : ''], ['Fuel type', v.fuel_type],
    ['Exterior colour', v.exterior_color], ['Interior colour', v.interior_color], ['Stock number', v.stockno]];
  return `<section class="details-section"><h2>At a glance</h2><dl class="specifications">${rows.filter(([, value]) => value !== '' && value !== null).map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><div class="vin"><span>VIN</span><span>${escape(v.vin)}</span></div></section>`;
}

function dealer(v) {
  const phone = v.dealer_phone.replace(/[^+\d]/g, '');
  const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.dealer_email) ? v.dealer_email : '';
  const address = v.dealer_address || v.location;
  return `<section class="dealer" aria-labelledby="dealer-title"><span class="eyebrow">Offered by</span><h2 id="dealer-title">${escape(v.dealer_name)}</h2>
    ${address ? `<p class="dealer-address">${icon('pin')}<span>${escape(address)}</span></p>` : ''}
    <div class="contact-actions">${phone.length >= 7 ? `<a class="button button-primary" href="tel:${escape(phone)}">${icon('phone')}Call dealership</a><p class="phone-number">${escape(v.dealer_phone)}</p>` : ''}
    ${email ? `<a class="button button-secondary" href="mailto:${escape(email)}">${icon('mail')}Email dealership</a>` : ''}
    ${v.dealer_website ? `<a class="dealer-website" href="${escape(v.dealer_website)}" target="_blank" rel="noopener noreferrer">Visit dealership website ${icon('link')}</a>` : ''}</div>
  </section>`;
}

export function renderPage(v, path) {
  // Some feeds append selling points to the model. Keep the complete source
  // value in the specifications and description, with a shorter page heading.
  let model = v.model.split(/\s+[|*]\s+/)[0];
  if (model === model.toUpperCase()) model = model.replace(/[A-Z]{4,}/g, word => word[0] + word.slice(1).toLowerCase());
  const title = v.make && model ? [v.year, v.make, model].filter(Boolean).join(' ') : v.title;
  const highlights = [[v.mileage === null ? '' : `${integer(v.mileage)} km`, 'Mileage', 'gauge'], [v.transmission.replace(/ transmission$/i, ''), 'Transmission', 'gear'], [v.fuel_type, 'Fuel type', 'fuel']].filter(([value]) => value);
  const body = `<main class="vehicle-page" data-vehicle-card data-endpoint="/api${escape(path)}">
    <div class="vehicle-layout"><div class="gallery-column">${gallery(v)}</div>
    <div class="summary-column"><section class="summary"><div class="summary-top"><span class="eyebrow">${escape([v.vehicle_condition, v.body_type || v.vehicle_type].filter(Boolean).join(' / ') || 'Vehicle details')}</span><span class="availability ${v.is_active === false ? 'inactive' : v.is_active === null ? 'unknown' : ''}" data-availability>${status(v)}</span></div>
    <h1>${escape(title)}</h1>${v.trim ? `<p class="trim">${escape(v.trim)}</p>` : ''}
    <div class="price-panel" data-price-panel ${v.is_active === false ? 'hidden' : ''}><span class="eyebrow">Asking price</span><div class="price-line"><strong class="price" data-price aria-live="polite">${money(v.price)}</strong><span class="currency" data-currency ${!v.price ? 'hidden' : ''}>CAD</span></div></div>
    <p class="inactive-note" data-inactive-note ${v.is_active === false ? '' : 'hidden'}>This vehicle is no longer listed. Contact the dealership for current availability.</p>
    <p class="refresh-note" data-refresh-note role="status" hidden></p>
    ${highlights.length ? `<dl class="highlights">${highlights.map(([value, label, symbol]) => `<div>${icon(symbol)}<dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}
    </section>${dealer(v)}</div>
    <div class="details-column">${specs(v)}
    ${v.description || v.title !== title ? `<section class="details-section description-section"><h2>About this vehicle</h2>${v.title !== title ? `<p class="listing-title">${escape(v.title)}</p>` : ''}${v.description ? `<div class="description">${escape(v.description)}</div>` : ''}</section>` : ''}
    ${v.video ? `<a class="video-link" href="${escape(v.video)}" target="_blank" rel="noopener noreferrer">Watch vehicle video ${icon('link')}</a>` : ''}</div></div>
  </main>`;
  return shell(`${title} | ${v.dealer_name}`, body, { path, photo: v.photos[0], description: `${title}. ${v.is_active === false ? 'No longer listed.' : `${money(v.price)}${v.price ? ' CAD' : ''}.`} View photos and full vehicle details from ${v.dealer_name}.` });
}

export function renderMessage(title, message, retry = false) {
  return shell(title, `<main class="message-page"><div class="message-icon">${icon('car')}</div><h1>${escape(title)}</h1><p>${escape(message)}</p>${retry ? '<button class="button button-primary" data-retry>Try again</button>' : ''}</main>`);
}
