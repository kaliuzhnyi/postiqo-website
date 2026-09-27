// Reuse the production card renderer and gallery without changing the Worker.
// Run with --check to verify the committed demo is up to date.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = async path => (await readFile(new URL(path, root), 'utf8')).replaceAll('\r\n', '\n');
const route = '/products/postiqo-cards/demo/';
const origin = 'https://postiqo.io';
const font = '/assets/fonts/Nunito-VariableFont_wght.ttf';
const css = (await read('cloudflare-workers/cards/src/card.css')).replaceAll('__FONT_URL__', font);
const js = await read('cloudflare-workers/cards/src/card-client.js');
const version = content => createHash('sha256').update(content).digest('hex').slice(0, 12);
const urls = {
  font,
  css: `/assets/css/cards-template.css?v=${version(css)}`,
  js: `/assets/js/cards-template.js?v=${version(js)}`,
};
const source = await read('cloudflare-workers/cards/src/render.js');
const importLine = "import { urls } from '../generated/assets.js';";
if (!source.startsWith(importLine)) throw new Error('Card renderer import changed; review the demo generator.');
const moduleSource = source.replace(importLine, `const urls = ${JSON.stringify(urls)};`);
const { projectVehicle, renderPage, escape } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

const photoNames = ['exterior', 'rear', 'interior'];
const vehicle = projectVehicle({
  title: '2023 Toyota RAV4 XLE AWD',
  year: 2023, make: 'Toyota', model: 'RAV4', trim: 'XLE AWD',
  price: 32995, mileage: 38450, cylinders: 4, is_active: 1,
  vin: 'DEMO-VEHICLE-001', stockno: 'DEMO-001',
  body_type: 'SUV', vehicle_condition: 'Pre-owned',
  drivetrain: 'All-wheel drive', transmission: 'Automatic', fuel_type: 'Gasoline',
  exterior_color: 'Silver', interior_color: 'Black cloth',
  description: 'An everyday SUV with room for the commute, weekend trips and everything in between. This sample RAV4 pairs a silver exterior with a comfortable black interior and a practical five-seat layout.\n\nTake a closer look at the cabin before you step inside. Browse the exterior and interior photos, open any image fullscreen, and find the key vehicle details in one place.\n\nIn a real Postiqo Card, this space contains the complete description from your dealership inventory. Buyers can read it on the lot, save the link for later, and contact your team directly from the card.',
  dealer_name: 'Postiqo Demo Motors',
  dealer_address: 'Example dealership\nOntario, Canada',
  dealer_phone: '+1 (705) 555-0147',
  dealer_email: 'sales@example.com',
  photos_json: JSON.stringify(photoNames.map(name => `${origin}/assets/img/cards-demo/${name}.webp`)),
});
let html = renderPage(vehicle, route);
function replaceOnce(before, after) {
  if (html.split(before).length !== 2) throw new Error(`Demo template changed: ${before}`);
  html = html.replace(before, after);
}
const title = 'Postiqo Cards Demo | Explore a Sample Vehicle Card';
const description = 'Explore a sample Postiqo vehicle card with exterior and interior photos, specifications and dealership contact buttons. A fictional listing for demonstration.';
replaceOnce('<title>2023 Toyota RAV4 | Postiqo Demo Motors</title>', `<title>${title}</title>`);
replaceOnce('<meta property="og:title" content="2023 Toyota RAV4 | Postiqo Demo Motors">', `<meta property="og:title" content="${title}">`);
html = html.replace(/<meta name="description" content="[^"]*"\/>/, `<meta name="description" content="${description}">`);
html = html.replaceAll(`https://cards.postiqo.io${route}`, origin + route);
replaceOnce('content="noindex,nofollow"', 'content="noindex, follow"');
// Removing the live-card hook makes the unmodified client return after gallery setup.
replaceOnce(` data-vehicle-card data-endpoint="/api${route}"`, ' id="vehicle"');
replaceOnce('<body>', `<body>
<a class="demo-skip" href="#vehicle">Skip to vehicle</a>
<header class="demo-banner"><div class="demo-banner-inner">
  <div><a class="demo-brand" href="/products/postiqo-cards/">postiqo <span>cards</span></a><span class="demo-label">Interactive demo</span></div>
  <p>Sample vehicle. Not for sale.</p>
  <a class="demo-back" href="/products/postiqo-cards/">Back to Postiqo Cards <span aria-hidden="true">&#8599;</span></a>
</div></header>`);
replaceOnce('</head>', `<meta property="og:description" content="${description}">
<meta property="og:site_name" content="Postiqo">
<meta property="og:locale" content="en_CA">
<meta property="og:image:alt" content="Illustrative silver Toyota RAV4 on the Postiqo Cards demo">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${origin}/assets/img/cards-demo/exterior.webp">
<meta name="twitter:image:alt" content="Illustrative silver Toyota RAV4 on the Postiqo Cards demo">
<link rel="icon" href="/postiqo-favicon-96.png" sizes="96x96" type="image/png">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/css/cards-demo.css?v=1">
<script src="/assets/js/cards-demo.js?v=1" defer></script>
</head>`);
replaceOnce('data-availability>Available</span>', 'data-availability>Demo vehicle</span>');
replaceOnce('<span class="eyebrow">Asking price</span>', '<span class="eyebrow">Example asking price</span>');
replaceOnce('<span>VIN</span>', '<span>Demo VIN</span>');
replaceOnce('href="tel:+17055550147"', 'href="#demo-contact" data-demo-contact="call"');
replaceOnce('href="mailto:sales@example.com"', 'href="#demo-contact" data-demo-contact="email"');
replaceOnce('<p class="phone-number">+1 (705) 555-0147</p>', '<p class="phone-number">+1 (705) 555-0147 <span>(sample number)</span></p>');
replaceOnce('</div>\n  </section>', `</div>
    <div class="demo-contact" id="demo-contact" tabindex="-1"><p class="demo-contact-title">Try the contact buttons</p><p data-demo-notice role="status">In a real card, these open your phone or email app with the dealership's contact details. This demo does not place calls or send messages.</p></div>
  </section>`);
replaceOnce('</section></div>\n    <div class="summary-column">', '</section><p class="demo-photo-note">Illustrative AI-generated photos. Vehicle details and price are examples.</p></div>\n    <div class="summary-column">');
replaceOnce('</main>', `</main>
<aside class="demo-cta" aria-label="Get Postiqo Cards"><div><h2>Picture this on your lot.</h2><p>Your inventory. Your photos. Your dealership contacts.</p><p class="demo-terms">Cards is included with 2+ active Publisher subscriptions at your dealership.</p></div><a class="button button-primary" href="/products/postiqo-cards/#pricing">Explore Postiqo Cards</a></aside>`);
html = html.replaceAll(`src="${origin}/`, 'src="/');
const photoAlts = ['Front three-quarter exterior view', 'Rear three-quarter exterior view', 'Dashboard and black cloth front seats'];
for (const [i, alt] of photoAlts.entries()) {
  html = html.replace(`alt="${escape(vehicle.title)} - photo ${i + 1}"`, `alt="${alt} of the sample Toyota RAV4, AI-generated illustration" width="1448" height="1086"`);
}
if (/data-vehicle-card|data-endpoint|href="(?:tel:|mailto:)|https:\/\/cards\.postiqo\.io/.test(html)) throw new Error('Demo must be isolated from live vehicle services and contacts.');
const files = new Map([
  ['products/postiqo-cards/demo/index.html', html + '\n'],
  ['assets/css/cards-template.css', css],
  ['assets/js/cards-template.js', js],
]);
for (const [path, content] of files) {
  if (process.argv.includes('--check')) {
    if (await read(path) !== content) throw new Error(`${path} is outdated. Run node scripts/generate-cards-demo.mjs`);
  } else {
    const filename = fileURLToPath(new URL(path, root));
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, content);
  }
}
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} static Cards demo, production template CSS and gallery script.`);
