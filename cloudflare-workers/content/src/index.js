import { WorkerEntrypoint } from 'cloudflare:workers';
import { ContentError, listArticles, articleDetails, saveArticle, setPublication, publishedArticles, publishedArticle, publicLastModified, validateDraft } from './content.js';
import { renderArticle,renderListing,renderSitemap,renderError,ORIGIN } from './render.js';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
const response=(body,status=200,type='text/html; charset=utf-8')=>new Response(body,{status,headers:{...headers,'Content-Type':type,...(status!==200?{'X-Robots-Tag':'noindex'}:{})}});
// No administrative HTTP route exists on the public Worker. Only the existing
// Access-protected admin Worker receives this named private service binding.
export class WebsiteContentAdmin extends WorkerEntrypoint {
  async call(operation,input,actor) {
    const allowed=(this.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if (typeof actor!=='string'||!allowed.includes(actor.toLowerCase())) return {ok:false,status:403,error:'access_denied'};
    try {
      if (operation==='list') return await listArticles(this.env,input);
      if (operation==='get') return await articleDetails(this.env,input.id);
      if (operation==='save') return await saveArticle(this.env,input,actor);
      if (operation==='publish') return await setPublication(this.env,input,actor);
      if (operation==='preview') {
        const a=validateDraft(input), stamp=new Date().toISOString();
        return {ok:true,html:renderArticle({...a,date_published:input.first_published_at||stamp,date_modified:stamp},true)};
      }
      return {ok:false,status:404,error:'not_found'};
    } catch(error) {
      return error instanceof ContentError?{ok:false,status:error.status,error:error.code,...(error.field?{field:error.field}:{})}:{ok:false,status:503,error:'content_unavailable'};
    }
  }
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (!['GET','HEAD'].includes(request.method)) return response(renderError(404),405);
    let result;
    try {
      if (['/blog','/blog/index.html'].includes(url.pathname)) result=new Response(null,{status:301,headers:{...headers,Location:ORIGIN+'/blog/'}});
      else if (url.pathname==='/blog/') result=response(renderListing(await publishedArticles(env)));
      else if (url.pathname==='/sitemap.xml') result=response(renderSitemap(await publishedArticles(env),await publicLastModified(env)),200,'application/xml; charset=utf-8');
      else {
        const match=/^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/.exec(url.pathname);
        const a=match?await publishedArticle(env,match[1]):null;
        result=!a?response(renderError(404),404):a.slug!==match[1]?new Response(null,{status:301,headers:{...headers,Location:ORIGIN+'/blog/'+a.slug+'.html'}}):response(renderArticle(a));
      }
    } catch { result=response(renderError(503),503); }
    return request.method==='HEAD'?new Response(null,result):result;
  }
};
