# Public tools

The public, English-language tools are available without an account:

- `/tools/`: catalog linked from the shared header and footer.
- `/tools/car-payment-calculator/`: CAD auto loan estimate, using the existing
  `calculateVehiclePayment` function in `assets/js/cards-template.js`.
- `/tools/vin-decoder/`: a vehicle specification lookup using the existing
  Cards VIN normalizer and NHTSA vPIC data source.

The calculator passes the price after a personal, lien-free trade-in to the
shared calculation. It supports zero interest, fully covered purchases,
monthly/bi-weekly/weekly payments and custom whole-month terms. It sends no
inputs to a server. Tax presets come from the Cards renderer; confirm
vehicle-specific tax rules rather than presenting presets as a tax quote.

Run `node scripts/generate-tools-pages.mjs` after changing the page content,
shared Products shell or Cards tax presets. `--check` verifies generated files.
The generator reads the preset declaration without importing the Cards build.
Run `python scripts/generate-tools-social-images.py` with Pillow to recreate
the three 1200 x 630 sharing cards. Static HTML contains all descriptive copy,
FAQs, canonical URLs, social metadata, breadcrumbs and WebApplication/ItemList
structured data. The VIN results themselves are not indexable pages.

## VIN endpoint contract

`POST /api/tools/vin`, same website origin, `Content-Type: application/json`.
Body: `{"vin":"1HGCM82633A004352","year":2003}`. `year` is optional or null;
otherwise it must be an integer from 1981 through the current UTC year plus two.
VINs are trimmed, uppercased and validated as 17 characters without I, O or Q.
The request body is limited to 1 KiB. Only one VIN is sent to NHTSA per call.

Successful HTTP 200 responses contain `vin`, `status`, `data`, `errorCode` and
`source: "NHTSA vPIC"`. `complete` and `partial` include normalized specifications.
`review` and `no_data` have an empty `data` object and must not be rendered as a
confirmed decode. NHTSA warnings and year conflicts reuse Cards' conservative
normalization. Missing fields are omitted; raw provider payloads are not exposed.

Errors are JSON with `error`, and a user-facing `message` where applicable:

| HTTP | Meaning |
| --- | --- |
| 400 | Invalid JSON, VIN or model year |
| 403 | Missing or different Origin, or cross-site request |
| 405 | Method other than POST; `Allow: POST` |
| 413 | Request exceeds 1 KiB |
| 415 | Content type is not JSON |
| 429 | Visitor rate limit; `Retry-After: 60` |
| 503 | Provider busy, malformed response, timeout or limiter failure; retry after 60 seconds |

All browser responses use `Cache-Control: no-store`, `X-Robots-Tag: noindex` and
`X-Content-Type-Options: nosniff`. The client never adds VINs to the URL or local
storage. An edited input or reset aborts an outstanding lookup and suppresses
stale results. Provider text is inserted using `textContent`.

The Worker uses the Cloudflare Cache API internally, keyed by normalized VIN
and optional model year: seven days for usable data, one hour for review/no-data.
Cache failures do not expose upstream bodies. A failed upstream call starts a
60-second cooldown at that edge, while already cached results remain available.
The upstream request times out at eight seconds and its body is limited to 64 KiB.

Cloudflare rate-limit bindings permit approximately 20 requests per visitor IP
per minute and 60 uncached provider requests per minute per Cloudflare location.
These are local, eventually consistent controls, not strict global quotas.
No D1, inventory, licensing or admin binding is added to the site Worker.

## Verification and publication

Run from the repository root:

```sh
node scripts/generate-tools-pages.mjs --check
python scripts/check-seo.py
node --test tests/*.test.cjs
node scripts/generate-demo-forms.mjs --check
node scripts/generate-cards-demo.mjs --check
```

Run `pnpm test` and `pnpm run test:browser` in `cloudflare-workers/site`, and
`pnpm test` in `cloudflare-workers/content`. Browser tests intercept all network
traffic, exercise input/errors/reset, stale VIN responses, safe text rendering,
mobile navigation and layouts from 320 to 1280 pixels. Screenshots are written to
the ignored `cloudflare-workers/site/tests/artifacts/tools/` directory.

The local Postman simulation checks the actual HTTP serialization and timeout:

```sh
postman simulation run postman/simulations/public-tools.sim.yaml --port 4019 --no-history --output ndjson
# In another terminal, set VPIC_SIMULATION_URL=http://127.0.0.1:4019/nhtsa
node scripts/test-tools-http.mjs
```

This fixture is based on the NHTSA contract and a live response for the documented
example VIN. The provider mock search was unavailable because the Postman CLI
was signed out. The fixture and simulation stay local and require no credentials.

Deploy the site and content Workers with their existing `pnpm run deploy`
commands. The content deployment updates the live sitemap and blog navigation;
do not import static articles or run D1 migrations. The static build allowlist
now includes `tools`. `assets.run_worker_first` routes only `/api/*` to the script;
ordinary marketing assets continue to use Static Assets directly.

After deployment, verify all three public URLs, the sitemap, a successful VIN
POST, invalid VIN rejection and existing product/demo routes. Indexing and
search ranking remain up to the search engines.

## References

- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/)
- [CRA sales tax reference](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html)
- [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
