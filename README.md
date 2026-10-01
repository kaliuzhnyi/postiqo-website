# postiqo-website

## Product pages

- `/` introduces Postiqo with Publisher as the main starting point.
- `/products/` gives Publisher, Digital Cards, Website and Pages one compact card each, with pricing and links to the full product pages.
- `/products/postiqo-publisher/` contains the full Publisher page, including the existing calculator, demos, templates, price sheets, pricing and FAQ.
- `/products/postiqo-cards/` explains digital QR vehicle cards and the included access requirement.
- `/products/postiqo-website/` presents custom dealership websites connected to an existing DMS or supported inventory source, starting at C$3,500 setup plus C$299/month.
- `/products/postiqo-pages/` presents landing pages and simple local business websites from C$1,000, with free hosting and domain registration and renewal at cost, without markup or commission.
- `/products/postiqo-cards/demo/` opens a fictional vehicle in the production card layout, with exterior/interior photos and working public Postiqo contacts.

Cards is included for a dealership with at least two active Publisher subscriptions, with no additional Cards fees or commissions. It is not sold separately. Public Publisher pricing is C$149 per account/month, or C$129 per account/month with at least five accounts. Two Publisher subscriptions cost C$298/month in total. Craigslist publishing is also included with 2+ accounts. Accounts 2-4 remain C$149 each; the C$129 rate applies to every account from 5 accounts. These public prices apply to new customers only. Existing customer billing is managed separately and is not changed by website pricing or the savings calculator.

All eight public pages share the Products navigation and footer. Shared styling is in `assets/css/products.css`, and menu behavior is in `assets/js/site.js`. HTML is static and needs no build. When editing shared navigation or footer copy, update all eight pages together. The site script forwards old homepage links such as `/#savings` and `/#price-sheets` to the corresponding Publisher section. Current internal links point directly to the new addresses.

See [product structure and SEO notes](docs/products-and-seo.md) for the route map, verified Cards behavior and publication checks. Marketing changes do not change the Cards Worker, licensing, DNS or Cloudflare configuration.

The demo is static and uses the existing Cards renderer, CSS and gallery script without extra banners, captions or marketing blocks. Run `node scripts/generate-cards-demo.mjs` after changes to the original card template, and `node scripts/generate-cards-demo.mjs --check` before publishing. Its `noindex` page is excluded from the sitemap and makes no inventory API requests. The call and email buttons use the public Postiqo phone and support email through standard `tel:` and `mailto:` links. The shared footer links directly to the Cards product page. See [demo assets and generation prompts](docs/cards-demo.md).

## Digital vehicle cards

Public QR cards at `cards.postiqo.io/{dealership_id}/{VIN}` are served by a
separate Cloudflare Worker and read the existing Publisher inventory database.
See [the cards service guide](cloudflare-workers/cards/README.md) for local
preview, refresh behavior, testing and deployment.

## SEO and dealer conversion

The eight public pages have unique titles, descriptions, canonical URLs, Open Graph and Twitter cards and are included in `sitemap.xml`. Keep unused template pages excluded with `noindex`; do not block them in robots.txt, because crawlers need to read that directive.

The homepage and Products page describe the product family with ItemList, Organization, WebSite and WebPage/CollectionPage data. Individual products have their own entities and breadcrumbs. Publisher contains its pricing and existing FAQ structured data. Pricing is per account in CAD, and the five-account minimum is explicit. Cards describes its access conditions without a standalone free offer. Never invent ratings to satisfy a rich-result validator. When editing Publisher FAQ answers, update their JSON-LD equivalents as well. FAQ rich results are no longer supported by Google; the visible answers remain useful to visitors.

Six distinct 1200 x 630 social previews live at `public/og-home.png`, `public/og-products.png`, `public/og-publisher.png`, `public/og-cards.png`, `public/og-website.png` and `public/og-pages.png`. Regenerate them with `python scripts/generate-product-social-images.py` (requires Pillow). This is an asset maintenance command, not a site build step.

The calculator in `assets/js/savings-calculator.js` shows only vehicle inventory and hourly staff cost by default, starting with 90 vehicles and C$20/hour. The collapsed assumptions contain posting (7 minutes), finding/removing an old ad (1 minute), group sharing (1 minute), a 7-day replacement cycle, and account count. These are editable estimates for a familiar routine using existing vehicle photos and details, not measured customer results. It models an ongoing 30-day month: inventory / cycle days x 30 x total task minutes / 60. The daily average is never rounded before calculating monthly hours. Postiqo costs include only the subscription, with the C$129 rate at five accounts. Account count affects the subscription without multiplying the inventory, and negative results remain visible. It sends no calculator inputs to a server. Pricing changes must be applied to the cards, schema, calculator, examples, and tests together.

Run `python scripts/check-seo.py` and `node --test tests/savings-calculator.test.cjs` before publishing. The checks cover metadata, internal links/assets, FAQ/schema consistency, sitemap, and calculator arithmetic. Browser checks should also cover mobile navigation, calculator input/reset/error states, native FAQs, demo tabs, and the trial/download paths. Video posters come from the existing demos; videos load on demand. Marketing content and FAQ answers remain available without animation scripts.

Website is a standalone managed service. Its Service JSON-LD describes the starting setup and recurring pricing without a misleading fixed-price Offer. Quote and demo CTAs reuse the homepage contact form, preserving Website intent in the existing message field. See [Website content, inquiry flow and reusable social copy](docs/website-product.md).

Pages reuses the Website layouts in `assets/css/website.css`, with a scoped lilac and peach palette in `assets/css/pages.css`. Its quote CTA opens `/?product=pages&request=quote#contact`. The shared form asks about the business, pages and domain, and preserves `Postiqo Pages quote request` in the supported message field. Its Service JSON-LD describes starting CAD pricing, free hosting and separate domain costs without a fixed-price Offer. The homepage and catalog use a two-column product grid for all four products.

See [SEO and marketing handoff](docs/seo-marketing.md) for query intent, factual claims, publication checks, and suggested social copy.

## Inventory templates and price sheets

The Publisher page sections `#description-templates` and `#price-sheets` explain these tools through dealership use cases, illustrative examples, and calls to try Postiqo. The trial and download pages link directly to them. Styling for the examples lives in `assets/css/inventory-tools.css`; they are illustrations, not product screenshots.

Keep claims aligned with the app: listing templates have no fixed count limit and optional CEL conditions; matching special templates take precedence, with random selection among matches and general templates as fallback. Price Sheets imports editable DOCX templates and exports PDFs with one page per vehicle, up to 200 selected vehicles per batch. PDF generation needs the optional local document engine. Do not imply that printed sheets update automatically or that template conditions select price sheet designs.

When updating the older description-template demo video, remove its version note only when the replacement shows the current editor. Keep the visible FAQs and JSON-LD answers synchronized.

## Getting started and trial requests

- `/try/` links directly to the stable Windows installer and guides visitors through importing and previewing inventory for free, then requesting a 7-day publishing trial in the app.
- `/download/` provides the current Windows installer and links back to the setup guide.
- **Try Publisher** is the primary action in the shared navigation and homepage hero. The Publisher page also links to the same setup guide from its pricing and final call to action. Live demos remain optional setup help.

The primary trial request lives in Postiqo Publisher. Customers first sign in to Facebook in the app, which includes the account automatically. The dealership website is required and can be edited after being filled from the inventory source settings. Importing and reviewing vehicles needs neither a license nor Facebook sign-in. Publishing still requires an active license.

The collapsed website trial form is an optional fallback. It sends to `https://licensing.postiqo.io/v1/public/trial-requests`, which stores requests in the same Cloudflare D1 queue as the desktop and exposes them at `https://admin.postiqo.io/#trials`. Demo requests use `/v1/public/demo-requests`, are saved in `demo_requests` in the same database, and notify the administrator. The Demo section at `https://admin.postiqo.io/#demos` keeps all submitted contact fields and the message and can create a pending trial or license after the administrator supplies a Facebook account. The website does not assign a meeting time; the team contacts the customer to arrange one. Both forms use the shared handler in `assets/js/request-form.js` and Cloudflare Email Service. Formspree is no longer used.

Demo requests include name, dealership, email, message, optional phone and optional dealership website. A stable `request_id` is reused when retrying the same details after a failed or uncertain response. New details or a confirmed successful request start a new ID. Cloudflare saves the lead before attempting email, so notification failures cannot lose a request. Deploy licensing migration 0004 and both Workers before publishing these assets.

The six contact fields match the desktop form: name (120 characters), dealership (200), website (2048), email (254), phone (40), and optional message (5000). The website additionally asks for the Facebook account that the desktop supplies after login. Source is assigned by the server and displayed in the administration table and notification.

Opening the website form loads the public Turnstile configuration and a managed verification widget. Submission requires server-side token verification, an allowed website Origin and an IP rate limit. The Worker fixes the source to `website`, applies the one-trial-per-account rule and schedules one administrator notification for a new request. No desktop token, Turnstile secret, admin credential or AI key is embedded in this site. A failed notification does not discard the saved request. Turnstile limits automated abuse; it does not verify ownership of a typed Facebook account, so trial activation stays manual.

With JavaScript enabled, the Facebook field accepts a numeric ID, username, or personal profile URL and sends `facebook_user_id` plus a normalized `facebook_profile_url`. Numeric IDs remain strings. Usernames are preserved as usernames; the site does not look up numeric IDs. The `/me` shortcut itself is rejected because it does not identify an account. Website trial requests require JavaScript for verification; visitors can also request a trial directly in the app.

Trial activation is manual. After adding the requested account to the license, email the customer to confirm access. While the app is open, it checks for trial activation and continues the setup guide through the first publication; **Check activation** also refreshes the status on demand. The customer chooses and explicitly publishes one vehicle, then opens its Facebook listing when a link is available. Sending a trial request never starts publication. The 7-day publishing trial starts at activation; importing and previewing inventory remains free.

The setup guide opens for new instances, saves progress, and can be reopened from **Welcome > Open setup guide**. The website checklist follows the same path: inventory source, import, listing preview, Facebook sign-in, trial request, activation, first publication.

GitHub Pages publishes the repository root from `master` without a build step. Publish onboarding copy that names new app controls only after the corresponding stable Windows installer is available.

### Setup video

Step 2 of `/try/` includes the 9:54 English setup tutorial, covering instances, settings, login, and logs. Its responsive YouTube player uses the privacy-enhanced `youtube-nocookie.com` host, loads lazily, supports fullscreen, and requests English captions. The setup checklist and a direct YouTube link remain available alongside the video.

The video ID is `RazuBwVoWag`. When replacing the tutorial, update both the iframe and the direct link in `try/index.html`, upload the English captions to YouTube, and update the duration if needed. Keep `referrerpolicy="strict-origin-when-cross-origin"` on the iframe so YouTube receives the website origin needed to identify the embedded player.

### Local preview

Serve the repository root with any static HTTP server, then open `/try/`. No build step is required. Test form submissions with a local mock endpoint and verification fixture to avoid creating production requests or emailing the administrator.

#### Website template
https://bootstrapmade.com/ilanding-bootstrap-landing-page-template/
