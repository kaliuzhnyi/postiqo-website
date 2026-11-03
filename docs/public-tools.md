# Public tools

The public, English-language tools are available without an account:

- `/tools/`: catalog linked from the shared header and footer.
- `/tools/car-payment-calculator/`: CAD loan and lease estimates, interactive
  balance graph, cost breakdown, payment/year schedule and CSV download.
- `/tools/vin-decoder/`: a vehicle specification lookup using the existing
  Cards VIN normalizer and NHTSA vPIC data source.

The calculator uses the pure, cent-based ledger in
`assets/js/vehicle-finance.mjs`. Loan regular payments are regression-checked
against the existing Cards formula. It sends no inputs to a server and stores
no financial values in URLs or local storage. `#lease` opens the lease tab.
Tax presets come from the Cards renderer and remain editable. They are general
dealer-transaction estimates, not a complete vehicle tax quote.

Every calculator input, select, frequency group and graph slider has a detailed
explanation through `tool-help.js`; the two VIN inputs use the same component.
Help supports mouse hover, click/touch, keyboard focus, Escape and outside-click
dismissal. Loan and lease forms preserve independent values while switching tabs.
On small screens, a floating estimate appears while editing above the result.

## Financial model

All displayed monetary values and schedule rows use integer cents. Total cash,
the doughnut, table totals and CSV use the same ledger. The final payment clears
the loan or reaches the lease residual exactly; it may differ from a regular
payment. Prices/fees accept two decimal places, tax rates three, and money
factors six. The maximum agreement term is 120 months.

Loan principal is price minus eligible personal trade-in, plus trade-in loan
payoff, minus cash down, plus any financed taxes and fees. Tax applies to price
minus trade-in plus taxable fees, without reducing the base by cash down or
adding the trade-in payoff. Taxes/fees may instead be paid upfront. Periodic
rate is nominal annual rate divided by 12, 26 or 52. Fractional final periods
use `(1 + periodicRate)^fraction - 1`. Extra payments reduce principal and the
term; interest savings compare two rounded ledgers with otherwise equal inputs.

Leases use monthly payments, a residual in dollars from the quote, and a paid-off
personal trade-in. Negative-equity lease tax treatment is not modeled. Adjusted
lease amount is price plus financed pre-tax fees minus cash down and trade-in.
Residual cannot exceed that amount. There are two explicit rate methods:

- Annual interest: discounted monthly cash flows with a residual balloon.
  End-of-month payment is `PMT(capital, annualRate / 1200, months, residual)`;
  beginning-of-month payment divides it by `1 + annualRate / 1200`.
  Each beginning-of-month row deducts the payment then accrues that month's
  interest. Its balance is the value at the end of the month.
- Money factor: monthly depreciation `(capital - residual) / months`, plus
  rent `(capital + residual) * quotedFactor`. Timing affects cash at signing,
  not the money-factor payment. A factor is never silently converted into an APR.

Lease tax applies to periodic payments and cash down. Upfront fees are entered
with tax already included. The first payment is part of cash due at signing
when payments are in advance, but is counted only once in total cash. Optional
buyout including estimated tax is separate. Refundable deposits, excess mileage,
wear, disposition/purchase-option fees and special tax rules are excluded. The
unpaid-value schedule is not a market-value or early-termination quote.

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
mobile navigation and layouts from 320 to 1280 pixels. Finance tests independently
discount payments and residuals to the original capital, reconcile every row and
cost component, cover zero rates/extra payments/negative equity, and check CSV,
tab state, all field explanations and mobile popover bounds. Screenshots are
written to ignored `cloudflare-workers/site/tests/artifacts/tools/` and
`cloudflare-workers/site/tests/artifacts/finance/` directories.

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
- [CRA motor vehicle tax treatment](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-specific-situations/motor-vehicles.html)
- [Federal Reserve money-factor calculation](https://www.federalreserve.gov/pubs/leasing/resource/consider/ongoing_info6.htm)
- [Federal Reserve lease rate comparison](https://www.federalreserve.gov/Pubs/leasing/resource/faq.htm)
- [Ontario cost of borrowing regulation](https://www.ontario.ca/laws/regulation/050017)
- [Calculator.net loan reference](https://www.calculator.net/auto-loan-calculator.html)
- [Calculator.net lease reference](https://www.calculator.net/auto-lease-calculator.html)
- [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
