import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { calculatorBody } from './templates/car-payment-calculator.mjs';
import { help } from './templates/tool-help.mjs';

const root = new URL('../', import.meta.url);
const cardSource = await readFile(new URL('cloudflare-workers/cards/src/render.js', root), 'utf8');
const taxProvinces = runInNewContext(cardSource.match(/const (?:taxProvinces|provinces) = (\[[\s\S]*?\]);/)[1]);
const template = (await readFile(new URL('products/index.html', root), 'utf8')).replaceAll('\r\n', '\n');
const e = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const header = template.match(/<header class="site-header"[\s\S]*?<\/header>/)[0]
  .replace(' class="current-product"', '').replace(' aria-current="page"', '')
  .replace('href="/tools/"', 'href="/tools/" aria-current="page"');
const footer = template.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)[0];
const resources = template.slice(template.indexOf('<link rel="icon"'), template.indexOf('<script type="application/ld+json">'));
const cta = `<section class="tool-publisher"><div><span class="marketing-eyebrow">Meet the rest of Postiqo</span><h2>More time for the next buyer.</h2><p>Working with vehicle listings every day? Postiqo Publisher helps dealerships publish to Facebook Marketplace and Craigslist, then keep prices and availability up to date.</p></div><a class="site-button" href="/products/postiqo-publisher/">Explore Postiqo Publisher <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a></section>`;
const faq = items => `<section class="tool-faq" aria-labelledby="faq-title"><h2 id="faq-title">A few useful answers</h2>${items.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;
const pages = [
  {
    slug: '', name: 'Free Tools', title: 'Free Car Payment Calculator & VIN Decoder | Postiqo',
    description: 'Free tools for car buyers and dealership sales teams. Estimate Canadian car loan and lease payments or decode a VIN to look up vehicle specifications. No sign-up needed.',
    image: 'tools', eyebrow: 'Ready when you are.', heading: 'Free tools.<br>A little less guesswork.',
    intro: 'A payment estimate. A closer look at a vehicle. Two everyday tools for car buyers and dealership teams, free to use without an account.',
    body: `<div class="tool-catalog">
      <article class="tool-card"><span class="product-icon"><i class="bi bi-calculator" aria-hidden="true"></i></span><span class="tool-free">Free / No sign-up</span><h2><a href="/tools/car-payment-calculator/">Car payment calculator</a></h2><p>Compare auto loan and lease payments, see the cost breakdown and explore the full payment schedule. Includes Canadian tax presets.</p><span class="tool-card-link">Calculate a payment <i class="bi bi-arrow-right" aria-hidden="true"></i></span></article>
      <article class="tool-card tool-card-vin"><span class="product-icon"><i class="bi bi-upc-scan" aria-hidden="true"></i></span><span class="tool-free">Free / No sign-up</span><h2><a href="/tools/vin-decoder/">VIN decoder</a></h2><p>Turn a 17-character VIN into a clear vehicle overview. Look up the year, make, model, engine and other available specifications.</p><span class="tool-card-link">Decode a VIN <i class="bi bi-arrow-right" aria-hidden="true"></i></span></article>
    </div><p class="tool-catalog-note">Built from the tools behind <a href="/products/postiqo-cards/">Postiqo Digital Cards</a>. Open a tool, enter your details and get straight to the result.</p>${cta}`,
  },
  {
    slug: 'car-payment-calculator/', name: 'Car Payment Calculator', title: 'Car Loan & Lease Calculator Canada - Free Tool | Postiqo',
    description: 'Calculate car loan and lease payments in Canada. See taxes, interest, cost breakdowns and a full payment schedule. Free, private and no sign-up required.',
    image: 'car-payment-calculator', eyebrow: 'Your car payment. The whole picture.', heading: 'Car loan &amp; lease<br>calculator.',
    intro: 'Loan or lease. Explore your payment, see where the money goes, and follow the balance over time. All in Canadian dollars.',
    styles: '<link rel="stylesheet" href="/assets/css/finance.css?v=2">',
    scripts: '<script src="/assets/js/car-payment-calculator.js?v=2" type="module"></script>',
    body: calculatorBody({ taxProvinces, faq, cta }),
  },
  {
    slug: 'vin-decoder/', name: 'VIN Decoder', title: 'Free VIN Decoder - Look Up Vehicle Specifications | Postiqo',
    description: 'Decode a 17-character VIN for free. Look up the vehicle year, make, model, engine, drivetrain and available specifications using NHTSA data. No account needed.',
    image: 'vin-decoder', eyebrow: '17 characters. A clearer picture.', heading: 'Free VIN decoder.',
    intro: 'Look up a vehicle\'s identity and available specifications, from model year to engine details. Enter a VIN to get started.',
    scripts: '<script src="/assets/js/vin-decoder.js?v=1" defer></script>',
    body: `<section class="vin-tool" aria-label="VIN lookup"><form id="vin-form" novalidate><div class="tool-panel-heading"><h2>What are you looking at?</h2><span class="tool-free">Free / No sign-up</span></div><div class="vin-inputs"><div class="tool-field"><div class="tool-label-help"><label for="vin-input">Vehicle identification number</label>${help('help-vin-input','Vehicle identification number','Enter all 17 characters from the windshield plate, driver-side door label or registration. VINs use letters and numbers but never I, O or Q. This tool retrieves manufacturer specifications, not accident, ownership or lien history.')}</div><input id="vin-input" name="vin" type="text" placeholder="Enter a 17-character VIN" maxlength="17" minlength="17" pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}" autocomplete="off" autocapitalize="characters" spellcheck="false" required aria-describedby="help-vin-input vin-help vin-message"></div><div class="tool-field vin-year"><div class="tool-label-help"><label for="vin-year">Model year <span>(optional)</span></label>${help('help-vin-year','Model year','Enter the manufacturer\'s model year if you know it, which may differ from the registration or production year. It helps distinguish repeating VIN year codes. Leave this field blank if you are unsure; the decoder will try to infer the year.')}</div><input id="vin-year" name="year" type="number" min="1981" step="1" inputmode="numeric" placeholder="If known" aria-describedby="help-vin-year vin-message"></div><button class="site-button" id="vin-submit" type="submit">Decode VIN <i class="bi bi-arrow-right" aria-hidden="true"></i></button></div><p class="tool-help" id="vin-help">Find the VIN at the base of the windshield, on the driver-side door label or on the registration. VINs do not use I, O or Q.</p><div class="vin-actions"><button type="button" class="tool-text-button" id="vin-example">Try an example VIN</button><button type="reset" class="tool-text-button">Clear</button><span id="vin-count" aria-live="polite">0 / 17 characters</span></div><p class="tool-help vin-privacy">Your VIN is sent to NHTSA to retrieve specifications. Lookups may be cached to make repeat requests faster.</p><p class="tool-error" id="vin-message" role="status" aria-live="polite" hidden></p><noscript><p class="tool-error">Enable JavaScript to decode a VIN, or use the <a href="https://vpic.nhtsa.dot.gov/decoder/">NHTSA VIN decoder</a>.</p></noscript></form></section>
    <section class="vin-result" id="vin-result" aria-labelledby="vin-result-title" hidden><div class="vin-result-heading"><div><span class="marketing-eyebrow">Vehicle overview</span><h2 id="vin-result-title" tabindex="-1"></h2><p id="vin-result-code"></p></div><span class="vin-source">NHTSA vPIC data</span></div><p id="vin-result-note"></p><div class="vin-specs" id="vin-specs"></div><p class="tool-help">Specifications describe the decoded vehicle configuration. Confirm the actual vehicle's features and condition before buying or publishing a listing.</p></section>
    <section class="tool-explainer"><div><h2>From VIN to vehicle details</h2><p>Our VIN lookup uses the same NHTSA vPIC data source and validation behind Postiqo Digital Cards. Available results are grouped into vehicle identity, engine and drivetrain, and body and manufacturing details.</p><p>Coverage is strongest for vehicles intended for the U.S. market. Many Canadian vehicles are covered, but a VIN may return only part of the specification.</p></div><div><h2>A useful first look</h2><p>Check a model year, review engine details or prepare a vehicle listing. A VIN decoder gives you a starting point for understanding the car in front of you.</p><p>It does not provide accident, ownership, lien, service or mileage history. Missing fields are left out, and a decode that needs verification is flagged.</p></div></section>
    ${faq([
      ['What information can a VIN decoder show?', 'Depending on the VIN, results can include the year, make, model, trim, body style, engine displacement and cylinders, fuel type, drivetrain, transmission, seats, doors and assembly country. Not every manufacturer supplies every field.'],
      ['Can I decode a Canadian vehicle VIN?', 'Many Canadian vehicles can be decoded through NHTSA vPIC, particularly models also intended for the U.S. market. Coverage varies by manufacturer, year and market. Verify the result against the vehicle and its documents.'],
      ['Why does my VIN return no result or a warning?', 'Check all 17 characters and try adding the model year if you know it. Invalid characters, a check-digit warning, an older VIN or limited manufacturer data can prevent a reliable result. We do not present an uncertain decode as confirmed specifications.'],
      ['Is this a vehicle history report?', 'No. This is a vehicle specification lookup. It does not check accidents, title, liens, recalls or odometer history, and it does not replace a vehicle inspection or a history report.'],
      ['Where does the vehicle information come from?', 'The data comes from <a href="https://vpic.nhtsa.dot.gov/">NHTSA\'s Product Information Catalog and Vehicle Listing (vPIC)</a>, based on manufacturer submissions. See the <a href="https://vpic.nhtsa.dot.gov/api/">vPIC API documentation</a> for coverage and decoding details.'],
      ['Can I estimate payments after checking a VIN?', 'Yes. Open the <a href="/tools/car-payment-calculator/">car payment calculator</a> and enter the vehicle price, down payment, rate and term. The VIN decoder does not provide a sale price or a vehicle valuation.'],
    ])}${cta}`,
  },
];

for (const page of pages) {
  const path = '/tools/' + page.slug, url = 'https://postiqo.io' + path;
  const trail = [['Home', '/'], ['Free Tools', '/tools/'], ...(page.slug ? [[page.name, path]] : [])];
  const appId = url + (page.slug ? '#tool' : '#tools');
  const schemas = { '@context': 'https://schema.org', '@graph': [
    { '@type': page.slug ? 'WebPage' : 'CollectionPage', '@id': url + '#webpage', url, name: page.title, description: page.description, inLanguage: 'en-CA', isPartOf: { '@id': 'https://postiqo.io/#website' }, breadcrumb: { '@id': url + '#breadcrumb' }, mainEntity: { '@id': appId } },
    { '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: trail.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item: 'https://postiqo.io' + item })) },
    page.slug ? { '@type': 'WebApplication', '@id': appId, name: page.name, url, description: page.description, applicationCategory: page.slug.startsWith('car-') ? 'FinanceApplication' : 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern web browser.', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD' }, provider: { '@id': 'https://postiqo.io/#organization' } }
      : { '@type': 'ItemList', '@id': appId, name: 'Free Postiqo tools', itemListElement: pages.filter(p => p.slug).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: 'https://postiqo.io/tools/' + p.slug })) },
  ] };
  const image = 'https://postiqo.io/public/og-' + page.image + '.png' + (page.slug.startsWith('car-') ? '?v=2' : '');
  const html = `<!DOCTYPE html>
<html lang="en-CA"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(page.title)}</title>
<meta name="description" content="${e(page.description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#0868cb"><link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Postiqo"><meta property="og:locale" content="en_CA"><meta property="og:url" content="${url}">
<meta property="og:title" content="${e(page.title)}"><meta property="og:description" content="${e(page.description)}">
<meta property="og:image" content="${image}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${e(page.name)} - free tools from Postiqo">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(page.title)}"><meta name="twitter:description" content="${e(page.description)}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="${e(page.name)} - free tools from Postiqo">
${resources}<link rel="stylesheet" href="/assets/css/tools.css?v=1"><link rel="stylesheet" href="/assets/css/tool-help.css?v=2"><script src="/assets/js/tool-help.js?v=3" defer></script>${page.styles || ''}${page.scripts || ''}
<script type="application/ld+json">${JSON.stringify(schemas, null, 2)}</script>
</head><body class="marketing-page tools-page${page.slug === 'vin-decoder/' ? ' vin-page' : page.slug.startsWith('car-') ? ' finance-page' : ''}"><a class="site-skip" href="#main">Skip to content</a>
${header}
<main id="main"><section class="catalog-hero tools-hero"><div class="marketing-container"><nav aria-label="Breadcrumb"><ol class="product-breadcrumbs">${trail.map(([name, item], i) => i === trail.length - 1 ? `<li aria-current="page">${name}</li>` : `<li><a href="${item}">${name}</a></li>`).join('')}</ol></nav><span class="marketing-eyebrow">${page.eyebrow}</span><h1>${page.heading}</h1><p class="marketing-intro">${page.intro}</p></div></section><div class="marketing-container tools-content">${page.body}</div></main>
${footer}
</body></html>
`;
  const file = new URL('tools/' + page.slug + 'index.html', root);
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== html) throw new Error('Regenerate ' + path);
  } else { await mkdir(new URL('.', file), { recursive: true }); await writeFile(file, html); }
}
console.log(process.argv.includes('--check') ? 'Public tool pages are current.' : 'Generated three public tool pages.');
