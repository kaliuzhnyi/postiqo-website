import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalD1} from './database.mjs';
import {saveArticle,setPublication,articleDetails,listArticles,publishedArticles,publishedArticle,validateBody,validateDraft,publicLastModified} from '../src/content.js';
import {renderArticle,renderListing,renderSitemap} from '../src/render.js';
const seed=JSON.parse(readFileSync(new URL('../seed/articles.json',import.meta.url),'utf8'));
const env=()=>({CONTENT_DB:new LocalD1()});
const actor='local@example.test';
const draft=(extra={})=>({...seed[0],id:undefined,slug:'local-test-article',...extra});
test('dedicated database import preserves six bodies, images, URLs and both date meanings',async()=>{
 const e=env(),articles=await publishedArticles(e);assert.equal(articles.length,6);
 for(const original of seed){const a=await publishedArticle(e,original.slug);for(const field of ['slug','title','summary','author','description','image_url','image_alt','body_html','editorial_date','date_published','date_modified'])assert.equal(a[field],original[field],field);const html=renderArticle(a);assert.ok(html.includes(a.body_html));assert.ok(html.includes('https://postiqo.io/blog/'+a.slug+'.html'));assert.ok(html.includes('"datePublished":"2026-10-04"'));}
 const listing=renderListing(articles);assert.equal((listing.match(/class="blog-card"/g)||[]).length,6);assert.equal(articles[0].slug,'vehicle-price-sheets-digital-qr-cards');
 assert.equal((renderSitemap(articles).match(/<loc>/g)||[]).length,15);
 const before=JSON.stringify(articles);e.CONTENT_DB.sqlite.exec(readFileSync(new URL('../migrations/0002_import_articles.sql',import.meta.url),'utf8'));assert.equal(JSON.stringify(await publishedArticles(e)),before);
 assert.deepEqual(e.CONTENT_DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name).sort(),['blog_articles','blog_events','blog_slugs']);
});
test('creating and saving drafts never changes live HTML, links or sitemap until publish',async()=>{
 const e=env(),start=renderSitemap(await publishedArticles(e));const saved=await saveArticle(e,draft(),actor,'2026-10-05T12:00:00.000Z');assert.equal(saved.article.published,false);assert.equal(await publishedArticle(e,'local-test-article'),null);assert.equal(renderSitemap(await publishedArticles(e)),start);
 const p=await setPublication(e,{id:saved.article.id,revision:0,published:true},actor,'2026-10-05T12:01:00.000Z');assert.equal(p.article.published,true);assert.equal((await publishedArticle(e,p.article.slug)).date_published,'2026-10-05T12:01:00.000Z');
 const edit=await saveArticle(e,{...p.article,title:'Edited privately',revision:p.article.revision},actor,'2026-10-05T12:02:00.000Z');assert.equal(edit.article.has_unpublished_changes,true);assert.notEqual((await publishedArticle(e,p.article.slug)).title,'Edited privately');
 const pub=await setPublication(e,{id:p.article.id,revision:edit.article.revision,published:true},actor,'2026-10-05T12:03:00.000Z');const a=await publishedArticle(e,p.article.slug);assert.equal(a.title,'Edited privately');assert.equal(a.date_published,'2026-10-05T12:01:00.000Z');assert.equal(a.date_modified,'2026-10-05T12:03:00.000Z');
 await setPublication(e,{id:a.id||pub.article.id,revision:pub.article.revision,published:false},actor,'2026-10-05T12:04:00.000Z');assert.equal(await publishedArticle(e,p.article.slug),null);assert.doesNotMatch(renderSitemap(await publishedArticles(e)),/local-test-article/);assert.equal(await publicLastModified(e),'2026-10-05T12:04:00.000Z');
});
test('slug changes preserve old public URLs and keep a saved unpublished URL private',async()=>{
 const e=env(),old=seed[0];const edited=await saveArticle(e,{...old,slug:'new-canonical-url',revision:0},actor);assert.equal(edited.article.public_slug,old.slug);assert.equal(await publishedArticle(e,'new-canonical-url'),null);assert.equal((await publishedArticle(e,old.slug)).slug,old.slug);
 await setPublication(e,{id:old.id,revision:1,published:true},actor);assert.equal((await publishedArticle(e,old.slug)).slug,'new-canonical-url');assert.equal((await publishedArticle(e,'new-canonical-url')).slug,'new-canonical-url');
 await assert.rejects(()=>saveArticle(e,draft({slug:old.slug}),actor),{code:'slug_in_use'});
});
test('optimistic revisions reject stale saves/publishes, with no audit or partial writes',async()=>{
 const e=env(),old=seed[0];await saveArticle(e,{...old,title:'First edit',revision:0},actor);const before=e.CONTENT_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM blog_events').get().n;
 await assert.rejects(()=>saveArticle(e,{...old,title:'Lost edit',revision:0},actor),{code:'article_changed'});
 await assert.rejects(()=>setPublication(e,{id:old.id,revision:0,published:true},actor),{code:'article_changed'});
 assert.equal((await articleDetails(e,old.id)).article.title,'First edit');assert.equal(e.CONTENT_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM blog_events').get().n,before);
 const list=await listArticles(e,{q:"' OR 1=1 --"});assert.equal(list.total,0);
});
test('safe HTML, metadata and image URLs reject executable content, invalid dates and oversized fields',()=>{
 for(const html of ['<script>alert(1)</script>','<img src="https://example.test/a.png" alt="test" onerror="evil()">','<a href="javascript:alert(1)">bad</a>','<a href="java&#x73;cript:alert(1)">bad</a>','<p></div>','<iframe src="https://example.test"></iframe>','<svg></svg>','<a href="//evil.test">bad</a>','<a href="java&Tab;script:alert(1)">bad</a>'])assert.throws(()=>validateBody(html),{code:'invalid_body'},html);
 assert.equal(validateBody('<p>Safe <strong>text</strong>.</p><img src="/public/og-home.png" alt="Image">'),'<p>Safe <strong>text</strong>.</p><img src="/public/og-home.png" alt="Image">');
 for(const values of [{image_url:'javascript:evil()'},{editorial_date:'2026-02-30'},{slug:'../secret'},{title:'x'.repeat(161)},{body_html:'x'.repeat(150001)}])assert.throws(()=>validateDraft(draft(values)));
 const markup=renderArticle({...seed[0],title:'</script><script>evil()</script>',seo_title:'<img src=x onerror=evil()>',date_published:'2026-10-04',date_modified:'2026-10-04'});assert.doesNotMatch(markup,/<script>evil/);assert.match(markup,/\\u003c\/script>/);
});
test('incomplete drafts save but cannot publish; the one-time import never overwrites admin edits',async()=>{
 const e=env(),s=await saveArticle(e,{slug:'incomplete',title:'Incomplete'},actor);await assert.rejects(()=>setPublication(e,{id:s.article.id,revision:0,published:true},actor),{code:'publication_incomplete'});
 await saveArticle(e,{...seed[0],revision:0,title:'Admin edited title'},actor);
 e.CONTENT_DB.sqlite.exec(readFileSync(new URL('../migrations/0002_import_articles.sql',import.meta.url),'utf8'));
 assert.equal((await articleDetails(e,seed[0].id)).article.title,'Admin edited title');
});
