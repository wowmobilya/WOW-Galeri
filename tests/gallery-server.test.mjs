import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createGalleryActions, validateGalleryAction, formatGalleryNotice} from '../supabase/functions/wow-cloud/modules/gallery.mjs';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
const commandId='11111111-3333-4333-8333-123456789012';
test('gallery validates typed IDs, server price expectations and bounded order quantities',()=>{
 const items=[{productId:2,quantity:1,priceMinor:1050,currency:'USD'},{productId:'2',quantity:3,priceMinor:2400,currency:'TRY'}];
 const data={commandId,accepted:true,items,note:'sample'};
 assert.deepEqual(validateGalleryAction('gallery.order.place',data),{items,note:'sample',accepted:true,commandId});
 for(const change of [{items:[items[0],items[0]]},{items:[{...items[0],quantity:-1}]},{items:[{...items[0],priceMinor:1.005}]},{accepted:false},{items:[]}]){
   assert.throws(()=>validateGalleryAction('gallery.order.place',{...data,...change}),{code:'INVALID_GALLERY_INPUT'});
 }
});
test('gallery transport takes its authority from the verified actor and keeps object paths private',async()=>{
 const calls=[],actor={userId:'authenticated-user',sessionId:'verified-session'};
 const actions=createGalleryActions({moduleRpc:async(...args)=>{calls.push(args);return {path:'workspace/secure'};},storage:{sign:async(path,ttl)=>path.endsWith('secure')&&ttl===90?'signed-url':null}});
 const response=await actions['gallery.image']({body:{productId:'model-1',userId:'ignored',sessionId:'ignored',path:'ignored'},actor});
 assert.deepEqual(response,{url:'signed-url'});
 assert.deepEqual(calls[0],['wow_gallery_service','gallery.image',{productId:'model-1',orderId:null,...actor}]);
 await assert.rejects(actions['gallery.image.upload']({body:{commandId,purpose:'print',data:'data:text/html;base64,AAAA'},actor}),{code:'INVALID_IMAGE'});
});
test('PostgreSQL enforces gallery stock, authorization, private sales, snapshots, idempotency and rollback',async()=>{
 const db=await createProviderTestDatabase();
 try{
   await db.exec(await readFile(new URL('../supabase/modules/gallery.sql',import.meta.url),'utf8'));
   await db.exec(await readFile(new URL('./gallery-transaction.sql',import.meta.url),'utf8'));
   const result=await db.query('select count(*) n from public.wow_gallery_orders');
   assert.equal(result.rows[0].n,0);
 }finally{await db.close();}
});

test('worker copy exposes only a typed route target and localized generic notice',()=>{
 const payload=formatGalleryNotice({eventId:commandId,orderId:commandId,kind:'order.updated',priceMinor:999,note:'hidden',phone:'hidden'},'tr');
 assert.equal(payload.title,'Siparişiniz güncellendi');assert.deepEqual(payload.params,{orderId:commandId});assert.equal(payload.route,'my-orders');
 assert.equal(JSON.stringify(payload).includes('hidden'),false);assert.equal(formatGalleryNotice({kind:'arbitrary'}),null);
});
