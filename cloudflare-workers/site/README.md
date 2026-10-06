# Website hosting and analytics

`postiqo-website` serves the marketing website with Cloudflare Workers Static
Assets on the Custom Domain `postiqo.io`. `postiqo-website-redirect` permanently
redirects `www.postiqo.io` to HTTPS on the apex, retaining the path and query.
The repository on GitHub is the source of website files. GitHub Pages is no
longer the production origin.

The existing `postiqo-website-content` routes for `/blog*` and `/sitemap.xml`
take priority over the Custom Domain. Article publication remains in the admin
and D1. The site build deliberately omits static blog snapshots and sitemap so
an accidentally removed content route cannot expose stale published articles.

## Build and deploy

Use Node 24 and pnpm 11.19 or later from this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run deploy
pnpm run deploy:redirect
```

The build copies only the public allowlist to `dist/`. Worker sources, Git files,
credentials, documentation, drafts and legacy PHP are excluded. It does not
change page contents or publish uncommitted work from a different checkout.
Assets are served directly without invoking a Worker script. Directory addresses
and index aliases have permanent canonical redirects; missing pages return 404.

Cloudflare Builds settings for `kaliuzhnyi/postiqo-website`:

- Production branch: `master`
- Root directory: `cloudflare-workers/site`
- Build command: `pnpm test`
- Deploy command: `pnpm run deploy`
- Preview branches: disabled

The www redirect uses a separate Builds connection to the same repository and
directory, with deploy command `pnpm run deploy:redirect`. Workers Builds validates
one Worker name per build, so never deploy both Workers in the same build command.
The deploy commands update only the static website and www redirect. They do not
apply D1 migrations or deploy the admin, licenses, metrics or Cards services.
The `website-static.yml` GitHub workflow also checks SEO and the calculator.

## Visitor statistics

[Cloudflare Web Analytics](https://dash.cloudflare.com/066b40c1b42afc714c1cbae2f6e4440f/web-analytics/overview?siteTag~in=303da6197a3a44e691b8dd7bce45754e&excludeBots=Yes)
is configured for `postiqo.io` with automatic snippet injection. This includes
marketing pages and the server-rendered blog. There is no manually embedded
beacon in repository HTML and no analytics secret in public assets.

Use Visits and Page views to inspect traffic over a selected time range, with
breakdowns by page, referrer, country, device and browser. Core Web Vitals reports
real visitor performance when sufficient data is available. The default report
excludes bots. Script blockers and JavaScript-disabled browsers can prevent RUM
events, so these counts will differ from HTTP request totals.

Use the domain's HTTP Traffic analytics to inspect all requests, bandwidth,
cache usage and response status, including bots. Use the Worker Deployments page
for build and release history. Analytics starts at activation; earlier GitHub
Pages visitor history is not imported.

## Recovery

Prefer rolling back the `postiqo-website` deployment to a known version. Keep
the content Worker routes and D1 intact so later article edits remain live.
For an emergency return to GitHub Pages, re-enable root publication from master,
remove the apex Custom Domain, and restore a proxied CNAME `postiqo.io` pointing
to `kaliuzhnyi.github.io`. The original www record was a DNS-only CNAME to
`postiqo.io`; Cloudflare now owns it through the redirect Worker's Custom Domain.
DNS settings for email and other Postiqo services are independent.
