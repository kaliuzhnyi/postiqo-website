# Website content / Blog & News

Dedicated website-content D1 storage. This Worker and its migrations must never
target `postiqo-licenses`, `postiqo-metrics` or any Autotronics database.

Public routes render full HTML at `/blog/`, `/blog/<slug>.html` and `/sitemap.xml`
using the marketing site's existing header, footer, styles and metadata. Only
published snapshots appear. Draft saves leave published content intact. Former
published slugs redirect after a new slug is published; unpublished articles and
draft URLs return 404. Dynamic responses are not cached. A storage error returns
503 rather than falling back to a possibly stale static article.

The Access-protected admin connects through the named private service binding
`WebsiteContentAdmin`. The public Worker has no administrative HTTP endpoint.
Both services require the same exact administrator allowlist. The admin checks
verified Cloudflare Access identity and same-origin mutation headers before RPC.
No direct browser access to D1, licensing changes or metrics changes are involved.

## Local verification

Install the pinned dependencies, then run:

```
npm run import:static
npm run build
npm test
```

The import reads the six approved static articles, preserves content, slugs,
images, editorial dates and actual publication dates, and generates the checked-in
`seed/articles.json` manifest plus `0002_import_articles.sql`. Repeating the SQL
does not overwrite articles edited in the admin. Do not regenerate the seed as a
routine content update; the admin becomes the content source after cutover.

`tests/content.test.mjs` checks import, publication lifecycle, optimistic revisions,
slug reservations, HTML safety and indexing. `tests/runtime.test.mjs` runs the real
Workers runtime with local D1 and named service RPC. No tests use remote storage.

## Production setup and rollback

The initial cutover completed on October 5, 2026 (America/Toronto). The dedicated
database ID is `289fc5ac-57f9-410b-a8ce-06cd0b56eefa`; both migrations have been
applied and all six published snapshots match the import manifest. The configured
blog and sitemap routes are active. The apex now uses
the `postiqo-website` Worker Custom Domain. The remaining website is served by
Workers Static Assets; see [hosting and analytics](../site/README.md). The more
specific blog and sitemap routes continue to invoke this content Worker first.

The following steps describe initial provisioning. Do not create another database
or re-import the static seed for routine article changes; use the admin editor.

1. Create `postiqo-website-content` in the existing Postiqo Cloudflare account.
   Record its new ID in the `CONTENT_DB` binding; verify the name and ID before
   every remote migration. Apply only this directory's two migrations.
2. Build and deploy `postiqo-website-content`. Attach routes
   `postiqo.io/blog*` and `postiqo.io/sitemap.xml` in the postiqo.io zone. The
   hostname must be proxied through Cloudflare. These routes require zone read
   and Worker routes write permissions in addition to script and D1 permissions.
3. Build the admin and deploy its private `WEBSITE_CONTENT` service binding.
   Preserve its existing Access integration, licensing and metrics bindings.
4. Verify six public articles, metadata, canonical links, sitemap, redirects,
   mobile navigation and Access denial. Test edits only through an approved
   unpublished test draft; do not publish illustrative content.

The static source files remain as a rollback snapshot. Removing content routes
restores that snapshot, including articles previously unpublished in D1. Therefore
do not remove routes after editorial changes without explicitly reviewing the
snapshot. Prefer rolling back Worker code while retaining D1 and routes. Export
the dedicated D1 database before future schema changes.

Published HTML accepts a documented subset: p, h2, h3, ul, ol, li, strong, em,
blockquote, a, img, figure, figcaption and br. Safe links and alt text are required.
Actual publication timestamps are recorded by the service; an optional editorial
date controls the visible label and listing order.
