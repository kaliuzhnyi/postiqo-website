// Render the demo with the production card layout, styles and gallery.
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
const { projectVehicle, renderPage } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

const photoNames = ['exterior', 'rear', 'interior'];
const vehicle = projectVehicle({
  title: '2023 Toyota RAV4 XLE AWD',
  year: 2023, make: 'Toyota', model: 'RAV4', trim: 'XLE AWD',
  price: 32995, mileage: 38450, cylinders: 4, is_active: 1,
  vin: '2T3P1RFV1PC000001', stockno: 'P23001',
  body_type: 'SUV', vehicle_condition: 'Pre-owned',
  drivetrain: 'All-wheel drive', transmission: 'Automatic', fuel_type: 'Gasoline',
  exterior_color: 'Silver', interior_color: 'Black cloth',
  description: 'An everyday SUV with room for the commute, weekend trips and everything in between. This silver Toyota RAV4 XLE AWD pairs a comfortable black cloth interior with a practical five-seat layout.\n\nWith 38,450 km, automatic transmission and all-wheel drive, it is ready for your next chapter. The cabin brings the controls within easy reach, with space for passengers and the things you take along.\n\nBrowse the exterior and interior photos for a closer look. Contact our team to ask about availability, arrange a viewing or book a test drive.',
  dealer_name: 'Postiqo Motors',
  dealer_address: 'Barrie, Ontario, Canada',
  dealer_phone: '+1 (437) 441-6585',
  dealer_email: 'support@postiqo.io',
  photos_json: JSON.stringify(photoNames.map(name => `${origin}/assets/img/cards-demo/${name}.webp`)),
});
let html = renderPage(vehicle, route);
function replaceOnce(before, after) {
  if (html.split(before).length !== 2) throw new Error(`Demo template changed: ${before}`);
  html = html.replace(before, after);
}
const title = '2023 Toyota RAV4 | Postiqo Motors';
const description = 'Explore a sample Postiqo vehicle card with exterior and interior photos, specifications and dealership contact buttons. A fictional listing for demonstration.';
html = html.replace(/<meta name="description" content="[^"]*"\/>/, `<meta name="description" content="${description}">`);
html = html.replaceAll(`https://cards.postiqo.io${route}`, origin + route);
replaceOnce('content="noindex,nofollow"', 'content="noindex, follow"');
// Removing the live-card hook makes the unmodified client return after gallery setup.
replaceOnce(` data-vehicle-card data-endpoint="/api${route}"`, '');
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
</head>`);
html = html.replaceAll(`src="${origin}/`, 'src="/');
if (/data-vehicle-card|data-endpoint|https:\/\/cards\.postiqo\.io/.test(html)) throw new Error('The static demo must not request live inventory.');
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
