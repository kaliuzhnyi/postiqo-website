import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler'))('miniflare');
const {unstable_splitSqlQuery:split}=require('wrangler');
test('real workerd isolates public reads from private named RPC and persists publication',async()=>{
 const mf=new Miniflare({telemetry:{enabled:false},workers:[{config:{name:'gateway',type:'worker',compatibilityDate:'2026-09-10',manifest:{mainModule:'index.js',modulesRoot:'/',modules:{'index.js':{type:'esm',contents:`export default {async fetch(r,e){const {operation,input,actor}=await r.json();return Response.json(await e.CONTENT.call(operation,input,actor));}}`}}},env:{CONTENT:{type:'worker',worker:'content',exportName:'WebsiteContentAdmin'}}}},{config:{name:'content',type:'worker',compatibilityDate:'2026-09-10',manifest:{mainModule:'index.js',modulesRoot:'/',modules:{'index.js':{type:'esm',contents:readFileSync(new URL('../dist/index.js',import.meta.url),'utf8')}}},env:{CONTENT_DB:{type:'d1',id:'local-website-content'},ADMIN_EMAILS:{type:'text',value:'local@example.test'}}}}]});
 try{
 const db=await mf.getD1Database('CONTENT_DB','content');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort())await db.batch(split(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8')).map(sql=>db.prepare(sql)));
 const publicWorker=await mf.getWorker('content');
 const get=path=>publicWorker.fetch('https://postiqo.io'+path,{redirect:'manual'});
 const call=async(operation,input={},actor='local@example.test')=>(await mf.dispatchFetch('http://local.test',{method:'POST',body:JSON.stringify({operation,input,actor})})).json();
 assert.equal((await call('list',{},'attacker@example.test')).status,403);
 assert.equal((await get('/api/blog')).status,404);
 assert.equal((await publicWorker.fetch('https://postiqo.io/blog/',{method:'POST'})).status,405);
 assert.equal((await call('list')).total,6);
 const original=JSON.parse(readFileSync(new URL('../seed/articles.json',import.meta.url)))[0];
 const save=await call('save',{...original,id:undefined,slug:'runtime-private'});assert.equal(save.ok,true,JSON.stringify(save));
 assert.equal((await get('/blog/runtime-private.html')).status,404);
 const preview=await call('preview',{...original,slug:'runtime-private'});assert.match(preview.html,/noindex/);
 const publish=await call('publish',{id:save.article.id,revision:save.article.revision,published:true});assert.equal(publish.ok,true,JSON.stringify(publish));
 const page=await get('/blog/runtime-private.html');assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');assert.match(await page.text(),/runtime-private/);
 const edited=await call('save',{...publish.article,slug:'runtime-renamed'});assert.equal(edited.ok,true);
 assert.equal((await get('/blog/runtime-renamed.html')).status,404);assert.equal((await get('/blog/runtime-private.html')).status,200);
 const renamed=await call('publish',{id:edited.article.id,revision:edited.article.revision,published:true});assert.equal(renamed.ok,true);
 const redirect=await get('/blog/runtime-private.html');assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),'https://postiqo.io/blog/runtime-renamed.html');
 const unpublished=await call('publish',{id:renamed.article.id,revision:renamed.article.revision,published:false});assert.equal(unpublished.ok,true);
 assert.equal((await get('/blog/runtime-renamed.html')).status,404);assert.doesNotMatch(await (await get('/sitemap.xml')).text(),/runtime-renamed/);
 }finally{await mf.dispose();}
});
