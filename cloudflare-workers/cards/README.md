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
- Website colours and the existing Nunito font. No navigation or brand header.
  The footer links to `https://postiqo.io/products/postiqo-cards/` as
  `Powered by Postiqo Cards`.

The existing inventory contract has no currency, mileage-unit or engine
displacement columns. Cards use CAD and kilometres, matching the Canadian
catalogue. The engine field uses the supplied cylinder count; further engine
information stays in the full description. No missing specifications are
inferred. Marketing suffixes separated by ` * ` or ` | ` are omitted only from
the heading; the original model and listing title remain visible below.

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
