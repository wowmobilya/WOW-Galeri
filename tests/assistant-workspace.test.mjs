import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../modules/assistant/core.js');
const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('view did not settle');};
const walk=root=>[root,...root.children.flatMap(walk)];

// Exercise the registered mount, event handlers, stale responses and form lifecycle without browser/network privileges.
class Element extends EventTarget{
  constructor(tag,owner){super();this.tagName=tag;this.ownerDocument=owner;this.dataset={};this.attrs={};this.children=[];this.text='';this.value='';this.checked=false;}
  set textContent(v){this.text=String(v);this.children=[];}
  get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
  set innerHTML(v){throw Error('untrusted markup sink: '+v);}
  append(...items){for(const n of items){if(typeof n==='string'){this.text+=n;continue;}n.parent=this;this.children.push(n);}}
  replaceChildren(...items){for(const x of this.children)x.parent=null;this.text='';this.children=[];this.append(...items);}
  setAttribute(k,v){this.attrs[k]=v;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  querySelector(selector){return selector[0]==='.'?walk(this).find(n=>n.className?.split(' ').includes(selector.slice(1))):
    walk(this).find(n=>n.dataset.ref===selector.match(/data-ref="([^"]+)"/)?.[1]);}
  focus(){this.ownerDocument.activeElement=this;}
  fire(type){this.dispatchEvent(new Event(type,{cancelable:true}));}
}

async function page({configured=true,sources={products:true},generate,inspect}={}){
  const doc=new EventTarget();doc.createElement=t=>new Element(t,doc);
  const root=new EventTarget(),store=new Map(),definitions=[],events=[],opened=[];
  Object.assign(root,{document:doc,crypto:webcrypto,setTimeout,clearTimeout,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
    WFModules:{register:d=>definitions.push(d)}});
  const sandbox=vm.createContext({window:root,globalThis:root,document:doc,TextEncoder,Intl,crypto:webcrypto});
  for(const file of ['core','workspace'])vm.runInContext(await readFile(new URL('../modules/assistant/'+file+'.js',import.meta.url),'utf8'),sandbox);
  assert.equal(definitions.length,1);const def=definitions[0];assert.equal(def.permission,'assistant.view');
  const container=doc.createElement('div');
  const session={authenticated:true,workspaceId:'workspace',userId:'member',role:'custom',sessionVersion:1,authGeneration:1};
  const visible={rows:[{ref:'E1',source:'products',record:'7',title:'<b>Oak chair</b>',detail:'Seating',barcode:'',finding:'match'},
    {ref:'E2',source:'products',record:'8',title:'Oak stool',detail:'Seating',barcode:'',finding:'match'}],fingerprint:'a'.repeat(64),more:false};
  const api={can:key=>key==='assistant.view'||sources[key.split('.')[0]],getSession:()=>session,open:(...v)=>opened.push(v),
    async request(action,payload){
      events.push({action,payload});
      if(action==='assistant.status')return {sources,provider:{configured,lastSuccessAt:null},usedToday:0,dailyLimit:12};
      if(action==='assistant.inspect')return inspect?inspect(payload,visible):visible;
      if(action==='assistant.generate')return generate(payload);
      throw Error('unexpected request');
    }};
  const handle=def.mount({container,api,lang:'en'});
  const field=id=>walk(container).find(n=>n.dataset.field===id);
  const button=label=>walk(container).find(n=>n.tagName==='button'&&n.textContent===label);
  async function runQuery(){
    await wait(()=>field('query'));const input=field('query');input.value='oak';input.fire('input');walk(container).find(n=>n.tagName==='form').fire('submit');
  }
  return {container,field,button,handle,session,root,doc,store,events,opened,runQuery};
}

test('five locales and exact string-based currency formatting work without float conversion',()=>{
  for(const lang of C.locales)for(const key of ['title','search','checks','report','chat','netIn','missingCustomer','aiOff','fresh','expired','circuit','noRooms'])assert(C.t(key,lang).length);
  assert.equal(C.amount('9007199254740993.710000000000','USD','en'),'9,007,199,254,740,993.71 USD');
  assert.equal(C.amount('-0.01','TRY','en'),'−0.01 TRY');assert.equal(C.amount('abc','EUR','en'),'—');
  assert.deepEqual(C.modes({chat:true}),['chat']);assert.deepEqual(C.modes({}),[]);
});

test('deterministic search remains available without model configuration, exposes source and clears stale content',async()=>{
  const p=await page({configured:false});try{
    await p.runQuery();await wait(()=>p.container.textContent.includes('Oak chair'));
    assert(p.container.textContent.includes('Generative summaries need a model'));assert(!p.button(C.t('send','en')));
    assert(!walk(p.container).some(n=>n.tagName==='b'));assert(p.container.textContent.includes('<b>Oak chair</b>'));
    p.button(C.t('open','en')).fire('click');await wait(()=>p.opened.length===1);assert.equal(p.opened[0][0],'products');
    p.handle.updateLanguage('ar');assert.equal(p.field('query').value,'oak');assert.equal(p.container.children[0].dir,'rtl');
    p.doc.hidden=true;p.doc.dispatchEvent(new Event('visibilitychange'));assert(!p.container.textContent.includes('Oak chair'));
    assert.equal(p.events.filter(x=>x.action==='assistant.generate').length,0);
  }finally{p.handle.dispose();}assert.equal(p.container.children.length,0);
});

test('explicit selection, optional focus, language switch, dropped acknowledgement and citations go through normal controls',async()=>{
  const requests=[];
  const p=await page({generate:async input=>{
    requests.push(input);if(requests.length===1)throw Error('NETWORK');
    return {fingerprint:input.fingerprint,cached:true,answer:{notes:[{ref:'E2'}]}};
  }});
  try{
    await p.runQuery();await wait(()=>p.field('focus'));
    const first=walk(p.container).find(n=>n.type==='checkbox');first.checked=false;first.fire('change');
    let focus=p.field('focus');focus.value='Compare seating';focus.fire('input');assert(p.handle.hasUnsavedChanges());
    p.handle.updateLanguage('fr');assert.equal(p.field('focus').value,'Compare seating');assert.equal(p.field('query').value,'oak');
    p.button(C.t('send','fr')).fire('click');await wait(()=>p.container.textContent.includes(C.t('failed','fr')));
    p.button(C.t('send','fr')).fire('click');await wait(()=>p.container.textContent.includes(C.t('highlights','fr')));
    assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);
    assert.deepEqual(Array.from(requests[0].refs),['E2']);assert.equal(requests[0].lang,'fr');
    assert([...p.store.values()].every(v=>!v.includes('Compare seating')&&!v.includes('Oak')&&!v.includes('fingerprint')));
    assert.equal(p.handle.hasUnsavedChanges(),false);
    p.button('E2').fire('click');await wait(()=>p.doc.activeElement?.dataset.ref==='E2');
    p.session.authGeneration++;p.root.dispatchEvent(new Event('wf-cloud-session-change'));
    assert.equal(p.container.children.length,0);
  }finally{p.handle.dispose();}
});

test('late evidence cannot render after identity changes, and no-source accounts cannot run reads',async()=>{
  let resolve,captured;
  const p=await page({inspect:(_payload,view)=>{captured=view;return new Promise(done=>{resolve=done;});}});
  await p.runQuery();await wait(()=>resolve);p.session.userId='other';p.root.dispatchEvent(new Event('wf-account-access-change'));
  resolve(captured);await new Promise(r=>setTimeout(r,5));assert.equal(p.container.children.length,0);p.handle.dispose();
  const q=await page({sources:{}});await wait(()=>q.container.textContent.includes(C.t('noSource','en')));
  assert(!q.button(C.t('run','en')));q.handle.dispose();
});
