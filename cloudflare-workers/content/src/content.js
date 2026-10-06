export class ContentError extends Error {
  constructor(status, code, field) { super(code); this.status = status; this.code = code; this.field = field; }
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const limits = {slug:100,title:160,summary:600,category:80,author:120,seo_title:74,description:180,image_url:2048,image_alt:300,body_html:150000};
const fields = [...Object.keys(limits), 'editorial_date', 'image_width', 'image_height'];
const fail = (code, field, status=400) => { throw new ContentError(status, code, field); };
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function decode(value) {
  return value.replace(/&#(?:x([\da-f]+)|(\d+));?/gi, (_,x,n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(x || n, x ? 16 : 10))))
    .replace(/&(amp|quot|apos|lt|gt|colon|Tab|NewLine);/g, (_,n) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',colon:':',Tab:'\t',NewLine:'\n'}[n]));
}
export function safeUrl(value, image=false) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\\]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return !url.username && !url.password && (image ? url.protocol === 'https:' : ['https:','http:','mailto:','tel:'].includes(url.protocol)); }
  catch { return false; }
}
// A small, explicit HTML vocabulary. Reject unsafe markup rather than silently
// stripping content. Balancing prevents submitted HTML from escaping the article.
export function validateBody(source) {
  const allowed = new Set(['p','h2','h3','ul','ol','li','strong','em','blockquote','a','img','figure','figcaption','br']);
  const stack = [], tokens = source.match(/<[^>]*>|[^<]+/g) || [];
  if (tokens.join('') !== source) fail('invalid_body','body_html');
  for (const token of tokens) {
    if (!token.startsWith('<')) continue;
    const match = /^<\s*(\/?)\s*([a-z][a-z0-9]*)\b([^<>]*?)\s*(\/?)>$/i.exec(token);
    if (!match || !allowed.has(match[2].toLowerCase())) fail('invalid_body','body_html');
    const [,closing,rawTag,rawAttrs,self] = match, tag = rawTag.toLowerCase();
    if (closing) {
      if (rawAttrs.trim() || self || stack.pop() !== tag) fail('invalid_body','body_html');
      continue;
    }
    const attrs = {}, attrTokens = rawAttrs.match(/\s+[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*')/gi) || [];
    if (attrTokens.join('').trim() !== rawAttrs.trim()) fail('invalid_body','body_html');
    for (const entry of attrTokens) {
      const attr = /^\s*([a-z][a-z0-9_-]*)\s*=\s*["']([\s\S]*)["']$/i.exec(entry);
      const key = attr[1].toLowerCase(), value = decode(attr[2]);
      if (Object.hasOwn(attrs,key)) fail('invalid_body','body_html');
      attrs[key] = value;
      if (tag === 'a' && key === 'href' && safeUrl(value)) continue;
      if (tag === 'img' && key === 'src' && safeUrl(value,true)) continue;
      if (tag === 'img' && key === 'alt') continue;
      if (tag === 'img' && ['width','height'].includes(key) && /^[1-9]\d{0,4}$/.test(value)) continue;
      fail('invalid_body','body_html');
    }
    if (tag === 'a' && !attrs.href) fail('invalid_body','body_html');
    if (tag === 'img' && (!attrs.src || !Object.hasOwn(attrs,'alt'))) fail('invalid_body','body_html');
    if (!['img','br'].includes(tag)) {
      if (self) fail('invalid_body','body_html');
      stack.push(tag);
    }
  }
  if (stack.length) fail('invalid_body','body_html');
  return source;
}
export function validateDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_article');
  const result = {};
  for (const [field,limit] of Object.entries(limits)) {
    const value = input[field] ?? (field === 'author' ? 'Postiqo Team' : '');
    if (typeof value !== 'string' || value.length > limit || (field !== 'body_html' && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))) fail('invalid_article',field);
    result[field] = field === 'body_html' ? value : value.trim();
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug) || ['index','admin','preview'].includes(result.slug)) fail('invalid_article','slug');
  if (!result.title) fail('invalid_article','title');
  if (result.image_url && !safeUrl(result.image_url,true)) fail('invalid_article','image_url');
  result.editorial_date = input.editorial_date || null;
  if (result.editorial_date && !validDate(result.editorial_date)) fail('invalid_article','editorial_date');
  for (const field of ['image_width','image_height']) {
    result[field] = input[field] === '' || input[field] == null ? null : Number(input[field]);
    if (result[field] != null && (!Number.isInteger(result[field]) || result[field]<1 || result[field]>20000)) fail('invalid_article',field);
  }
  validateBody(result.body_html);
  return result;
}
function publicationReady(row) {
  const article = validateDraft(row);
  for (const field of ['summary','category','author','seo_title','description','image_url','image_alt','body_html']) if (!article[field]) fail('publication_incomplete',field);
  if (article.seo_title.length < 15 || article.description.length < 80) fail('publication_incomplete','description');
  return article;
}
function database(env) {
  if (!env.CONTENT_DB) fail('content_unavailable',undefined,503);
  return env.CONTENT_DB;
}
function revision(value) { if (!Number.isSafeInteger(value) || value<0) fail('invalid_revision'); return value; }
function projection(row) {
  return {...row,published_json:undefined,public_slug:row.published_json?JSON.parse(row.published_json).slug:null,published:!!row.published_json,has_unpublished_changes:!!row.published_json && row.revision!==row.published_revision};
}
export async function listArticles(env, params={}) {
  const db = database(env), page = Math.max(1,Math.min(100000,parseInt(params.page,10)||1)), q = String(params.q||'').slice(0,200), status = params.status || 'all';
  if (!['all','published','draft'].includes(status)) fail('invalid_article','status');
  const where = `WHERE (title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')` + (status==='published'?' AND published_json IS NOT NULL':status==='draft'?' AND published_json IS NULL':'');
  const term = '%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%', values=[term,term];
  const total = (await db.prepare('SELECT COUNT(*) AS n FROM blog_articles '+where).bind(...values).first()).n;
  const rows = await db.prepare('SELECT * FROM blog_articles '+where+' ORDER BY updated_at DESC,id LIMIT 30 OFFSET ?').bind(...values,(page-1)*30).all();
  return {ok:true,items:rows.results.map(row=>projection({...row,body_html:undefined})),total,page,page_size:30};
}
export async function articleDetails(env,id) {
  const row=await database(env).prepare('SELECT * FROM blog_articles WHERE id=?').bind(String(id)).first();
  if (!row) fail('article_not_found',undefined,404);
  return {ok:true,article:projection(row)};
}
function event(db,id,articleId,next,action,actor,stamp,mutation) {
  return db.prepare('INSERT INTO blog_events(id,article_id,revision,action,actor,created_at) SELECT ?,id,revision,?,?,? FROM blog_articles WHERE id=? AND mutation_id=?').bind(id,action,actor,stamp,articleId,mutation);
}
async function executeWrite(db,statements) {
  try { return await db.batch(statements); }
  catch (error) {
    if (/slug_in_use|UNIQUE constraint failed: blog_(?:articles\.slug|slugs\.slug)/i.test(error.message)) fail('slug_in_use','slug',409);
    throw error;
  }
}
export async function saveArticle(env,input,actor,stamp=new Date().toISOString()) {
  const db=database(env), article=validateDraft(input), id=input.id ? String(input.id) : crypto.randomUUID(), mutation=crypto.randomUUID();
  const values=fields.map(key=>article[key]);
  let statements;
  if (!input.id) {
    statements=[db.prepare(`INSERT INTO blog_articles(id,${fields.join(',')},mutation_id,created_at,updated_at) VALUES (${Array(fields.length+4).fill('?').join(',')})`).bind(id,...values,mutation,stamp,stamp),
      db.prepare('INSERT INTO blog_slugs(slug,article_id) VALUES (?,?)').bind(article.slug,id)];
  } else {
    await articleDetails(env,id);
    statements=[db.prepare(`UPDATE blog_articles SET ${fields.map(key=>key+'=?').join(',')},revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=?`).bind(...values,mutation,stamp,id,revision(input.revision)),
      db.prepare('INSERT INTO blog_slugs(slug,article_id) SELECT ?,id FROM blog_articles WHERE id=? AND mutation_id=? ON CONFLICT(slug) DO UPDATE SET article_id=excluded.article_id').bind(article.slug,id,mutation)];
    // The UPSERT deliberately cannot steal another article's reserved old URL.
    const owner=await db.prepare('SELECT article_id FROM blog_slugs WHERE slug=?').bind(article.slug).first();
    if (owner && owner.article_id!==id) fail('slug_in_use','slug',409);
  }
  statements.push(event(db,mutation,id,0,input.id?'saved':'created',actor,stamp,mutation));
  const results=await executeWrite(db,statements);
  if (results[0].meta.changes!==1) fail('article_changed',undefined,409);
  return articleDetails(env,id);
}
export async function setPublication(env,input,actor,stamp=new Date().toISOString()) {
  if (!input || typeof input.published!=='boolean') fail('invalid_article','published');
  const db=database(env), row=await db.prepare('SELECT * FROM blog_articles WHERE id=?').bind(String(input.id)).first();
  if (!row) fail('article_not_found',undefined,404);
  if (row.revision!==revision(input.revision)) fail('article_changed',undefined,409);
  const mutation=crypto.randomUUID(), first=row.first_published_at || stamp, snapshot=input.published?{...publicationReady(row),date_published:first,date_modified:stamp}:null;
  const results=await db.batch([
    db.prepare('UPDATE blog_articles SET published_json=?,first_published_at=?,published_at=?,published_revision=revision+1,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=?')
      .bind(snapshot?JSON.stringify(snapshot):null,input.published?first:row.first_published_at,input.published?stamp:null,mutation,stamp,row.id,row.revision),
    db.prepare('UPDATE blog_slugs SET public=1 WHERE slug=? AND article_id=? AND EXISTS(SELECT 1 FROM blog_articles WHERE id=? AND mutation_id=? AND published_json IS NOT NULL)').bind(row.slug,row.id,row.id,mutation),
    event(db,mutation,row.id,0,input.published?'published':'unpublished',actor,stamp,mutation)
  ]);
  if (results[0].meta.changes!==1) fail('article_changed',undefined,409);
  return articleDetails(env,row.id);
}
export async function publishedArticles(env) {
  const rows=await database(env).prepare('SELECT published_json FROM blog_articles WHERE published_json IS NOT NULL').all();
  return rows.results.map(row=>JSON.parse(row.published_json)).sort((a,b)=>(b.editorial_date||b.date_published).localeCompare(a.editorial_date||a.date_published)||a.slug.localeCompare(b.slug));
}
export async function publishedArticle(env,slug) {
  const row=await database(env).prepare('SELECT a.published_json FROM blog_slugs s JOIN blog_articles a ON a.id=s.article_id WHERE s.slug=? AND s.public=1 AND a.published_json IS NOT NULL').bind(slug).first();
  return row?JSON.parse(row.published_json):null;
}
export async function publicLastModified(env) {
  return (await database(env).prepare("SELECT MAX(created_at) AS stamp FROM blog_events WHERE action IN ('published','unpublished','imported')").first()).stamp;
}
