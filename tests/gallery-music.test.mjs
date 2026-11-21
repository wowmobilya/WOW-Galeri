import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {localDOM} from './fixtures/module-dom.mjs';

const source=await fs.readFile(new URL('../modules/gallery/music.js',import.meta.url),'utf8').catch(()=>null);
const descendants=node=>[node,...node.children.flatMap(descendants)];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const dispatch=async(node,type,values={})=>{
  const event={type,target:node,isTrusted:true,preventDefault(){},...values};
  for(const fn of [...(node.listeners[type]||[])])await fn(event);
};
function fixture({storage=new Map(),throwStorage=false}={}){
  assert.ok(source,'The gallery music controller must be implemented.');
  const {doc,body}=localDOM(),create=doc.createElement,audios=[],observers=[];
  doc.baseURI='https://app.example/subdir/';doc.currentScript={src:'https://app.example/subdir/modules/gallery/music.js?v=1'};
  doc.hidden=false;doc.visibilityState='visible';
  const win={document:doc,URL,location:new URL(doc.baseURI),listeners:{},
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},
    removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(x=>x!==fn);},
    localStorage:{getItem:key=>{if(throwStorage)throw Error('Storage unavailable');return storage.get(key)||null;},
      setItem:(key,value)=>{if(throwStorage)throw Error('Quota exceeded');storage.set(key,value);}}};
  let endpoint='https://project-a.supabase.co/functions/v1/wow-cloud',speech={},allowed=true;
  let session={authenticated:true,mode:'remote',workspaceId:'workspace-a',userId:'buyer-a',sessionVersion:1,authGeneration:1,
    currentAccount:{id:'buyer-a',role:'customer',status:'active',permissions:['gallery.view']},accessToken:'never-save-this-secret'};
  win.WFCloud={getConfig:()=>({endpoint})};win.WFProgramSpeech={getState:()=>speech};
  win.MutationObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;this.active=true;}disconnect(){this.active=false;}};
  doc.createElement=tag=>{
    const node=create(tag);if(tag!=='audio')return node;
    Object.assign(node,{paused:true,ended:false,currentTime:0,volume:1,loop:false,autoplay:false,preload:'auto',src:'',playCalls:0});
    node.emit=type=>{for(const fn of [...(node.listeners[type]||[])])fn({type,target:node,isTrusted:true});};
    node.play=()=>{node.playCalls++;node.paused=false;node.emit('play');
      if(node.playResult)return node.playResult();node.emit('playing');return Promise.resolve();};
    node.pause=()=>{const was=node.paused;node.paused=true;if(!was)node.emit('pause');};
    node.load=()=>{node.paused=true;node.currentTime=0;};
    const remove=node.removeAttribute.bind(node);node.removeAttribute=key=>{remove(key);if(key==='src')node.src='';};
    audios.push(node);return node;
  };
  const context=vm.createContext({window:win,globalThis:win,URL,Date,JSON,Math,Number,Promise,Set,Object,Error,TextEncoder,AbortController,Blob,Intl,queueMicrotask});
  vm.runInContext(source,context);
  const api={getSession:()=>session,can:()=>allowed};
  function mount(lang='en',parent=body){
    const container=doc.createElement('div');parent.append(container);
    const handle=win.WFGalleryMusic.mount({container,api,lang,permission:'gallery.view'});
    const nodes=descendants(container);
    return {container,handle,button:nodes.find(n=>n.tagName==='BUTTON'),volume:nodes.find(n=>n.type==='range'),audio:audios.at(-1)};
  }
  return {doc,win,storage,audios,mount,api,context,observers,session:()=>session,
    async mutation(target){for(const observer of observers.filter(x=>x.active&&x.target===target))await observer.callback([{target}]);},
    setSession(value){session=value;},setEndpoint(value){endpoint=value;},setAllowed(value){allowed=value;},
    async sessionEvent(){await dispatch(win,'wf-cloud-session-change');},
    async speech(value){speech=value;await dispatch(win,'wf-program-speech-state',{detail:value});},
    async hide(){doc.hidden=true;doc.visibilityState='hidden';await dispatch(doc,'visibilitychange');},
    async show(){doc.hidden=false;doc.visibilityState='visible';await dispatch(doc,'visibilitychange');}};
}
function delayed(audio){
  let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});audio.playResult=()=>pending;
  return {resolve(){audio.paused=false;audio.emit('playing');resolve();},reject};
}

test('music stays unloaded and silent until a trusted gesture, including after a saved enabled preference',async()=>{
  const f=fixture(),view=f.mount();assert.equal(view.audio.playCalls,0);assert.equal(view.audio.src,'');assert.equal(view.audio.preload,'none');assert.equal(view.audio.autoplay,false);
  await dispatch(view.button,'click',{isTrusted:false});assert.equal(view.audio.playCalls,0);
  await dispatch(view.button,'click');assert.equal(view.audio.paused,false);assert.equal(view.button.getAttribute('aria-pressed'),'true');
  assert.equal(view.audio.src,'https://app.example/subdir/assets/gallery/wow-ambient-v1.mp3');assert.equal(view.audio.loop,true);
  assert.equal(view.audio.volume,0.18);view.handle.dispose();
  const restored=f.mount();assert.equal(restored.audio.playCalls,0);assert.equal(restored.audio.src,'');assert.equal(restored.button.getAttribute('aria-pressed'),'false');
  restored.handle.dispose();
});

test('the user can pause pending playback and a late fulfillment cannot restart it',async()=>{
  const f=fixture(),view=f.mount(),pending=delayed(view.audio);const click=dispatch(view.button,'click');
  assert.equal(view.button.getAttribute('aria-pressed'),'false');assert.match(view.container.textContent,/Loading/);
  await dispatch(view.button,'click');assert.equal(view.audio.paused,true);assert.equal(view.audio.src,'');
  await dispatch(view.button,'click');assert.equal(view.audio.playCalls,1,'A cancelled, unsettled native attempt cannot overlap another attempt.');
  pending.resolve();await click;await flush();assert.equal(view.audio.paused,true);assert.equal(view.button.getAttribute('aria-pressed'),'false');assert.equal(view.button.disabled,false);
  view.handle.dispose();
});

for(const boundary of ['logout','account','workspace','endpoint','epoch','permission','hidden','dispose'])test('late playback stays stopped across '+boundary,async()=>{
  const f=fixture(),view=f.mount(),pending=delayed(view.audio);const click=dispatch(view.button,'click');
  if(boundary==='logout')f.setSession({...f.session(),authenticated:false,currentAccount:null});
  if(boundary==='account')f.setSession({...f.session(),userId:'buyer-b',currentAccount:{...f.session().currentAccount,id:'buyer-b'}});
  if(boundary==='workspace')f.setSession({...f.session(),workspaceId:'workspace-b'});
  if(boundary==='endpoint')f.setEndpoint('https://project-b.supabase.co/functions/v1/wow-cloud');
  if(boundary==='epoch')f.setSession({...f.session(),authGeneration:2});
  if(boundary==='permission')f.setAllowed(false);
  if(boundary==='hidden')await f.hide();else if(boundary==='dispose')view.handle.dispose();else await f.sessionEvent();
  assert.equal(view.audio.paused,true);pending.resolve();await click;await flush();assert.equal(view.audio.paused,true);assert.equal(view.audio.loop,false);
  if(boundary==='hidden'){await f.show();assert.equal(view.audio.playCalls,1);assert.equal(view.button.getAttribute('aria-pressed'),'false');}
  view.handle.dispose();
  assert.equal(Object.values(f.win.listeners).flat().length,0);assert.equal(Object.values(f.doc.listeners).flat().length,0);assert.equal(Object.values(view.audio.listeners).flat().length,0);
});

test('unannounced identity drift is fenced when the media begins and its promise settles',async()=>{
  const f=fixture(),view=f.mount(),pending=delayed(view.audio);const click=dispatch(view.button,'click');
  f.setSession({...f.session(),sessionVersion:2});pending.resolve();await click;await flush();assert.equal(view.audio.paused,true);assert.equal(view.button.disabled,true);view.handle.dispose();
});

test('a retained dirty gallery page stops pending playback when its route becomes inactive and never resumes on return',async()=>{
  const f=fixture(),page=f.doc.createElement('section');page.className='page active';f.doc.body.append(page);
  const view=f.mount('en',page),pending=delayed(view.audio),click=dispatch(view.button,'click');
  page.className='page';await f.mutation(page);assert.equal(view.audio.paused,true);assert.equal(view.button.disabled,true);
  pending.resolve();await click;assert.equal(view.audio.paused,true);
  page.className='page active';await f.mutation(page);assert.equal(view.button.disabled,false);assert.equal(view.audio.playCalls,1);
  view.handle.dispose();assert.equal(f.observers.filter(observer=>observer.active).length,0);
});

test('an inactive owning page is checked even before its mutation observer runs',async()=>{
  const f=fixture(),page=f.doc.createElement('section');page.className='page active';f.doc.body.append(page);
  const view=f.mount('en',page),pending=delayed(view.audio),click=dispatch(view.button,'click');
  page.className='page';pending.resolve();await click;assert.equal(view.audio.paused,true);
  view.handle.dispose();
});

test('existing speech activity pauses music immediately and ending speech never resumes it',async()=>{
  const f=fixture(),view=f.mount();await dispatch(view.button,'click');await f.speech({active:true,state:'preparing',paused:false});
  assert.equal(view.audio.paused,true);assert.equal(view.button.disabled,true);assert.match(view.container.textContent,/speech/i);
  await dispatch(view.button,'click');assert.equal(view.audio.playCalls,1);
  await f.speech({active:false,state:'idle',paused:false});assert.equal(view.audio.playCalls,1);assert.equal(view.button.disabled,false);
  await dispatch(view.button,'click');assert.equal(view.audio.paused,false);view.handle.dispose();
});

test('speech already active at mount and speech that interrupts a pending play both stay quiet',async()=>{
  const f=fixture();await f.speech({active:true,state:'speaking'});const view=f.mount();assert.equal(view.button.disabled,true);assert.equal(view.audio.playCalls,0);
  await f.speech({active:false});const pending=delayed(view.audio),click=dispatch(view.button,'click');
  await f.speech({active:true,state:'speaking'});pending.resolve();await click;await f.speech({active:false});
  assert.equal(view.audio.paused,true);assert.equal(view.audio.playCalls,1);view.handle.dispose();
});

test('speech events work while the optional speech state getter is unavailable',async()=>{
  const f=fixture(),view=f.mount();delete f.win.WFProgramSpeech;await dispatch(view.button,'click');
  await dispatch(f.win,'wf-program-speech-state',{detail:{active:true}});assert.equal(view.audio.paused,true);assert.equal(view.button.disabled,true);
  await dispatch(f.win,'wf-program-speech-state',{detail:{active:false}});assert.equal(view.button.disabled,false);assert.equal(view.audio.playCalls,1);view.handle.dispose();
});

test('playing music stops at local lock, pagehide, and other native audio without claiming media-session controls',async()=>{
  for(const cause of ['lock','pagehide','other-audio']){
    const f=fixture(),view=f.mount();await dispatch(view.button,'click');
    if(cause==='lock'){f.setAllowed(false);await dispatch(f.win,'wf-account-access-change');}
    if(cause==='pagehide')await dispatch(f.win,'pagehide');
    if(cause==='other-audio')await dispatch(f.doc,'play',{target:{tagName:'AUDIO'}});
    assert.equal(view.audio.paused,true);assert.equal(view.button.getAttribute('aria-pressed'),'false');view.handle.dispose();
  }
});

test('volume preferences are isolated by endpoint, workspace and account and never store session secrets',async()=>{
  const f=fixture();let view=f.mount();view.volume.value='37';await dispatch(view.volume,'input');assert.equal(view.audio.volume,0.37);view.handle.dispose();
  const original={...f.session()},endpoint='https://project-a.supabase.co/functions/v1/wow-cloud';
  for(const kind of ['account','workspace','endpoint']){
    f.setSession({...original,...(kind==='account'?{userId:'buyer-b',currentAccount:{...original.currentAccount,id:'buyer-b'}}:{}),...(kind==='workspace'?{workspaceId:'workspace-b'}:{})});
    f.setEndpoint(kind==='endpoint'?'https://project-b.supabase.co/functions/v1/wow-cloud':endpoint);view=f.mount();assert.equal(view.audio.volume,0.18,kind);view.handle.dispose();
  }
  f.setSession(original);f.setEndpoint(endpoint);view=f.mount();assert.equal(view.audio.volume,0.37);assert.equal(view.audio.playCalls,0);view.handle.dispose();
  assert.equal(f.storage.size,1);assert.doesNotMatch([...f.storage.values()].join(''),/never-save-this-secret|permissions|currentAccount|sessionVersion/);
});

test('preference storage evicts older identities and stays bounded instead of accumulating accounts',async()=>{
  const f=fixture();for(let i=0;i<20;i++){
    f.setSession({...f.session(),userId:'buyer-'+i,currentAccount:{...f.session().currentAccount,id:'buyer-'+i}});
    const view=f.mount();view.volume.value='42';await dispatch(view.volume,'input');view.handle.dispose();
  }
  assert.equal(f.storage.size,1);const saved=[...f.storage.values()][0];assert.ok(Buffer.byteLength(saved)<=12288);assert.ok(JSON.parse(saved).entries.length<=8);
  f.setSession({...f.session(),userId:'buyer-0',currentAccount:{...f.session().currentAccount,id:'buyer-0'}});let view=f.mount();assert.equal(view.audio.volume,0.18);view.handle.dispose();
  f.setSession({...f.session(),userId:'buyer-19',currentAccount:{...f.session().currentAccount,id:'buyer-19'}});view=f.mount();assert.equal(view.audio.volume,0.42);view.handle.dispose();
});

test('the preference byte limit also bounds non-ASCII identifiers without losing the newest volume',async()=>{
  const f=fixture();f.setEndpoint('https://project-a.supabase.co/'+('x'.repeat(455)));for(let i=0;i<12;i++){
    const userId='界'.repeat(125)+i;f.setSession({...f.session(),workspaceId:'界'.repeat(128),userId,currentAccount:{...f.session().currentAccount,id:userId}});
    const view=f.mount();view.volume.value='54';await dispatch(view.volume,'input');view.handle.dispose();
  }
  const saved=[...f.storage.values()][0];assert.ok(Buffer.byteLength(saved)<=12288);
  const latest=f.mount();assert.equal(latest.audio.volume,0.54);latest.handle.dispose();
});

test('damaged or unavailable local storage cannot prevent manual playback or create an invalid volume',async()=>{
  for(const bad of ['{broken','x'.repeat(13000),JSON.stringify({version:1,entries:[{key:'bad',volume:100,enabled:true}]})]){
    const f=fixture({storage:new Map([['wf.gallery.music.v1',bad]])}),view=f.mount();assert.equal(view.audio.volume,0.18);await dispatch(view.button,'click');assert.equal(view.audio.paused,false);view.handle.dispose();
  }
  const f=fixture({throwStorage:true}),view=f.mount();view.volume.value='25';await dispatch(view.volume,'input');await dispatch(view.button,'click');assert.equal(view.audio.volume,0.25);assert.equal(view.audio.paused,false);view.handle.dispose();
});

test('rejected play, failed media, and external pause report honest state without an automatic retry',async()=>{
  for(const cause of ['policy','file','pause']){
    const f=fixture(),view=f.mount();
    if(cause==='policy')view.audio.playResult=()=>Promise.reject(Object.assign(Error('Blocked'),{name:'NotAllowedError'}));
    await dispatch(view.button,'click');
    if(cause==='file')view.audio.emit('error');if(cause==='pause')view.audio.pause();await flush();
    assert.equal(view.audio.paused,true);assert.equal(view.audio.playCalls,1);assert.equal(view.button.getAttribute('aria-pressed'),'false');
    if(cause!=='pause')assert.match(view.container.textContent,/unable|could not|unavailable|blocked/i);view.handle.dispose();
  }
});

test('five locale labels and RTL update without reconstructing or starting the audio',()=>{
  const f=fixture(),view=f.mount('en'),labels=[];
  for(const locale of ['ar','tr','en','fr','ru']){
    view.handle.updateLanguage(locale);labels.push(view.button.textContent);assert.ok(view.button.getAttribute('aria-label'));
    assert.equal(view.container.children[0].getAttribute('dir'),locale==='ar'?'rtl':'ltr');assert.equal(view.audio.playCalls,0);assert.doesNotMatch(view.container.textContent,/undefined/);
  }
  assert.equal(new Set(labels).size,5);view.handle.dispose();
});

test('the gallery route mounts music once across catalog and language redraws and disposes it on exit',async()=>{
  const f=fixture(),definitions=new Map();f.win.WFModules={register:value=>definitions.set(value.id,value)};
  f.win.setInterval=()=>1;f.win.clearInterval=()=>{};
  f.api.request=async()=>({items:[],hasMore:false,presentation:{}});
  for(const file of ['core','exports','workspace'])vm.runInContext(await fs.readFile(new URL('../modules/gallery/'+file+'.js',import.meta.url),'utf8'),f.context);
  const container=f.doc.createElement('div');f.doc.body.append(container);
  const handle=definitions.get('gallery').mount({route:'gallery',container,api:f.api,lang:'en'});await flush();
  const button=descendants(container).find(node=>node.tagName==='BUTTON'&&node.textContent==='Play music');assert.ok(button,'Gallery must mount its persistent music controls.');
  await dispatch(button,'click');handle.updateLanguage('tr');assert.equal(f.audios.length,1);assert.equal(f.audios[0].paused,false);
  assert.equal(button.textContent,'Müziği durdur');handle.dispose();assert.equal(f.audios[0].paused,true);assert.equal(container.textContent,'');
});
