-- Dedicated website-content D1 only. Never apply to licensing or metrics.
PRAGMA foreign_keys = ON;
CREATE TABLE blog_articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT 'Postiqo Team',
  seo_title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  image_width INTEGER,
  image_height INTEGER,
  body_html TEXT NOT NULL DEFAULT '',
  editorial_date TEXT,
  first_published_at TEXT,
  published_at TEXT,
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  revision INTEGER NOT NULL DEFAULT 0,
  published_revision INTEGER,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE blog_slugs (
  slug TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES blog_articles(id),
  public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1))
);
CREATE INDEX blog_slugs_article ON blog_slugs(article_id);
CREATE TRIGGER blog_slug_ownership BEFORE UPDATE OF article_id ON blog_slugs
WHEN OLD.article_id <> NEW.article_id
BEGIN SELECT RAISE(ABORT, 'slug_in_use'); END;
CREATE INDEX blog_articles_published ON blog_articles(published_at);
CREATE TABLE blog_events (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES blog_articles(id),
  revision INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(article_id, revision)
);
