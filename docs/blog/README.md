# Blog & News

The public listing is `/blog/` (`blog/index.html`). Articles are plain HTML at `/blog/<descriptive-slug>.html`. Shared navigation, fonts, colours and footer follow the marketing pages; article-specific styles live in `assets/css/blog.css`. No CMS or build is required.

## Prepare an article

1. Copy `docs/blog/article-template.html` to another file in `docs/blog/` while drafting. This directory is excluded from the GitHub Pages output by `_config.yml`; the template also has `noindex, follow`. Never put unfinished articles in `blog/`.
2. Replace every `{{PLACEHOLDER}}`. Use a clear unique title, an 80–180 character description, a stable lowercase hyphenated slug, an actual author and actual publication dates. Keep one H1, sequential heading levels, useful product links and descriptive image alt text. The template reuses the homepage social image; an approved article-specific 1200 × 630 image can replace it in both social metadata entries.
3. Verify all factual claims against the product or approved source. Obtain approval for customer names, logos, quotes, screenshots, implementation details and results. Do not invent testimonials, outcomes, client stories or measured savings. Identify hypothetical examples as illustrations.
4. Add WebPage, BlogPosting and BreadcrumbList JSON-LD using the example below. Replace all example values, keep headline aligned with the H1, and use the same canonical route throughout. Dates must reflect actual publication and material updates.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://postiqo.io/blog/ARTICLE-SLUG.html#webpage",
      "url": "https://postiqo.io/blog/ARTICLE-SLUG.html",
      "name": "ARTICLE TITLE",
      "isPartOf": {"@id": "https://postiqo.io/#website"},
      "breadcrumb": {"@id": "https://postiqo.io/blog/ARTICLE-SLUG.html#breadcrumb"}
    },
    {
      "@type": "BlogPosting",
      "@id": "https://postiqo.io/blog/ARTICLE-SLUG.html#article",
      "url": "https://postiqo.io/blog/ARTICLE-SLUG.html",
      "headline": "ARTICLE TITLE",
      "description": "ARTICLE DESCRIPTION",
      "inLanguage": "en-CA",
      "datePublished": "YYYY-MM-DD",
      "dateModified": "YYYY-MM-DD",
      "author": {"@type": "Organization", "name": "Postiqo", "url": "https://postiqo.io/"},
      "publisher": {"@id": "https://postiqo.io/#organization"},
      "image": "https://postiqo.io/public/og-home.png?v=3",
      "isPartOf": {"@id": "https://postiqo.io/blog/#blog"},
      "mainEntityOfPage": {"@id": "https://postiqo.io/blog/ARTICLE-SLUG.html#webpage"}
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://postiqo.io/blog/ARTICLE-SLUG.html#breadcrumb",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://postiqo.io/"},
        {"@type": "ListItem", "position": 2, "name": "Blog & News", "item": "https://postiqo.io/blog/"},
        {"@type": "ListItem", "position": 3, "name": "ARTICLE TITLE", "item": "https://postiqo.io/blog/ARTICLE-SLUG.html"}
      ]
    }
  ]
}
```

Use Person for an individually credited author; use Organization only when Postiqo is actually the credited author.

## Publish an approved article

1. Copy the finished draft to `blog/<slug>.html`, remove the template warning comment and change its robots meta to `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`.
2. Insert a completed `docs/blog/article-card.html` snippet inside `#articles` in `blog/index.html`. Put newest articles first. Remove `.blog-empty` when the first article is ready. Keep the card title, summary, date and author aligned with the article. Optionally list the published BlogPosting entities in the listing's Blog JSON-LD.
3. Add the exact article canonical URL to `sitemap.xml` with an honest `lastmod`. Update the blog listing's `lastmod` when its contents change. Never add drafts or templates.
4. Run `python scripts/check-seo.py` and `node --test tests/savings-calculator.test.cjs`. The SEO checker discovers public `blog/*.html` articles and requires complete metadata, schema, listing links and matching sitemap entries. It rejects leftover `{{PLACEHOLDER}}` tokens.
5. Serve the repository root locally. Check the listing and article at desktop and mobile sizes, the shared menu, keyboard navigation, long titles, images, internal links and article readability. Commit only intended files and release using the normal GitHub Pages flow from `master`; verify the public canonical URL and sitemap afterward.

The launch contains five approved partner stories and one product news article. Future implementation stories become public only after real evidence and customer approval are available.
