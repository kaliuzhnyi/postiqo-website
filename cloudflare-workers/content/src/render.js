import { escapeHtml as e } from './content.js';
import shell from '../generated/shell.js';
export const ORIGIN='https://postiqo.io';
const json = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const absolute = value => new URL(value,ORIGIN).href;
const dateLabel = value => { const date=new Date(value); return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}).format(date); };
export function articleDate(a) {
  const editorial=!!a.editorial_date, value=a.editorial_date||a.date_published;
  return `${editorial?'Editorial date: ':''}<time datetime="${e(value)}">${e(dateLabel(value))}</time>`;
}
function breadcrumbs(route,title) {
  return {'@type':'BreadcrumbList','@id':ORIGIN+route+'#breadcrumb',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:ORIGIN+'/'},{'@type':'ListItem',position:2,name:'Blog & News',item:ORIGIN+'/blog/'},...(route==='/blog/'?[]:[{'@type':'ListItem',position:3,name:title,item:ORIGIN+route}])]};
}
function page({route,title,description,image,imageAlt,imageWidth,imageHeight,article=false,schemas=[],body,noindex=false}) {
  const url=ORIGIN+route, img=absolute(image||'/public/og-home.png?v=3');
  return '<!DOCTYPE html>\n<html lang="en-CA">\n<head>\n'+shell.head+`
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="${noindex?'noindex, follow':'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}">
<link rel="canonical" href="${e(url)}">
<meta property="og:type" content="${article?'article':'website'}">
<meta property="og:site_name" content="Postiqo"><meta property="og:locale" content="en_CA">
<meta property="og:url" content="${e(url)}"><meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}"><meta property="og:image" content="${e(img)}">
<meta property="og:image:alt" content="${e(imageAlt||'Postiqo - practical tools for vehicle listings and connected websites')}">
${imageWidth&&imageHeight?`<meta property="og:image:width" content="${e(imageWidth)}"><meta property="og:image:height" content="${e(imageHeight)}">`:''}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="${e(img)}">
<meta name="twitter:image:alt" content="${e(imageAlt||'Postiqo - practical tools for vehicle listings and connected websites')}">
<script type="application/ld+json">${json({'@context':'https://schema.org','@graph':schemas})}</script>
</head><body class="marketing-page blog-page"><a class="site-skip" href="#main">Skip to content</a>
${shell.header}${body}${shell.footer}</body></html>`;
}
export function renderArticle(a,preview=false) {
  const route='/blog/'+a.slug+'.html', url=ORIGIN+route;
  const schemas=[{'@type':'WebPage','@id':url+'#webpage',url,name:a.seo_title,inLanguage:'en-CA',isPartOf:{'@id':ORIGIN+'/#website'},breadcrumb:{'@id':url+'#breadcrumb'}},
    {'@type':'BlogPosting','@id':url+'#article',url,headline:a.title,description:a.description,inLanguage:'en-CA',datePublished:a.date_published,dateModified:a.date_modified,
      author:{'@type':'Organization',name:a.author,url:ORIGIN+'/'},publisher:{'@id':ORIGIN+'/#organization'},image:absolute(a.image_url||'/public/og-home.png?v=3'),isPartOf:{'@id':ORIGIN+'/blog/#blog'},mainEntityOfPage:{'@id':url+'#webpage'}},breadcrumbs(route,a.title)];
  const body=`<main id="main"><article class="blog-article"><header class="catalog-hero blog-hero"><div class="marketing-container blog-reading">
<nav aria-label="Breadcrumb"><ol class="product-breadcrumbs"><li><a href="/">Home</a></li><li><a href="/blog/">Blog &amp; News</a></li><li aria-current="page">${e(a.title)}</li></ol></nav>
<span class="marketing-eyebrow">${e(a.category)}</span><h1>${e(a.title)}</h1><p class="marketing-intro mt-4">${e(a.summary)}</p>
<p class="blog-meta">By ${e(a.author)} &middot; ${articleDate(a)}</p></div></header>
<div class="marketing-container blog-reading blog-prose">${a.body_html}
<aside class="blog-next"><h2>Explore the tools</h2><p>See how Postiqo products fit your workflow.</p><a class="text-link" href="/products/">Explore Postiqo products</a></aside>
<a class="text-link" href="/blog/">Back to Blog &amp; News</a></div></article></main>`;
  const html=page({route,title:a.seo_title||a.title,description:a.description,image:a.image_url,imageAlt:a.image_alt,imageWidth:a.image_width,imageHeight:a.image_height,article:true,schemas,body,noindex:preview});
  return preview?html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g,'').replace(/<script src="[^"]+"[^>]*><\/script>/g,'').replace('</head>','<style>'+shell.previewCss+'</style></head>').replace(/src="\/(?!\/)/g,'src="'+ORIGIN+'/'):html;
}
export function renderListing(articles) {
  const title='Blog & News | Dealership Guides & Updates | Postiqo',description='Practical dealership guides, Postiqo product updates and implementation stories. Explore ideas for vehicle listings, digital cards and connected websites.';
  const schemas=[{'@type':'CollectionPage','@id':ORIGIN+'/blog/#webpage',url:ORIGIN+'/blog/',name:title,description,inLanguage:'en-CA',isPartOf:{'@id':ORIGIN+'/#website'},breadcrumb:{'@id':ORIGIN+'/blog/#breadcrumb'},mainEntity:{'@id':ORIGIN+'/blog/#blog'}},
    {'@type':'Blog','@id':ORIGIN+'/blog/#blog',url:ORIGIN+'/blog/',name:'Postiqo Blog & News',inLanguage:'en-CA',publisher:{'@id':ORIGIN+'/#organization'},blogPost:articles.map(a=>({'@id':ORIGIN+'/blog/'+a.slug+'.html#article'}))},breadcrumbs('/blog/','Blog & News')];
  const cards=articles.map(a=>`<article class="blog-card"><span class="marketing-eyebrow">${e(a.category)}</span><h3><a href="/blog/${e(a.slug)}.html">${e(a.title)}</a></h3><p>${e(a.summary)}</p><p class="blog-meta">${articleDate(a)} &middot; ${e(a.author)}</p><a class="text-link" href="/blog/${e(a.slug)}.html">Read article <i class="bi bi-arrow-right" aria-hidden="true"></i><span class="visually-hidden">: ${e(a.title)}</span></a></article>`).join('\n');
  return page({route:'/blog/',title,description,imageWidth:1200,imageHeight:630,schemas,body:`<main id="main">${shell.hero}<section class="marketing-section blog-listing" aria-labelledby="latest-heading"><div class="marketing-container"><div class="marketing-heading-row"><h2 class="marketing-heading" id="latest-heading">From the Postiqo team</h2><span class="marketing-note">Guides &middot; Product news &middot; Implementation stories</span></div><div class="blog-grid" id="articles">${cards}</div>${articles.length?'':'<div class="blog-empty"><h3>Our first articles are on the way.</h3><p>Explore the tools while we prepare our next articles.</p><a class="text-link" href="/products/">Explore Postiqo products</a></div>'}</div></section></main>`});
}
export function renderSitemap(articles,modified=null) {
  const dates=articles.map(a=>a.date_modified.slice(0,10)), latest=dates.sort().at(-1)||null;
  const urls=[...shell.sitemap,{loc:ORIGIN+'/blog/',lastmod:modified?.slice(0,10)||latest},...articles.map(a=>({loc:ORIGIN+'/blog/'+a.slug+'.html',lastmod:a.date_modified.slice(0,10)}))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>`  <url><loc>${e(u.loc)}</loc>${u.lastmod?'<lastmod>'+e(u.lastmod)+'</lastmod>':''}</url>`).join('\n')+'\n</urlset>\n';
}
export function renderError(status) {
  return page({route:'/blog/',title:status===404?'Article not found | Postiqo':'Blog temporarily unavailable | Postiqo',description:'Explore Postiqo products or return to Blog & News for the latest published articles.',noindex:true,body:`<main id="main"><section class="catalog-hero"><div class="marketing-container"><h1>${status===404?'Article not found':'Blog temporarily unavailable'}</h1><p class="marketing-intro">${status===404?'This article is not currently available.':'Please try again shortly.'}</p><a class="text-link" href="/blog/">Back to Blog &amp; News</a></div></section></main>`});
}
