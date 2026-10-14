# Demo requests

The homepage and `/demo/` share the form in `scripts/templates/demo-form.html`.
Run `node scripts/generate-demo-forms.mjs` after editing it. CI checks that both
rendered forms match. `assets/js/request-form.js` owns product selection,
validation, Turnstile and submission for both forms.

Supported links:

- `/demo/?product=publisher`
- `/demo/?product=cards`
- `/demo/?product=website`
- `/demo/?product=pages`
- `/demo/?product=website&request=quote`
- `/demo/?product=pages&request=quote`

Existing homepage `?product=...&request=...#contact` links continue to work.
Direct or unknown-product visits default to Publisher. Visitors can change the
product. Quote intent applies only to Website and Pages and shows an optional
project-details field; changing to Publisher or Cards switches to a demo.

## Existing API contract

The form sends `name`, `dealership`, `email`, optional `website` and `phone`, plus
an automatic message such as `Postiqo Digital Cards - Demo Request`. Quote
messages use `Quote Request` and append optional project details. There is no
new database field. The current admin interface and notification emails already
display `message`.

The client retains `request_id` across retries of unchanged details, including
network errors and ambiguous responses. Changing the product changes the message
and therefore creates a new request ID. Success requires both an HTTP success
status and `{ok:true}` from the existing demo endpoint, which responds after D1
storage. Failures retain the entered details. A duplicate receipt is successful.

Demo submission uses the existing `demo_request` Turnstile action and never
calls the trial endpoint. The `/try/` instructions, download and activation flow
remain unchanged; only shared navigation and demo links were updated there.

## Verification and HTTP 403

The licensing implementation was inspected in the adjacent `postiqo-publisher`
repository, including its `demo_requests` migration, notification code and admin
demo handlers. No files in that repository were changed.

The public handler returns 403 when Origin is missing or not in
`TRIAL_WEBSITE_ORIGINS`, or when a POST lacks `CF-Connecting-IP`. It verifies the
Turnstile token, exact hostname and `demo_request` action, and applies the
existing IP rate limit. Cloudflare edge protection can reject a request before
that handler. No protection was disabled or changed.

Read-only production checks on 2026-10-13 returned 200 for `/v1/public/trial-config`
and 204 for the demo endpoint's OPTIONS preflight, with matching CORS headers for
both `https://postiqo.io` and `https://www.postiqo.io`. This did not reproduce 403.
Browser tests mock the widget and API. Existing licensing tests exercise real
workerd and local D1 with a mocked external Turnstile verifier, including valid
submissions, rejected tokens, origin restrictions, rate limits and deduplication.
Admin tests check visibility, statuses and explicit trial/license conversion.
These checks do not prove live Turnstile completion or production email delivery.
No production POST or notification test was performed.

## Local checks

```sh
node scripts/generate-demo-forms.mjs --check
python scripts/check-seo.py
node scripts/generate-cards-demo.mjs --check
node --test tests/*.test.cjs
cd cloudflare-workers/site
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm run test:browser
cd ../content
pnpm test
```

The browser suite intercepts every network request, covering product CTAs,
homepage and demo submissions, validation, optional websites, quote context,
missing verification, failures, retries, duplicate receipts and mobile layout.
Set `DEMO_SCREENSHOTS` to a local directory to save desktop and mobile previews.

## Release 1.0.4

This release contains the shared demo experience and browser regression tests.
It requires no licensing, admin, email or D1 changes. The site's deployment
allowlist includes `/demo/`; the content Worker build picks up blog navigation
and sitemap changes from the existing static shell.

Production is not deployed as part of this release. Pushing `master` triggers
Cloudflare Builds, so the release is published from a separate branch and tag.
After an authorized merge and site rollout, deploy the content Worker using its
existing deployment command to update the live blog navigation and sitemap.
Do not run static article imports or migrations for this release.
