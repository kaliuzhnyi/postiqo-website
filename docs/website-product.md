# Postiqo Website

## Product and route

- Public URL: `https://postiqo.io/products/postiqo-website/`
- Positioning: Keep your DMS. Upgrade your website.
- Standalone product: no Publisher subscription requirement or Website bundle.
- Starting at C$3,500 one-time setup plus C$299/month for the managed service.
- Complex or custom DMS integrations may require additional setup work and will be quoted separately.

The existing DMS or supported inventory source remains the source of truth. The website reads its inventory data through an agreed integration. Available fields, synchronization frequency and sold vehicle removal depend on that source. No specific DMS vendor, universal compatibility, lead volume or ranking guarantee is advertised.

## Implementation

The page reuses the static product shell, navigation, footer, typography, buttons, icons, workflow steps, FAQ and CTA styles. Product-specific layout is in `assets/css/website.css`. Shared catalog additions are in `assets/css/products.css`.

Website appears in the Products menus and footers of all seven public marketing pages, the homepage hero and product grid, and the Products catalog. The homepage and catalog each use three compact product cards with links to the full pages. The catalog has no repeated comparison or pricing sections; `/products/#pricing` leads to the cards and their prices. Publisher and Cards prices and access requirements are unchanged.

The hero is an illustrative HTML/CSS layout using the existing sample vehicle image at `assets/img/cards-demo/exterior.webp`. It is labelled as an illustration and does not present a customer website or a named integration. No new client assets are required for this version. An approved real Website screenshot can replace the illustration later.

## Quote and demo requests

- Quote: `/?product=website&request=quote#contact`
- Demo: `/?product=website&request=demo#contact`

Both links use the existing homepage contact form. `assets/js/site.js` selects fixed Website copy and prompts for the DMS or inventory source. `assets/js/request-form.js` includes the Website product and quote/demo intent in the supported `message` field, even if the visitor replaces the suggested text. The field's maximum length allows space for that context.

Requests use the existing protected `/v1/public/demo-requests` endpoint and appear in the existing demo-request queue. No new quote endpoint, meeting scheduler, backend migration or credentials are introduced. The existing Turnstile verification, validation and retry identifier remain in use. Demo requests ask the team to arrange a time. Live submission from localhost requires the backend's allowed Origin and Turnstile settings; local UI checks should not send production enquiries.

## SEO and sharing

- Title: Custom Dealership Websites | Postiqo Website
- Description: Build a modern custom dealership website without replacing your DMS. Postiqo Website connects to your existing inventory system and keeps vehicles synchronized.
- Canonical: the public product URL above.
- Robots: index, follow, with the site's existing preview directives.
- Open Graph title: Keep Your DMS. Upgrade Your Website. | Postiqo
- Open Graph description: A custom dealership website connected to the inventory system you already use. Keep your DMS and upgrade the customer experience.
- Open Graph and Twitter image: `https://postiqo.io/public/og-website.png`, 1200 x 630, with descriptive alt text.
- Twitter card: `summary_large_image`, with the same marketing copy.
- JSON-LD: Organization, WebSite, WebPage, BreadcrumbList and Service. The service description states the starting setup and recurring CAD prices. There is no fixed-price Offer that could misrepresent the two-part pricing, and no ratings or reviews.
- The homepage and Products ItemList now include Website. The new route is in `sitemap.xml`.

Regenerate the social previews with `python scripts/generate-product-social-images.py`. Website has a dedicated image; the homepage and catalog previews now show all three products.

## Reusable social copy

Use the following English draft for LinkedIn or Facebook. It is prepared content, not a published post.

```text
Love your DMS but not the website that came with it?

Keep your existing inventory system and upgrade the customer-facing experience with Postiqo Website.

Custom dealership design.
Inventory synchronization from a supported source.
Modern SRP and VDP pages.
Managed hosting and support.

Starting at C$3,500 setup + C$299/month.

Tell us which DMS or inventory source you use. Let's discuss the right connection for your dealership.

https://postiqo.io/products/postiqo-website/

#Postiqo #AutomotiveSoftware #DealershipSoftware #CarDealership #AutoDealer #DealerTechnology #AutomotiveRetail #DealershipWebsite
```

Short version:

```text
Keep your DMS. Upgrade your website.

Meet Postiqo Website: a custom dealership website connected to the inventory system you already use.

Starting at C$3,500 setup + C$299/month. Request a quote:
https://postiqo.io/products/postiqo-website/
```

The product page contains no hashtags. Optional campaign links can use `utm_source=linkedin` or `utm_source=facebook`, `utm_medium=organic_social` and `utm_campaign=postiqo_website`. These parameters do not install analytics or create reports by themselves.

## Validation

```text
python scripts/check-seo.py
node --test tests/savings-calculator.test.cjs
node scripts/generate-cards-demo.mjs --check
node --check assets/js/site.js
node --check assets/js/request-form.js
```

The marketing site is static HTML with no root build, lint or TypeScript task. Check the Website hero, feature grid, pricing, catalog and shared menus at desktop, tablet and mobile sizes. Follow both inquiry links and confirm the selected intent and DMS prompt. Confirm Publisher demos, pricing, calculator, trial and download links still work.

Checked locally on September 28, 2026:

- SEO checks passed for all seven marketing pages and the Cards demo, including internal links, local assets, sitemap and social image dimensions.
- All nine existing calculator tests and the Cards demo generation check passed. JavaScript syntax checks passed.
- Website layout checked at 320, 390, 768, 1024 and 1440 px with no horizontal document overflow. Desktop and mobile pricing, the responsive feature grid and Products navigation were reviewed in the browser.
- Quote and Demo links opened the shared form with the corresponding Website context. A local mock verified both request payloads, website URL normalization, a stable request ID after uncertain delivery and success handling. The existing general form passed the same check. No production enquiry was sent.
- Publisher calculator input and demo tabs, Cards gallery, product navigation, trial and download routes passed local checks. Existing Publisher pricing cards and Cards pricing were compared against the starting revision and are unchanged.
- Eighteen local HTTP routes/assets returned 200, including the new product, its trailing-slash redirect and both inquiry URLs.

## Files in this change

New files:

- `products/postiqo-website/index.html`
- `assets/css/website.css`
- `public/og-website.png`
- `docs/website-product.md`

Updated files:

- `index.html` and `products/index.html`: Website hero link and product cards, product family copy, metadata, compact catalog and contact copy.
- `products/postiqo-publisher/index.html`, `products/postiqo-cards/index.html`, `try/index.html`, `download/index.html`: shared navigation/footer and asset versions.
- `assets/css/products.css`: three-product catalog and homepage hero labels.
- `assets/js/site.js`, `assets/js/request-form.js`: Website enquiry context in the existing contact flow.
- `scripts/check-seo.py`, `scripts/generate-product-social-images.py`: new route checks and reproducible social previews.
- `public/og-home.png`, `public/og-products.png`: three-product previews.
- `sitemap.xml`, `README.md`, `docs/products-and-seo.md`, `docs/seo-marketing.md`: route and maintenance documentation.
