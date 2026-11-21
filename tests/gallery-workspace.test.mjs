import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {localDOM} from './fixtures/module-dom.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createGalleryActions} from '../supabase/functions/wow-cloud/modules/gallery.mjs';
const require=createRequire(import.meta.url),core=require('../modules/gallery/core.js'),documents=require('../modules/gallery/exports.js');
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('gallery keeps typed IDs and exact minor units across quantities and currencies',()=>{
 const cart=core.normalizeCart([{productId:7,quantity:3},{productId:'7',quantity:2},{productId:9,quantity:-1}]);
 assert.equal(cart.size,2);assert.equal(core.minor('19,95'),1995);assert.equal(core.minor('2.999'),null);
 const products=[{productId:7,published:true,stock:4,priceMinor:1995,currency:'USD'},{productId:'7',published:true,stock:1,priceMinor:900,currency:'TRY'}];
 const rows=core.stockRows(products,cart);
 assert.deepEqual(rows.map(row=>row.available),[true,false]);assert.deepEqual([...core.totals(rows)],[['USD',5985n],['TRY',1800n]]);
 assert.equal(core.money(900719925474099309n,'USD','en'),'$9,007,199,254,740,993.09');
 assert.equal(core.money(-9n,'USD','en'),'-$0.09');
 const order={id:'o',number:'G-1',status:'ready',items:[{...products[0],name:'Chair',quantity:3,sold:1,showBase:false,showRetail:false,showInPrint:true}]};
 const document=documents.makeDocument([order],{lang:'en',personal:true,profile:{name:'Buyer'}});
 assert.equal(document.rows[0].priceMinor,null);assert.equal(document.totals.size,0);assert.equal(document.rows[0].quantity,2);
 assert.equal(documents.dimsText({name:'Table',dims:[{l:40,w:50,h:60}],specs:{finish:'Oak',hidden:'Private'}},{fields:[{id:'finish',label:'Finish',unit:''},{id:'hidden',visible:false}]},'en').includes('Private'),false);
});
test('PDF export uses a distinct page tree and valid byte offsets for each page',async()=>{
 const blob=documents.pdfBlob(['data:image/jpeg;base64,/9j/2Q==','data:image/jpeg;base64,/9j/2Q==']);
 const bytes=Buffer.from(await blob.arrayBuffer()),data=bytes.toString('latin1');
 assert.match(data,/\/Count 2/);const xref=Number(data.match(/startxref\n(\d+)/)[1]);assert.equal(data.slice(xref,xref+4),'xref');
 const offsets=[...data.matchAll(/(\d{10}) 00000 n/g)].map(x=>Number(x[1]));
 for(const [index,n] of offsets.entries())assert.ok(data.slice(n).startsWith((index+1)+' 0 obj'));
});

// Execute the same registered route, event callbacks, Edge validation and PostgreSQL
// mutations used by the app. The local DOM models controls, focus and native dialogs;
// browser layout, native share and the camera remain separate browser checks.
function descendants(el){return [el,...el.children.flatMap(descendants)];}
function find(el,tag,label){const node=descendants(el).find(e=>e.tagName===tag&&e.textContent===label);assert.ok(node,'missing '+tag+' '+label+' in '+el.textContent.slice(0,170));return node;}
function starts(el,tag,label){const node=descendants(el).find(e=>e.tagName===tag&&e.textContent.startsWith(label));assert.ok(node,'missing '+label);return node;}
function valueField(el,label){const wrapper=descendants(el).find(e=>e.tagName==='LABEL'&&e.children[0]?.textContent===label);assert.ok(wrapper,'missing field '+label);return wrapper.children[1];}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('view did not settle');}
test('native controls publish a WOW product, place a customer order, release it and record and reverse a resale',async()=>{
 const db=await createProviderTestDatabase(),workspace=webcrypto.randomUUID();
 const owner={userId:webcrypto.randomUUID(),sessionId:webcrypto.randomUUID()},buyer={userId:webcrypto.randomUUID(),sessionId:webcrypto.randomUUID()};
 const wants=['gallery.view','myorders.view','myorders.edit','myorders.print','myorders.export'];
 try{
   await db.exec(await read('supabase/modules/gallery.sql'));
   await db.query('insert into wow_workspaces(id,name) values($1,$2)',[workspace,'UI fixture']);
   for(const [id,actor,role,grants] of [['studio',owner,'owner',[]],['buyer',buyer,'custom',wants]]){
     await db.query('insert into auth.users(id) values($1)',[actor.userId]);
     await db.query('insert into auth.sessions(id,user_id,aal) values($1,$2,$3)',[actor.sessionId,actor.userId,'aal1']);
     await db.query('insert into wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$5,$6,$7)',[actor.userId,workspace,id+'@fixture.invalid',id,id,role,grants]);
     await db.query('insert into wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[actor.sessionId,actor.userId]);
   }
   await db.query('insert into wow_records(workspace_id,store,record_id,payload,revision,updated_by) values($1,$2,$3,$4,1,$5)',[workspace,'products','7',JSON.stringify({id:7,name:'Native console',type:'console',priceA:12.35}),owner.userId]);
   const {doc,body}=localDOM(),definitions=new Map(),storage=new Map(),alerts=[],visits=[];
   const win={document:doc,crypto:webcrypto,WFModules:{register:def=>definitions.set(def.id,def)},WFAppIdentity:{sources:()=>({logo:''})},
     matchMedia:()=>({matches:true}),addEventListener(){},removeEventListener(){},setInterval:()=>1,clearInterval(){},confirm:()=>true,
     localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
   const sandbox=vm.createContext({window:win,globalThis:win,URL,Blob,TextEncoder,AbortController,queueMicrotask,Intl,setTimeout,structuredClone});
   for(const file of ['core','exports','workspace'])vm.runInContext(await read('modules/gallery/'+file+'.js'),sandbox);
   const actions=createGalleryActions({moduleRpc:async(name,action,data)=>(await db.query('select wow_gallery_service($1,$2::jsonb) result',[action,JSON.stringify(data)])).rows[0].result,storage:{}});
   let handle,container,active,role,queueOnce=true;const orderRequestIds=[];
   function enter(route,actor){
     if(handle)handle.dispose();container=doc.createElement('div');body.replaceChildren(container);active=actor;role=actor===owner?'owner':'custom';
     const api={getSession:()=>({authenticated:true,currentAccount:{role},userId:active.userId,workspaceId:workspace,sessionVersion:1,authGeneration:1}),
        can:key=>role==='owner'||wants.includes(key),request:(action,payload)=>{
         if(action==='gallery.order.place'){orderRequestIds.push(payload.commandId);if(queueOnce){queueOnce=false;return Promise.resolve({queued:true});}}
         return actions[action]({body:payload,actor:active});
       },
        notify:(msg,type)=>{if(type==='er')alerts.push(msg);},open:(route,params)=>visits.push({route,params})};
     handle=definitions.get(route).mount({route,api,container,lang:'en'});
   }
   const modal=()=>descendants(container).find(e=>e.tagName==='DIALOG'&&e.open);
   assert.equal(definitions.size,4);
   enter('gallery-studio',owner);await until(()=>container.textContent.includes('Native console'));
   await find(container,'BUTTON','Edit').fire('click');let dialog=modal();
   find(dialog,'LABEL','Published').children[0].checked=true;valueField(dialog,'Stock').value=4;
   await find(dialog,'BUTTON','Save').fire('click');await starts(container,'BUTTON','Save inventory changes').fire('click');
   enter('gallery',buyer);await until(()=>container.textContent.includes('Native console'));
   await find(container,'BUTTON','Add').fire('click');await starts(container,'BUTTON','Order cart (1)').fire('click');dialog=modal();
   const consent=find(dialog,'LABEL','I have reviewed the products, quantities and prices.').children[0];consent.checked=true;await consent.fire('change');
   await find(dialog,'BUTTON','Place order').fire('click');
   assert.equal(visits.length,0);assert.ok(modal().open);assert.match(container.textContent,/Awaiting sync/);assert.match([...storage.values()].join(' '),/quantity/);
   await find(dialog,'BUTTON','Place order').fire('click');assert.equal(visits.at(-1).route,'my-orders');assert.equal(orderRequestIds[0],orderRequestIds[1]);
   const orderId=visits.at(-1).params.orderId;
   enter('gallery-orders',owner);await until(()=>container.textContent.includes('Native console'));
   await find(container,'BUTTON','Edit').fire('click');dialog=modal();valueField(dialog,'Status').value='ready';
   await find(dialog,'BUTTON','Save').fire('click');
   enter('my-orders',buyer);await until(()=>container.textContent.includes('Native console'));
   await find(container,'BUTTON','My inventory').fire('click');await find(container,'BUTTON','Record sale').fire('click');dialog=modal();
   valueField(dialog,'Buyer').value='Fixture resale buyer';valueField(dialog,'Resale price · USD').value='19.99';
   await find(dialog,'BUTTON','Save').fire('click');await find(container,'BUTTON','Sales history').fire('click');
   dialog=modal();assert.match(dialog.textContent,/Fixture resale buyer/);await find(dialog,'BUTTON','Reverse sale').fire('click');assert.match(dialog.textContent,/Reversed/);
   const result=(await db.query('select wow_gallery_service($1,$2::jsonb) result',['gallery.personal',JSON.stringify(buyer)])).rows[0].result;
   assert.equal(result.items[0].id,orderId);assert.equal(result.items[0].items[0].sold,0);assert.deepEqual(alerts,[]);
   handle.dispose();assert.equal(container.textContent,'');
 }finally{await db.close();}
});
