// Shared by the frontend-host adapter and its local acceptance tests.
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const route=new RegExp('^/share/('+UUID+')/(?:image/([0-9a-f]{64})\\.(jpeg|png|webp))?$');
const publicIdPattern=new RegExp('^'+UUID+'$');
const sites=['https://galeri.wowfurniture.com.tr','https://markrobot.wowfurniture.com.tr'];
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,fields)=>plain(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countries={ar:'ar_TR',en:'en_US',tr:'tr_TR',fr:'fr_FR',ru:'ru_RU'};
const cta={ar:'فتح مارك ربوت',en:'Open Mark Robot',tr:'Mark Robot’u aç',fr:'Ouvrir Mark Robot',ru:'Открыть Mark Robot'};
const style=':root{color-scheme:light dark;font-family:system-ui,sans-serif;--page:#f5f8fa;--card:#fff;--text:#153847;--muted:#526b7b;--border:#d7e2e8;--accent:#3f7c94;--on-accent:#fff;background:var(--page);color:var(--text)}@media(prefers-color-scheme:dark){:root{--page:#111923;--card:#1a2533;--text:#e7edf5;--muted:#b7c5d6;--border:#324255;--accent:#a5cddd;--on-accent:#153847}}*{box-sizing:border-box}body{margin:0;padding:clamp(1rem,5vw,4rem);min-height:100svh;display:grid;place-items:center}main{width:min(100%,56rem);background:var(--card);border:1px solid var(--border);border-radius:24px;overflow:hidden;box-shadow:0 12px 48px #15384718}img{display:block;width:100%;max-height:55svh;object-fit:contain;background:#fff}section{padding:clamp(1.3rem,4vw,2.8rem)}small{color:var(--accent);letter-spacing:.08em}h1{font-size:clamp(1.5rem,4vw,2.4rem);line-height:1.35;margin:.7rem 0;overflow-wrap:anywhere}p{line-height:1.8;color:var(--muted);overflow-wrap:anywhere}a{display:inline-block;margin-top:1rem;padding:.8rem 1.3rem;border-radius:12px;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:700}a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}';
let styleHash;
const hashStyle=()=>styleHash??=(async()=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(style))))))();
const baseHeaders={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY'};
const bad=(status,head)=>new Response(head?null:status===404?'Not found':'Unavailable',{status,headers:{...baseHeaders,
 'Content-Type':'text/plain; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...(status===405?{Allow:'GET, HEAD'}:{})}});
function validate(value,publicId,siteOrigin){
 if(!exact(value,['publicId','title','description','language','image','siteOrigin'])||!publicIdPattern.test(publicId)||value.publicId!==publicId||value.siteOrigin!==siteOrigin||!sites.includes(siteOrigin)||
  !Object.hasOwn(countries,value.language)||typeof value.title!=='string'||!value.title||[...value.title].length>140||
  typeof value.description!=='string'||[...value.description].length>300||/[\u0000-\u001f\u007f]/.test(value.title+value.description)||
  !exact(value.image,['digest','type','size'])||!/^[0-9a-f]{64}$/.test(value.image.digest)||!['jpeg','png','webp'].includes(value.image.type)||
  !Number.isSafeInteger(value.image.size)||value.image.size<12||value.image.size>4194304)throw Error('INVALID_PUBLIC_PROJECTION');
 return value;
}
async function bounded(response,limit){
 if(!response.ok||!response.body||Number(response.headers.get('content-length')||0)>limit)throw Error('UPSTREAM');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel().catch(()=>{});throw Error('UPSTREAM');}parts.push(value);}}
 finally{reader.releaseLock();}
 const out=new Uint8Array(size);let n=0;for(const part of parts){out.set(part,n);n+=part.length;}return out;
}
export async function renderPublicShare(value,siteOrigin,{head=false}={}){
 validate(value,value.publicId,siteOrigin);
 const url=siteOrigin+'/share/'+value.publicId+'/',image=url+'image/'+value.image.digest+'.'+value.image.type;
 const html='<!doctype html><html lang="'+value.language+'" dir="'+(value.language==='ar'?'rtl':'ltr')+'" prefix="og: https://ogp.me/ns#"><head>'+
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(value.title)+'</title>'+
  '<meta name="description" content="'+esc(value.description)+'"><meta property="og:type" content="website">'+
  '<meta property="og:title" content="'+esc(value.title)+'"><meta property="og:description" content="'+esc(value.description)+'">'+
  '<meta property="og:site_name" content="WOW FURNITURE · مارك ربوت"><meta property="og:locale" content="'+countries[value.language]+'">'+
  '<meta property="og:url" content="'+esc(url)+'"><link rel="canonical" href="'+esc(url)+'">'+
  '<meta property="og:image" content="'+esc(image)+'"><meta property="og:image:secure_url" content="'+esc(image)+'">'+
  '<meta property="og:image:type" content="image/'+value.image.type+'"><meta property="og:image:alt" content="'+esc(value.title)+'">'+
  '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(value.title)+'">'+
  '<meta name="twitter:description" content="'+esc(value.description)+'"><meta name="twitter:image" content="'+esc(image)+'">'+
  '<style>'+style+'</style></head><body><main><img src="'+esc(image)+'" alt="'+esc(value.title)+'"><section>'+ 
  '<small>WOW FURNITURE · مارك ربوت</small><h1>'+esc(value.title)+'</h1><p>'+esc(value.description)+'</p>'+
  '<a href="'+esc(siteOrigin+'/?wf-cloud=employee#gallery')+'">'+cta[value.language]+'</a></section></main></body></html>';
 return new Response(head?null:html,{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8',
  'Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'sha256-"+await hashStyle()+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}

export function createPublicShareFrontend({apiOrigin,siteOrigin,fetch:fetcher=globalThis.fetch,timeoutMs=9000}={}){
 let ready=false,apiBase='',site='';
 try{const a=new URL(apiOrigin),s=new URL(siteOrigin);ready=/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(a.origin)&&a.href===a.origin+'/'&&
  sites.includes(s.origin)&&s.href===s.origin+'/';apiBase=a.origin;site=s.origin;}catch{}
 return async request=>{
  const url=new URL(request.url),head=request.method==='HEAD',match=route.exec(url.pathname);
  if(!['GET','HEAD'].includes(request.method))return bad(405,head);
  if(!ready)return bad(503,head);
  if(url.origin!==site||!match||url.search||url.hash)return bad(404,head);
  const [,publicId,digest,type]=match;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(12000,timeoutMs)));
  try{
   const target=apiBase+'/functions/v1/wow-cloud/public-share/'+publicId+'/'+(digest?'image/'+digest+'.'+type:'metadata');
   const response=await fetcher(target,{method:head&&digest?'HEAD':'GET',signal:controller.signal,redirect:'error',cache:'no-store',headers:{Accept:digest?'image/'+type:'application/json'}});
   if(response.status===404)return bad(404,head);
   if(!digest){
    if(!response.headers.get('content-type')?.startsWith('application/json'))throw Error('UPSTREAM');
    const value=validate(JSON.parse(new TextDecoder().decode(await bounded(response,8192))),publicId,site);
    return await renderPublicShare(value,site,{head});
   }
   if(response.headers.get('content-type')?.split(';')[0]!=='image/'+type)throw Error('UPSTREAM');
   if(head){
    const size=Number(response.headers.get('content-length'));
    if(!response.ok||!Number.isSafeInteger(size)||size<12||size>4194304)throw Error('UPSTREAM');
    return new Response(null,{headers:{...baseHeaders,'Content-Type':'image/'+type,'Content-Length':String(size),
     'Content-Disposition':'inline; filename="preview.'+type+'"','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox"}});
   }
   // Only the intentional public image endpoint is reachable. Never follow a
   // signed URL, accept provider redirects, or forward visitor cookies/tokens.
   const bytes=await bounded(response,4194304);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(bytes.length<12||hash!==digest)throw Error('UPSTREAM');
   return new Response(head?null:bytes,{headers:{...baseHeaders,'Content-Type':'image/'+type,'Content-Length':String(bytes.length),
    'Content-Disposition':'inline; filename="preview.'+type+'"','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox"}});
  }catch{return bad(503,head);}finally{clearTimeout(timer);}
 };
}
