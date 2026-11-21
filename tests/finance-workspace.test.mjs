import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createFinanceActions} from '../supabase/functions/wow-cloud/modules/finance.mjs';
const require=createRequire(import.meta.url),C=require('../modules/finance/core.js');
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');

test('financial presentation retains precision, currency separation and spreadsheet-safe text',()=>{
 assert.equal(C.units('1000000000000000.12000000'),100000000000000012n);assert.throws(()=>C.units('1.001'));
 assert.equal(C.amount('123456789012345678.90','en'),'123,456,789,012,345,678.9');
 assert.deepEqual(C.cashTotals([{currency:'USD',net:'0.10'},{currency:'USD',net:'0.20'},{currency:'TRY',net:'1.20'}],'net'),
  [{currency:'USD',value:'0.30'},{currency:'TRY',value:'1.20'}]);
 assert.match(C.csv([{note:'=2+2',amount:'-0.03'}],['note','amount']),/"'=2\+2","-0.03"/);
 for(const [k,v] of Object.entries(C.dictionary))assert.equal(v.length,5,k);
});
test('source snapshots keep typed identities, distinguish missing tables, reserve private payroll and omit connection settings',async()=>{
 const w=randomUUID(),input={acc_employees:[{id:1,name:'A'}],customers:[{id:1,name:'A'},{id:'1',name:'B'}],
  transactions:[{id:'wage',entity_type:'employee',amount:150},{id:'sale',amount:30}],settings:{id:1,company_name:'Shop',api_key:'never import'}};
 const finance=await C.legacyCommands(input,w,'finance'),pay=await C.legacyCommands(input,w,'payroll');
 assert.equal(finance.commands.length,4);assert.equal(pay.commands.length,2);assert.notEqual(finance.commands[1].data.commandId,finance.commands[2].data.commandId);
 assert.equal(JSON.stringify(finance.commands).includes('never import'),false);
 assert.equal(finance.inventory.find(x=>x.table==='metalPrices').present,false);
 assert.equal(finance.commands.find(r=>r.data.table==='transactions').data.sourceId,'sale');
 assert.deepEqual((await C.legacyCommands(input,w,'finance')).commands,finance.commands);
 await assert.rejects(()=>C.legacyCommands({categories:[{id:1},{id:1}]},w,'finance'),/DUPLICATE/);
});

test('price labels validate EAN checksums and render using the shipped CODE128 and UTF-8 QR engines',async()=>{
 const state={window:null,TextEncoder};state.window=state;
 vm.runInNewContext(await read('vendor/JsBarcode.code128.min.js'),state);
 const html=await read('index.html');
 const engine=html.match(/<script[^>]*>([^<]*?\/\* QRCode for JavaScript -[\s\S]*?global[.]WFQRCodeLibrary=[\s\S]*?)<\/script>/i);
 assert.ok(engine,'embedded QR engine');vm.runInNewContext(engine[1],state);
 const helper=(name,next)=>html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'(',html.indexOf('function '+name+'(')));
 vm.runInNewContext(helper('wfQrObject','wfQrImage')+helper('generateQRCodeSVG','generateQRCodeDataURI'),state);
 const engineAPI={encode:state.JsBarcode,qr:state.generateQRCodeSVG};
 assert.equal(C.ean13('400638133393').code,'4006381333931');
 const ean=C.ean13('4006381333931');assert.equal(ean.bits.length,95);assert.equal(ean.bits.slice(45,50),'01010');
 assert.throws(()=>C.ean13('4006381333930'),/INVALID_BARCODE/);
 assert.match(C.barcodeImage('CODE128','WOW42',engineAPI).svg,/<path d="M/);
 assert.match(C.barcodeImage('QR','متجر · WOW',engineAPI).svg,/crispEdges/);
 assert.throws(()=>C.barcodeImage('CODE128','متجر',engineAPI),/INVALID_BARCODE/);
});

// A small DOM implementation exercises the registered screen, form events, actual Edge validators and PostgreSQL without a browser/socket.
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.events={};this.style={};this.data='';this.value='';this.files=[];this.name='';}
 get textContent(){return this.data+this.children.map(c=>c.textContent).join(' ');}
 set textContent(v){this.data=String(v??'');this.children=[];}
 get all(){return [this,...this.children.flatMap(x=>x.all)];}
 append(...items){for(const x of items){x.parent=this;this.children.push(x);if(this.tagName==='SELECT'&&this.children.length===1)this.value=x.value;}}
 add(o){this.append(o);}
 replaceChildren(...items){this.children=[];this.data='';this.append(...items);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
 get options(){return this.children;}
 get elements(){const els=this.all.filter(e=>['SELECT','INPUT','TEXTAREA','BUTTON','OUTPUT'].includes(e.tagName));for(const e of els)if(e.name)els[e.name]=e;return els;}
 closest(tag){for(let n=this;n;n=n.parent)if(n.tagName===tag.toUpperCase())return n;return null;}
 querySelector(s){return this.all.find(n=>s==='[role=alert]'?n.attrs.role==='alert':n.tagName===s.toUpperCase());}
 showModal(){this.open=true;}close(){this.open=false;}reportValidity(){return true;}
 async click(){for(const fn of this.events.click||[])await fn({target:this,preventDefault(){}});}
 async submit(){await this.onsubmit({preventDefault(){}});}
}
class Option extends Element{constructor(label,value){super('option');this.value=value;this.textContent=label;}}
const by=(container,tag,label)=>{const r=container.all.find(e=>e.tagName===tag&&(!label||e.textContent===label));assert.ok(r,tag+' '+label+' in '+container.textContent.slice(-240));return r;};
const wait=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,8));}assert.fail('Timed out waiting for rendered result');};
test('registered finance form keeps retry IDs, pending amounts and private cleanup correct through the real service',async()=>{
 const db=await createProviderTestDatabase(),w=randomUUID(),user=randomUUID(),session=randomUUID();
 try{
  await db.exec(await read('supabase/modules/finance.sql'));
  await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query("insert into public.wow_workspaces(id,name) values($1,'Test')",[w]);
  await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role) values($1,$2,'fixture@wow.invalid','finance.fixture','Owner','owner')",[user,w]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
  await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[session,user]);
  const rpc=async(name,act,b)=>(await db.query('select public.wow_finance_service($1,$2::jsonb) r',[act,JSON.stringify(b)])).rows[0].r;
  const services=createFinanceActions({moduleRpc:rpc}),definitions=new Map(),document={body:new Element('body'),createElement:t=>new Element(t)};
  const context={window:null,crypto:webcrypto,Intl,Date,Option,AbortController,URL,Blob,TextEncoder,setTimeout,document,WFFinanceCore:C,
   WFModules:{register(def){definitions.set(def.id,def);}}};context.window=context;
  vm.runInNewContext(await read('modules/finance/workspace.js'),context);
  const actor={userId:user,sessionId:session},container=new Element('main'),state={workspaceId:w,role:'owner'},attempts=[];
  let listener,disconnected=false,queued,behavior='fail';
  const api={can:()=>true,getSession:()=>state,notify(){},listOutbox:async()=>[],
   subscribeReceipts(fn){listener=fn;return ()=>{disconnected=true;};},async request(action,b){
    if(action==='finance.transaction'){attempts.push(b.commandId);if(behavior==='fail')throw Object.assign(Error('Network'),{code:'SERVICE_UNAVAILABLE'});
     if(behavior==='queue'){queued=b;return {queued:true,commandId:b.commandId,queueId:b.commandId};}}
    return services[action]({actor,body:b});
   }};
  assert.deepEqual([...definitions.keys()],['finance','payroll','metals']);
  const handle=await definitions.get('finance').mount({route:'finance',container,api,lang:'en',params:{tab:'ledger'}});
  await by(container,'BUTTON','Income').click();const form=by(by(container,'DIALOG'),'FORM');
  form.elements.box.value='main:USD';form.elements.currency.value='USD';form.elements.amount.value='19.95';
  form.elements.description.value='Verified receipt';form.elements.day.value='2025-05-04';
  await form.submit();assert.ok(container.all.includes(form));assert.match(form.textContent,/SERVICE_UNAVAILABLE/);
  behavior='queue';await form.submit();assert.equal(attempts.length,2);assert.equal(attempts[0],attempts[1]);
  assert.match(container.textContent,/Pending sync/);assert.doesNotMatch(container.textContent,/Verified receipt/);
  await services['finance.transaction']({actor,body:queued});behavior='post';
  listener({action:'finance.transaction',status:'posted',queueId:queued.commandId,commandId:queued.commandId});
  await wait(()=>container.textContent.includes('Verified receipt'));assert.doesNotMatch(container.textContent,/Pending sync/);
  assert.equal((await db.query("select wow_fin.balance($1,'main:USD')::text n",[w])).rows[0].n,'19.95');
  handle.updateLanguage('ar');assert.match(container.textContent,/سجل حركة النقد/);handle.dispose();assert.equal(container.textContent,'');assert.equal(disconnected,true);
 }finally{await db.close();}
});
