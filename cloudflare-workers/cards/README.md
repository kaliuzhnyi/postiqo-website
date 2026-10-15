# Public vehicle cards

`https://cards.postiqo.io/{dealership_id}/{VIN}` is the same URL that Publisher
already puts in printable QR codes. The Worker reads the current vehicle from
the existing `postiqo-licenses` D1 database. It does not require a desktop release
or an inventory copy. Cards access uses the dealer flag added by Publisher's
licensing migration `0011_dealer_cards.sql`.

## Page

- Responsive photo gallery with swipe, keyboard navigation, thumbnails and a
  fullscreen viewer. Empty or broken photos have a text fallback.
- Current price, mileage, make, model, year, trim, transmission, drivetrain,
  engine cylinder count, fuel type, colours, condition, body style, stock and VIN.
- Complete source description, optional video link and dealership contacts.
- Editable payment calculator using the current vehicle price, with monthly,
  bi-weekly and weekly payments, amount financed and total interest.
- Website colours and the existing Nunito font. No navigation or brand header.
  The footer links to `https://postiqo.io/products/postiqo-cards/` as
  `Powered by Postiqo Cards`.

The existing inventory contract has no currency, mileage-unit or engine
displacement columns. Cards use CAD and kilometres, matching the Canadian
catalogue. The engine field uses the supplied cylinder count; further engine
information stays in the full description. No missing specifications are
inferred. Marketing suffixes separated by ` * ` or ` | ` are omitted only from
the heading; the original model and listing title remain visible below.

## Payment calculator

The calculator starts with a 10% down payment, a 7.99% annual interest rate,
60 months, monthly payments and Ontario's 13% HST preset. Financing inputs are
editable illustration defaults,
not a quoted dealer rate or a claimed industry average. Visitors can enter a
down payment in CAD, change the annual rate, choose a common term from 12-96
months or select **Custom term** to enter any whole number of months from 1-120.
Monthly, bi-weekly and weekly payments are supported. Reset restores the
defaults using the current price, including the Ontario tax preset.

Amount financed is the asking price plus sales tax minus the down payment.
Cash down payments do not reduce the taxable price. Tax is rounded to cents,
then included in the loan balance. The estimate uses
equal amortizing payments, a nominal annual rate divided by 12, 26 or 52, and
the matching number of payments over the selected term. Bi-weekly means every
two weeks, with 26 regular payments per year; it is not accelerated repayment.
Zero interest divides principal evenly. A down payment covering both the price
and tax produces zero payments. For terms that end between weekly or bi-weekly
payment dates, the remaining balance is repaid at the end of the term, with a
shorter final interest period. The UI shows an integer payment count and the
estimated smaller final payment. Payment calculations retain full precision
until display; lender rounding and actual payment dates can differ.

**Estimated payment includes financed sales tax.** The controls beneath it
offer all 13 provinces and territories and a manually editable tax percentage.
Changing that percentage selects **Custom rate**. The breakdown shows the tax
on the full asking price separately from the amount financed and loan interest.
Fees, federal luxury tax, exemptions, trade-ins and vehicle-specific valuation
rules are outside this simple estimate and are not calculated automatically.

Presets were checked against the
[CRA rate table](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html)
on October 14, 2026: Alberta and the territories 5%; Saskatchewan 11%; Manitoba
and the B.C. base preset 12%; Ontario 13%; Nova Scotia 14%; Quebec 14.975%;
New Brunswick, Newfoundland and Labrador, and Prince Edward Island 15%.
B.C. is explicitly labelled **base** and displays an adjustment note because
[vehicle-specific PST rates](https://www.bclaws.gov.bc.ca/civix/document/id/consol41/consol41/12035_03)
can exceed the standard rate. Do not describe these presets as a complete tax
assessment for every vehicle; the dealer confirms applicable taxes.

The calculator uses the same loan inputs described by the
[RBC car loan calculator](https://www.rbcroyalbank.com/car-loans/car-loan-payment-calculator.html),
which explains that offered rates depend on the vehicle, credit history and
loan structure. The 7.99% starting value is a product assumption, not an RBC
offer or a live rate feed.

All inputs remain in the browser. Live price refresh recalculates the estimate,
retains visitor edits, and updates the 10% down payment only while it is still
untouched. A price-with-tax total below an edited down payment asks for a valid amount.
The calculator is hidden for missing/zero prices, inactive or missing vehicles,
and without JavaScript. The static demo uses the same calculator without
requesting live inventory.

## Data and refresh

Both `GET /{dealer_id}/{VIN}` and `GET /api/{dealer_id}/{VIN}` make a fresh,
parameterized D1 SELECT, using the existing unique `(dealer_id, vehicle_key)`
index and Publisher's `vin:{VIN}` key. IDs start at 100 and may exceed 999.
Lowercase VINs and a trailing slash redirect to the canonical path.

In Postiqo Admin, open **Dealers**, edit the dealership, check **Allow Postiqo
Cards** and save. `dealers.cards_enabled` defaults to `0` for both existing and
new dealers. Only `1` permits a public card. Disabled dealers receive HTTP 403
with an explanatory page and a **Contact Postiqo support** mailto button to
`support@postiqo.io`; the email includes the card link. The API returns only
`{"error":"cards_disabled"}`. Vehicle details and photos are not returned.
This flag is set manually and does not count Publisher subscriptions.

HTML includes all content before JavaScript runs. HTML and JSON send
`Cache-Control: no-store` and `Cloudflare-CDN-Cache-Control: no-store`. The open
page refreshes price and availability every 60 seconds while visible, on return
to the tab, and when restored from the browser back/forward cache. Other fields
refresh when the page is opened again. A failed refresh displays a notice;
an initial database failure returns 503 with a retry button. If access is
disabled while a card is open, its next refresh removes the vehicle content,
closes the photo viewer and reloads the disabled message. Changes take effect
on new requests immediately and within 60 seconds on a visible open card.

A database price change appears on the next page request or within the next
60-second check on an open page. A change in an external dealer system must
first reach D1 through Publisher's existing inventory synchronization.

Inactive vehicles show `No longer listed` and hide the asking price. Missing
records return 404. Unknown availability asks the visitor to check with the
dealer. The page does not infer availability from missing rows in a later
inventory upload, or label an inactive vehicle as sold.

Only explicitly selected vehicle fields and public dealer contact fields are
returned. There is no public inventory search/list, write route, dealer key,
account identity or license information. Stored text is escaped, external URLs
are limited to HTTP/HTTPS without credentials, images use HTTPS and no referrer,
and the Worker never fetches remote photo URLs. Visitors load photos directly
from the dealer's image host. A strict Content Security Policy permits only the
bundled script/styles/font and HTTPS images. Cards are marked noindex.

## Local development

Use Node.js 24 and pnpm. The lockfile pins the same Wrangler/Miniflare toolchain
used by the Publisher services.

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm dev
```

Open `http://127.0.0.1:8788/100/WBA8E1C5XJA756297`. The preview uses a separate
in-memory D1 database containing example data. Its terminal accepts
`{"price":11995}`, `{"active":0}` or `{"cards_enabled":false}` to exercise live updates. These controls
exist only in the local preview process, with no HTTP write endpoint.
An optional `CARD_PREVIEW_FIXTURE` JSON file can supply public vehicle fields
for local visual checks. Keep real preview records in ignored `artifacts/`.

Tests use the built Worker in workerd with D1. They cover dealer isolation,
immediate price changes, missing/inactive records, unknown availability, empty
photos, unsafe input, canonical URLs, caching, assets and database failures.
They also cover disabled/default access, the support link, dealer isolation,
immediate re-enabling and removal of an open card after access is disabled.
Payment arithmetic tests cover all three frequencies, zero interest, full
down payments, precision and invalid inputs. Browser checks live in the existing
site test suite: from `../site`, run
`node --test tests/browser/cards-calculator.test.mjs`. They cover the shared
demo, live price changes, input validation, keyboard controls, no-JavaScript
behavior and layouts from 320px to desktop. Browser requests are intercepted.

## Deployment

First apply `0011_dealer_cards.sql` from the Publisher licensing project to
`postiqo-licenses`, then deploy the updated administration Worker and this
Cards Worker. Enable Cards for the intended dealers in Postiqo Admin. Applying
the migration starts every dealership with Cards disabled. The Cards Worker
requires the new column and fails closed with 503 if it is missing.

```powershell
pnpm run build
pnpm exec wrangler deploy --dry-run
pnpm run deploy
```

The existing Cloudflare account is `066b40c1b42afc714c1cbae2f6e4440f`.
Worker: `postiqo-cards`. Bind `DB` to `postiqo-licenses`, database ID
`6ea78d8b-1c3f-4042-b44a-be433dbf5eff`. The configured Custom Domain is
`cards.postiqo.io`; Workers.dev and preview URLs are disabled.

The build emits a self-contained ES module at `dist/index.js` with versioned
CSS, JavaScript and the site's Nunito font. This module can also be pasted into
the Cloudflare Worker editor. After dashboard deployment, configure the D1
binding and Custom Domain with the same values as `wrangler.jsonc`, set the
compatibility date to `2026-09-08`, disable Worker logs, Workers.dev and preview
URLs, then verify a real QR link. No secrets or API tokens are required by this
Worker. Apply the shared migration from the Publisher project only.

Cloudflare creates the DNS record and certificate when a Worker Custom Domain
is added. See the [Custom Domains documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
The production binding remains the shared inventory database; the Worker code
uses SELECT only. Keep the explicit field projection when adding new fields.
