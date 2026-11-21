/* Installation metadata is derived from committed device settings only.
   Public WOW FURNITURE assets remain the fallback for first visits and remote installers.
   No database, financial record, installed app, or browser storage is removed here. */
(() => {
  'use strict';
  const CACHE='infinity-install-identity-v1';
  const MANIFEST='/manifest.json';
  const MAX_IMAGE=2100000;
  const ICON_PATHS=new Set(['/app-icon-192.png','/app-icon-512.png','/app-icon-maskable-512.png','/apple-touch-icon.png']);
  const DEFAULTS={name:'مارك ربوت',id:'/',start_url:'/',scope:'/',display:'standalone',display_override:['standalone','minimal-ui'],background_color:'#f3f7fa',theme_color:'#153847',icons:[
    {src:'/app-icon-192.png?v=198',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/app-icon-512.png?v=198',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'/app-icon-maskable-512.png?v=198',sizes:'512x512',type:'image/png',purpose:'maskable'}
  ]};
  function cleanImage(value){
    return typeof value==='string'&&value.length<=MAX_IMAGE&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)?value:'';
  }
  function legacyName(value){
    return typeof value==='string'&&/^(?:infinity|إنفنتي|انفنتي)$/i.test(value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim());
  }
  function normalize(settings){
    const value=settings?.appIdentity?.version===1?settings.appIdentity:{};
    const savedName=typeof value.name==='string'?Array.from(value.name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim()).slice(0,60).join(''):'';
    if(legacyName(savedName))return {name:DEFAULTS.name,mode:'default',source:'',custom:false};
    const name=/^(?:wow furniture|galeri)$/i.test(savedName)?DEFAULTS.name:savedName;
    const mode=['app','custom'].includes(value.installIconMode)?value.installIconMode:'default';
    const source=mode==='app'?cleanImage(value.logo):mode==='custom'?cleanImage(value.installIcon):'';
    return {name:name||DEFAULTS.name,mode,source,custom:(name||DEFAULTS.name)!==DEFAULTS.name||!!source};
  }
  function buildManifest(base,identity,icons){
    return {...DEFAULTS,...base,id:'/',start_url:'/',scope:'/',name:identity.name,short_name:identity.name,
      display:'standalone',icons:icons?.length?icons:(Array.isArray(base?.icons)&&base.icons.length?base.icons:DEFAULTS.icons)};
  }
  function platform(navigatorObject={}){
    const ua=navigatorObject.userAgent||'';
    if(/Android/i.test(ua))return 'android';
    if(/iPad|iPhone|iPod/i.test(ua)||(/Mac/i.test(navigatorObject.platform||'')&&navigatorObject.maxTouchPoints>1))return 'ios';
    return 'desktop';
  }
  function iconGeometry(width,height,size,maskable=false){
    // A maskable icon's important pixels must fit inside the central safe circle.
    const scale=maskable?size*.78/Math.hypot(width,height):size*.84/Math.max(width,height);
    return {x:(size-width*scale)/2,y:(size-height*scale)/2,width:width*scale,height:height*scale};
  }
  function createStore({caches,origin}){
    const manifestURL=new URL(MANIFEST,origin).href;
    let commits=Promise.resolve();
    return {
      publish(manifest,icons=[],isCurrent=()=>true){
        const task=commits.catch(()=>{}).then(async()=>{
          if(!isCurrent())return false;
          const cache=await caches.open(CACHE);
          // Commit the manifest last: it never points to half-written icon files.
          await Promise.all(icons.map(icon=>cache.put(new URL(icon.url,origin).href,new Response(icon.blob,{headers:{'Content-Type':'image/png','Cache-Control':'no-cache','X-WF-Install-Identity':'local'}}))));
          if(!isCurrent())return false;
          await cache.put(manifestURL,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'no-cache','X-WF-Install-Identity':'local'}}));
          // Keep the preceding icon set for an in-flight browser install/update.
          const keys=(await cache.keys()).filter(request=>ICON_PATHS.has(new URL(request.url).pathname));
          if(keys.length>8)await Promise.all(keys.slice(0,keys.length-8).map(request=>cache.delete(request)));
          return true;
        });
        commits=task;return task;
      },
      clear(isCurrent=()=>true){
        const task=commits.catch(()=>{}).then(async()=>{
          if(!isCurrent())return false;
          const cache=await caches.open(CACHE);await cache.delete(manifestURL);return true;
        });
        commits=task;return task;
      }
    };
  }
  function createResponder({caches,origin,fetch}){
    return {respond(request){
      const url=new URL(request.url);
      if(request.method!=='GET'||url.origin!==origin||url.searchParams.has('wf-static'))return null;
      const manifest=url.pathname===MANIFEST;
      const icon=ICON_PATHS.has(url.pathname)&&/^[a-f0-9]{16}$/.test(url.searchParams.get('wf-identity')||'');
      if(!manifest&&!icon)return null;
      return (async()=>{
        try{
          const cache=await caches.open(CACHE);
          const response=await cache.match(manifest?new URL(MANIFEST,origin).href:request.url);
          if(response){
            // A returning browser can request its manifest before settings load.
            // Retire only the old stock identity; other device branding survives.
            if(manifest&&legacyName((await response.clone().json()).name))await cache.delete(new URL(MANIFEST,origin).href);
            else return response;
          }
        }catch(_){}
        // Remote packaging and cleared/unsupported local caches still get a real file.
        const fallback=new URL(url);fallback.searchParams.delete('wf-identity');fallback.searchParams.delete('wf-install-check');
        let response;
        try{response=await fetch(new Request(fallback.href,{credentials:'same-origin',cache:'no-cache'}));if(response?.ok)return response;}catch(_){}
        try{
          for(const name of await caches.keys()){
            if(name===CACHE)continue;
            const cached=await(await caches.open(name)).match(fallback.href,{ignoreSearch:true});if(cached)return cached;
          }
        }catch(_){}
        return response||Response.error();
      })();
    }};
  }
  const core={CACHE,DEFAULTS,cleanImage,normalize,buildManifest,platform,iconGeometry,createStore,createResponder};
  if(typeof module!=='undefined'&&module.exports){module.exports=core;return;}
  if(typeof document==='undefined'){
    if(typeof self!=='undefined'&&self.caches)self.wfInstallIdentityWorker=createResponder({caches:self.caches,origin:self.location.origin,fetch:self.fetch.bind(self)});
    return;
  }
  const origin=window.location.origin;
  const store=window.caches?createStore({caches:window.caches,origin}):null;
  const initialManifest=document.querySelector('link[rel~="manifest"]')?.getAttribute('href')||'/manifest.json';
  const initialApple=document.querySelector('link[rel~="apple-touch-icon"]')?.getAttribute('href')||'/apple-touch-icon.png?v=198';
  const device=platform(navigator);
  let generation=0,lastKey='',pending=Promise.resolve(),lastSettings={},prepared=false;
  let deferredPrompt=null,installationObserved=false,installing=false,preparing=false;
  let downloadSource='/app-icon-512.png?v=198',downloadBlob=null;
  let current={mode:'default',reason:'public-default',personalization:'public',custom:false,name:DEFAULTS.name,platform:device};
  function installed(){return installationObserved||navigator.standalone===true||!!window.matchMedia?.('(display-mode: standalone)').matches;}
  function status(){return {...current,installed:installed(),preparing,canInstall:!installed()&&!preparing&&!installing&&(typeof navigator.install==='function'||!!deferredPrompt),canDownloadIcon:true};}
  function notify(){window.dispatchEvent(new CustomEvent('wf-install-identity-change',{detail:status()}));return status();}
  function meta(name,content){let item=document.querySelector(`meta[name="${name}"]`);if(!item){item=document.createElement('meta');item.name=name;document.head.append(item);}item.content=content;}
  function apple(href){
    const links=[...document.querySelectorAll('link[rel~="apple-touch-icon"]')];
    if(!links.length){const item=document.createElement('link');item.rel='apple-touch-icon';document.head.append(item);links.push(item);}
    for(const item of links){item.href=href;item.sizes='180x180';}
  }
  function refreshManifest(){
    deferredPrompt=null;
    const old=document.querySelector('link[rel~="manifest"]');
    if(old){const next=old.cloneNode(false);next.setAttribute('href',initialManifest);old.replaceWith(next);}
    else{const next=document.createElement('link');next.rel='manifest';next.href=initialManifest;document.head.append(next);}
  }
  async function baseManifest(){
    const url=new URL(initialManifest,origin);url.searchParams.set('wf-static','1');
    try{const response=await fetch(url.href,{cache:'no-cache',credentials:'same-origin'});if(response.ok){const value=await response.json();if(value&&typeof value==='object'&&!Array.isArray(value))return value;}}catch(_){}
    return DEFAULTS;
  }
  function decode(source){return new Promise((resolve,reject)=>{
    const image=new Image();const timeout=setTimeout(()=>{image.src='';reject(new Error('image-timeout'));},10000);
    image.onload=()=>{clearTimeout(timeout);if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>24000000)reject(new Error('image-size'));else resolve(image);};
    image.onerror=()=>{clearTimeout(timeout);reject(new Error('image-decode'));};image.src=source;
  });}
  async function makeIcons(source){
    const image=await decode(source),rendered=[];
    for(const [size,path] of [[192,'/app-icon-192.png'],[512,'/app-icon-512.png'],[512,'/app-icon-maskable-512.png'],[180,'/apple-touch-icon.png']]){
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const context=canvas.getContext('2d');if(!context)throw new Error('canvas-unavailable');
      context.fillStyle='#ffffff';context.fillRect(0,0,size,size);
      const box=iconGeometry(image.naturalWidth,image.naturalHeight,size,path.includes('maskable'));
      context.drawImage(image,box.x,box.y,box.width,box.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>2100000)throw new Error('image-encode');
      rendered.push({size,path,blob});
    }
    const bytes=await rendered[1].blob.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const version=[...new Uint8Array(digest)].slice(0,8).map(value=>value.toString(16).padStart(2,'0')).join('');
    return rendered.map(icon=>({...icon,url:icon.path+'?wf-identity='+version}));
  }
  function apply(settings,force=false){
    lastSettings=settings||{};
    const identity=normalize(settings),key=identity.name+'\0'+identity.mode+'\0'+identity.source;
    if(!force&&key===lastKey)return pending;
    lastKey=key;const version=++generation,isCurrent=()=>version===generation;
    preparing=true;meta('application-name',identity.name);meta('apple-mobile-web-app-title',identity.name);
    current={...current,name:identity.name,custom:identity.custom};notify();
    pending=(async()=>{
      try{
        if(!identity.custom){
          if(store)await store.clear(isCurrent);if(!isCurrent())return status();
          downloadSource='/app-icon-512.png?v=198';downloadBlob=null;apple(initialApple);
          if(prepared)refreshManifest();prepared=true;current={...current,mode:'default',reason:'public-default',personalization:'public'};
        }else{
          if(!store||!window.isSecureContext)throw new Error('local-storage-unavailable');
          const [base,icons]=await Promise.all([baseManifest(),identity.source?makeIcons(identity.source):Promise.resolve([])]);
          if(!isCurrent())return status();
          const manifestIcons=icons.filter(icon=>icon.path!=='/apple-touch-icon.png').map(icon=>({src:icon.url,sizes:`${icon.size}x${icon.size}`,type:'image/png',purpose:icon.path.includes('maskable')?'maskable':'any'}));
          const manifest=buildManifest(base,identity,manifestIcons);
          const committed=await store.publish(manifest,icons,isCurrent);if(!committed||!isCurrent())return status();
          downloadSource=identity.source||'/app-icon-512.png?v=198';downloadBlob=icons.find(icon=>icon.path==='/app-icon-512.png')?.blob||null;
          const check=new URL(initialManifest,origin);check.searchParams.set('wf-install-check',String(version));
          let available=false;
          if(navigator.serviceWorker?.controller){try{const response=await fetch(check.href,{cache:'no-cache',credentials:'same-origin'});available=response.headers.get('X-WF-Install-Identity')==='local';}catch(_){}}
          if(!isCurrent())return status();
          if(available){
            apple(icons.find(icon=>icon.path==='/apple-touch-icon.png')?.url||initialApple);refreshManifest();prepared=true;
            current={...current,mode:'local',reason:device==='android'?'android-best-effort':'browser-controlled',personalization:'best-effort'};
          }else{
            apple(initialApple);current={...current,mode:'static-fallback',reason:'waiting-for-worker',personalization:'best-effort'};
          }
        }
      }catch(error){
        if(isCurrent()){
          try{await store?.clear(isCurrent);}catch(_){}
          if(!isCurrent())return status();
          apple(initialApple);downloadSource=identity.source||'/app-icon-512.png?v=198';downloadBlob=null;
          current={...current,mode:'static-fallback',reason:error?.message||'unavailable',personalization:'best-effort'};
          if(prepared)refreshManifest();
        }
      }finally{if(isCurrent()){preparing=false;notify();}}
      return status();
    })();
    return pending;
  }
  async function install(){
    if(!status().canInstall)return {outcome:'unavailable',reason:installed()?'already-installed':preparing?'preparing':'browser-menu'};
    installing=true;const prompt=deferredPrompt;deferredPrompt=null;notify();
    try{
      // Keep the browser API call before any await to retain the user's activation.
      if(typeof navigator.install==='function'){await navigator.install();return {outcome:'installed-or-opened'};}
      await prompt.prompt();const result=await prompt.userChoice;return {outcome:result?.outcome==='accepted'?'accepted':'dismissed'};
    }catch(error){return {outcome:error?.name==='AbortError'?'dismissed':'failed',reason:error?.name||'unavailable'};}
    finally{installing=false;notify();}
  }
  function downloadIcon(){
    let objectURL='';
    try{
      const link=document.createElement('a');objectURL=downloadBlob?URL.createObjectURL(downloadBlob):'';link.href=objectURL||downloadSource;
      const extension=downloadBlob?'png':downloadSource.startsWith('data:image/jpeg;')?'jpg':downloadSource.startsWith('data:image/webp;')?'webp':'png';
      link.download=(current.name.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,60)||'WOW_FURNITURE')+'-icon.'+extension;
      link.hidden=true;document.body.append(link);link.click();link.remove();return Promise.resolve({downloaded:true});
    }catch(_){return Promise.resolve({downloaded:false});}
    finally{if(objectURL)setTimeout(()=>URL.revokeObjectURL(objectURL),30000);}
  }
  window.wfInstallIdentity={apply,status,install,downloadIcon};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;notify();});
  window.addEventListener('appinstalled',()=>{installationObserved=true;deferredPrompt=null;notify();});
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(lastKey)apply(lastSettings,true);});
})();
