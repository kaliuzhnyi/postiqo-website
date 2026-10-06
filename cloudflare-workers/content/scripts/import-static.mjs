import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateDraft} from '../src/content.js';
const root=new URL('../../../',import.meta.url), folder=new URL('../',import.meta.url);
const decode=s=>s.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&(amp|quot|apos|lt|gt);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[n]));
const articles=[];
for(const file of (await readdir(new URL('blog/',root))).filter(f=>f.endsWith('.html')&&f!=='index.html').sort()) {
  const source=await readFile(new URL('blog/'+file,root),'utf8');
  const graph=JSON.parse(source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const schema=graph.find(n=>n['@type']==='BlogPosting');
  const meta=name=>decode(source.match(new RegExp('<meta (?:name|property)="'+name+'" content="([^"]*)"'))?.[1]||'');
  const body=source.match(/<div class="marketing-container blog-reading blog-prose">\s*([\s\S]*?)\s*<aside class="blog-next">/)[1].trim();
  const slug=file.slice(0,-5), id=createHash('sha256').update('postiqo-blog:'+slug).digest('hex').slice(0,32);
  const a=validateDraft({slug,title:schema.headline,summary:decode(source.match(/<p class="marketing-intro mt-4">([\s\S]*?)<\/p>/)[1]),category:decode(source.match(/<span class="marketing-eyebrow">([^<]+)<\/span>/)[1]),author:schema.author.name,seo_title:decode(source.match(/<title>([^<]+)<\/title>/)[1]),description:meta('description'),image_url:meta('og:image'),image_alt:meta('og:image:alt'),image_width:Number(meta('og:image:width'))||null,image_height:Number(meta('og:image:height'))||null,body_html:body,editorial_date:source.match(/Editorial date: <time datetime="([^"]+)"/)?.[1]||null});
  articles.push({...a,id,date_published:schema.datePublished,date_modified:schema.dateModified,source_file:'blog/'+file,source_sha256:createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex')});
}
if(articles.length!==6) throw new Error('Expected the six existing approved articles; inspect the import before changing its scope.');
const quote=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
let sql='-- One-time import of the six approved static articles. Dedicated website-content DB only.\n-- Re-running cannot overwrite subsequent admin edits.\n';
for(const a of articles) {
 const {id,source_file,source_sha256,date_published,date_modified,...draft}=a;
 const snapshot={...draft,date_published,date_modified}, mutation='import-'+id, cols=['id',...Object.keys(draft),'first_published_at','published_at','published_json','revision','published_revision','mutation_id','created_at','updated_at'];
 const values=[id,...Object.values(draft),date_published,date_modified,JSON.stringify(snapshot),0,0,mutation,date_published,date_modified];
 sql+=`INSERT INTO blog_articles(${cols.join(',')}) VALUES (${values.map(quote).join(',')}) ON CONFLICT(id) DO NOTHING;\n`;
 sql+=`INSERT INTO blog_slugs(slug,article_id,public) VALUES (${quote(a.slug)},${quote(id)},1) ON CONFLICT(slug) DO NOTHING;\n`;
 sql+=`INSERT INTO blog_events(id,article_id,revision,action,actor,created_at) VALUES (${quote(mutation)},${quote(id)},0,'imported','static-site-import',${quote(date_modified)}) ON CONFLICT(id) DO NOTHING;\n`;
}
await mkdir(new URL('seed/',folder),{recursive:true});
await writeFile(new URL('seed/articles.json',folder),JSON.stringify(articles,null,2)+'\n');
await writeFile(new URL('migrations/0002_import_articles.sql',folder),sql);
console.log('Prepared idempotent import of six articles, preserving body HTML, URLs, images and both date meanings.');
