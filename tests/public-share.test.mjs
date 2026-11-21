import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createPublicShareActions,createPublicShareAPI} from '../supabase/functions/wow-cloud/modules/public-share.mjs';
import {createPublicShareFrontend,renderPublicShare} from '../modules/gallery/public-share-render.mjs';
import {localDOM} from './fixtures/module-dom.mjs';

const site='https://markrobot.wowfurniture.com.tr',project='https://sldthbnigivpsqixccah.supabase.co';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCr8AAAAASUVORK5CYII=','base64');
const hash=createHash('sha256').update(png).digest('hex');
async function fixture(t){
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 for(const file of ['gallery','public-share','public-share'])await db.exec(await readFile(new URL('../supabase/modules/'+file+'.sql',import.meta.url),'utf8'));
 async function workspace(){const id=randomUUID();await db.query("insert into public.wow_workspaces(id,name) values($1,'INTERNAL-WORKSPACE-SECRET')",[id]);return id;}
 async function actor(workspace,role='owner'){
  const userId=randomUUID(),sessionId=randomUUID();await db.query('insert into auth.users(id) values($1)',[userId]);
  await db.query('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$5,$6,$7)',
   [userId,workspace,userId+'@wow.invalid','u'+userId.slice(0,8),'PRIVATE-NAME',role,role==='owner'?[]:['gallery.view','gallery.edit']]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sessionId,userId]);return {userId,sessionId};
 }
 const wid=await workspace(),other=await workspace(),owner=await actor(wid),staff=await actor(wid,'custom'),foreign=await actor(other);
 const imageId=randomUUID(),path=wid+'/gallery/'+owner.userId+'/'+imageId+'.png';
 await db.query("insert into public.wow_gallery_assets(id,workspace_id,account_id,purpose,content_type,digest,size_bytes,path,ready) values($1,$2,$3,'presentation','png',$4,$5,$6,true)",[imageId,wid,owner.userId,hash,png.length,path]);
 await db.query('insert into public.wow_gallery_presentation(workspace_id,value) values($1,$2::jsonb)',[wid,JSON.stringify({ogTitle:'<script>private-script</script> " WOW',ogDescription:'Brand & furniture\nnew line',ogImageId:imageId,cards:[{description:'PRIVATE-CARD'}]})]);
 const calls=[];let fetches=0,onFetch;
 const moduleRpc=async(name,action,data)=>{assert.equal(name,'wow_public_share_service');calls.push({action,data});return (await db.query('select public.wow_public_share_service($1,$2::jsonb) v',[action,JSON.stringify(data)])).rows[0].v;};
 const options={moduleRpc,projectUrl:project,publicOrigin:site,allowedOrigins:[site],
  storage:{sign:async(p,ttl)=>{assert.equal(p,path);assert.equal(ttl,60);return project+'/storage/v1/object/sign/wow-files/'+p+'?token=fixture';}},
  fetch:async(url,opts)=>{fetches++;assert.equal(url,project+'/storage/v1/object/sign/wow-files/'+path+'?token=fixture');assert.equal(opts.redirect,'error');await onFetch?.();return new Response(png,{headers:{'content-type':'image/png'}});}};
 const actions=createPublicShareActions(options),api=createPublicShareAPI(options);
 const publish=(body={},actor=owner)=>actions['gallery.share.publish']({actor,body:{commandId:randomUUID(),revision:0,presentationVersion:1,language:'ar',confirmed:true,...body}});
 return {db,wid,other,owner,staff,foreign,imageId,path,moduleRpc,options,actions,api,publish,calls,get fetches(){return fetches;},set onFetch(fn){onFetch=fn;}};
}

test('only the verified owner can deliberately publish a bounded snapshot; tables and RPC stay private',async(t)=>{
 const f=await fixture(t);
 assert.deepEqual((await f.db.query("select has_table_privilege('anon','public.wow_gallery_public_share','select') a,has_function_privilege('authenticated','public.wow_public_share_service(text,jsonb)','execute') b,relrowsecurity c from pg_class where oid='public.wow_gallery_public_share'::regclass")).rows[0],{a:false,b:false,c:true});
 for(const actor of [f.staff])await assert.rejects(()=>f.publish({},actor),/ACCESS_DENIED/);
 assert.equal(f.fetches,0);
 await assert.rejects(()=>f.publish({confirmed:false}),{code:'INVALID_SHARE_INPUT'});
 const commandId=randomUUID(),result=await f.publish({commandId,userId:f.foreign.userId,workspaceId:f.other,imageData:'malicious'});
 assert.equal(result.published,true);assert.equal(result.revision,1);assert.equal(result.url,site+'/share/'+result.publicId+'/');
 assert.deepEqual(await f.publish({commandId}),result);assert.equal(f.fetches,1,'committed retry does not recopy the image');
 const response=await f.api(new Request(project+'/functions/v1/wow-cloud/public-share/'+result.publicId+'/metadata'));
 assert.equal(response.status,200);const metadata=await response.json();
 assert.deepEqual(Object.keys(metadata).sort(),['description','image','language','publicId','siteOrigin','title']);
 assert.equal(metadata.description,'Brand & furniture new line');
 const json=JSON.stringify(metadata);for(const secret of ['INTERNAL-WORKSPACE-SECRET','PRIVATE-CARD','PRIVATE-NAME',f.wid,f.owner.userId,f.imageId,f.path])assert(!json.includes(secret));
 const image=await f.api(new Request(project+'/functions/v1/wow-cloud/public-share/'+result.publicId+'/image/'+hash+'.png'));
 assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);assert.equal(image.headers.get('cache-control'),'no-store');
 const status=await f.actions['gallery.share.status']({actor:f.owner,body:{}});assert.equal(status.publishedVersion,1);
});

test('a foreign selected image, lost authority, changed presentation or changed immutable bytes cannot publish',async(t)=>{
 const f=await fixture(t);
 await f.db.query('insert into public.wow_gallery_presentation(workspace_id,value) values($1,$2::jsonb)',[f.other,JSON.stringify({ogTitle:'Other',ogImageId:f.imageId})]);
 await assert.rejects(()=>f.publish({},f.foreign),/INVALID_SHARE_IMAGE/);assert.equal(f.fetches,0);
 f.onFetch=async()=>f.db.query('update public.wow_gallery_presentation set version=version+1 where workspace_id=$1',[f.wid]);
 await assert.rejects(()=>f.publish(),/CONFLICT/);
 assert.equal((await f.db.query('select count(*)::int n from public.wow_gallery_public_share')).rows[0].n,0);
 f.onFetch=async()=>f.db.query('update public.wow_sessions set closed_at=now() where session_id=$1',[f.owner.sessionId]);
 await assert.rejects(()=>f.publish({presentationVersion:2}),/SESSION_REVOKED/);
 assert.equal((await f.db.query('select count(*)::int n from public.wow_gallery_public_share')).rows[0].n,0);
});

test('private source retirement does not break the approved copy; unpublish removes it and old image URLs immediately',async(t)=>{
 const f=await fixture(t),commandId=randomUUID(),published=await f.publish({commandId});
 const metaURL=project+'/functions/v1/wow-cloud/public-share/'+published.publicId+'/metadata';
 const imageURL=project+'/functions/v1/wow-cloud/public-share/'+published.publicId+'/image/'+hash+'.png';
 await f.db.query("update public.wow_gallery_assets set lifecycle='removed' where id=$1",[f.imageId]);
 await f.db.query("update public.wow_gallery_presentation set value='{}',version=version+1 where workspace_id=$1",[f.wid]);
 assert.equal((await f.api(new Request(imageURL))).status,200,'snapshot bytes have an independent explicit lifetime');
 const status=await f.actions['gallery.share.status']({actor:f.owner});assert.notEqual(status.publishedVersion,status.presentationVersion);
 const off={commandId:randomUUID(),revision:1};
 const disabled=createPublicShareActions({...f.options,publicOrigin:''});
 assert.equal((await disabled['gallery.share.unpublish']({actor:f.owner,body:off})).published,false,'unpublish works even if the frontend route was disabled');
 assert.equal((await f.api(new Request(metaURL))).status,404);assert.equal((await f.api(new Request(imageURL))).status,404);
 assert.equal((await f.db.query('select image_data is null n from public.wow_gallery_public_share')).rows[0].n,true);
 assert.equal((await f.publish({commandId})).revision,1,'old immutable receipt does not republish after unpublish');
 assert.equal((await f.api(new Request(metaURL))).status,404);
 await assert.rejects(()=>disabled['gallery.share.publish']({actor:f.owner,body:{}}),{code:'SHARE_NOT_CONFIGURED'});
});

test('same-origin frontend renders escaped crawler HTML and exact published image without forwarding credentials',async(t)=>{
 const f=await fixture(t),published=await f.publish();
 const frontend=createPublicShareFrontend({apiOrigin:project+'/',siteOrigin:site+'/',fetch:async(url,opts)=>{
  assert.deepEqual(Object.keys(opts.headers),['Accept']);assert.equal(opts.redirect,'error');return f.api(new Request(url,{method:opts.method}));
 }});
 const response=await frontend(new Request(published.url,{headers:{authorization:'Bearer should-not-forward',cookie:'secret-cookie'}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
 const html=await response.text();assert(html.includes('property="og:title" content="&lt;script&gt;private-script&lt;/script&gt; &quot; WOW"'));
 assert(!html.includes('<script>'));assert(!html.includes('PRIVATE-CARD'));assert(html.includes('property="og:url" content="'+published.url+'"'));
 assert(html.includes('dir="rtl"'));assert(html.includes('name="twitter:card" content="summary_large_image"'));
 assert(response.headers.get('content-security-policy').includes("style-src 'sha256-"));
 const image=await frontend(new Request(published.url+'image/'+hash+'.png'));assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 const head=await frontend(new Request(published.url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
 const before=f.calls.filter(call=>call.action==='public.image').length;
 const imageHead=await frontend(new Request(published.url+'image/'+hash+'.png',{method:'HEAD'}));
 assert.equal(imageHead.status,200);assert.equal(await imageHead.text(),'');assert.equal(imageHead.headers.get('content-length'),String(png.length));
 assert.equal(f.calls.filter(call=>call.action==='public.image').length,before,'image HEAD only loads small metadata, never image bytes');
 assert.equal((await frontend(new Request(published.url+'image/'+('0'.repeat(64))+'.png',{method:'HEAD'}))).status,404);
 await f.actions['gallery.share.unpublish']({actor:f.owner,body:{revision:1,commandId:randomUUID()}});
 assert.equal((await frontend(new Request(published.url))).status,404);
 assert.equal((await frontend(new Request(published.url+'image/'+hash+'.png'))).status,404);
 assert.equal((await frontend(new Request(published.url+'image/'+hash+'.png',{method:'HEAD'}))).status,404);
});

test('strict routes and projections cannot become private-image, script, cookie or arbitrary-origin proxies',async(t)=>{
 const f=await fixture(t),published=await f.publish(),missing=randomUUID();
 for(const suffix of [missing+'/metadata',published.publicId+'/image/'+('0'.repeat(64))+'.png',published.publicId+'/image/'+hash+'.svg',published.publicId+'/metadata?path='+f.path,'../files/private',published.publicId+'/metadata/extra']){
  assert.equal((await f.api(new Request(project+'/functions/v1/wow-cloud/public-share/'+suffix))).status,404);
 }
 assert.equal((await f.api(new Request(project+'/functions/v1/wow-cloud/public-share/'+published.publicId+'/metadata',{method:'POST'}))).status,405);
 const response=await f.api(new Request(project+'/functions/v1/wow-cloud/public-share/'+published.publicId+'/metadata'));const metadata=await response.json();
 const invalid=[{...metadata,siteOrigin:'https://attacker.test'}, {...metadata,privateAccount:'should-never-render'},
  {...metadata,publicId:missing},{...metadata,image:{...metadata.image,type:'svg'}},{...metadata,language:'en" onload="alert(1)'}];
 for(const value of invalid){const front=createPublicShareFrontend({apiOrigin:project,siteOrigin:site,fetch:async()=>Response.json(value)});
  assert.equal((await front(new Request(published.url))).status,503);}
 let calls=0;const front=createPublicShareFrontend({apiOrigin:project,siteOrigin:site,fetch:async()=>{calls++;return Response.json(metadata);}});
 for(const url of ['https://attacker.test/share/'+published.publicId+'/',published.url+'?path='+f.path,published.url+'image/'+hash+'.svg'])assert.equal((await front(new Request(url))).status,404);
 assert.equal(calls,0);assert.equal((await front(new Request(published.url,{method:'POST'}))).status,405);
 assert.equal((await createPublicShareFrontend({apiOrigin:'https://internal.test',siteOrigin:site})(new Request(published.url))).status,503);
});

test('provider transfer rejects mismatched bytes and signed-object redirects before publication',async(t)=>{
 const f=await fixture(t);
 for(const overrides of [{fetch:async()=>new Response(Buffer.concat([png,Buffer.from('bad')]),{headers:{'content-type':'image/png'}})},
  {storage:{sign:async()=> 'https://attacker.test/object'}},{fetch:async()=>new Response('<script>bad</script>',{headers:{'content-type':'text/html'}})},
  {fetch:async()=>new Response(png,{headers:{'content-type':'image/png','content-length':'4194305'}})}]){
  const actions=createPublicShareActions({...f.options,...overrides});
  await assert.rejects(()=>actions['gallery.share.publish']({actor:f.owner,body:{revision:0,presentationVersion:1,confirmed:true,language:'en',commandId:randomUUID()}}),{code:'SHARE_UNAVAILABLE'});
 }
 assert.equal((await f.db.query('select count(*)::int n from public.wow_gallery_public_share')).rows[0].n,0);
});

test('public share owner UI requires deliberate consent and does not publish unsaved settings or reissue a lost-response command',async()=>{
 const {doc,body}=localDOM(),requests=[];let owner=true,lost=true,published=false,dirty=false,revision=0;
 const api={getSession:()=>({currentAccount:{role:owner?'owner':'customer'}}),request:async(action,data)=>{
  requests.push({action,data});if(action==='gallery.share.status')return {revision,published,configured:true,title:'WOW',description:'Furniture',hasImage:true,presentationVersion:1,publishedVersion:published?1:null};
  if(action==='gallery.share.publish'){published=true;revision=1;if(lost){lost=false;throw Object.assign(Error('NETWORK'),{code:'NETWORK'});}return {published:true};}
 }};
 const context=vm.createContext({document:doc,crypto:globalThis.crypto,setTimeout,clearTimeout,URL,AbortController,location:{origin:site},fetch:async()=>{throw Error('unused');}});
 vm.runInContext(await readFile(new URL('../modules/gallery/public-share.js',import.meta.url),'utf8'),context);
 const panel=doc.createElement('div');body.append(panel);const mounted=context.WFGalleryPublicShare.mount({container:panel,api,locale:()=> 'en',isDirty:()=>dirty});
 await new Promise(resolve=>setTimeout(resolve,0));
 const find=(tag,text)=>{const walk=n=>[n,...n.children.flatMap(walk)];return walk(panel).find(n=>n.tagName===tag&&(!text||n.textContent===text));};
 assert.equal(find('BUTTON','Publish saved preview').disabled,true);
 let consent=find('INPUT');consent.checked=true;await consent.fire('change');dirty=true;mounted.draftChanged();
 assert.equal(find('BUTTON','Publish saved preview').disabled,true);dirty=false;mounted.draftChanged();
 await find('BUTTON','Publish saved preview').fire('click');
 assert(panel.textContent.includes('The operation failed'));
 await find('BUTTON','Publish saved preview').fire('click');
 const sends=requests.filter(r=>r.action==='gallery.share.publish');assert.equal(sends.length,2);assert.equal(sends[0].data.commandId,sends[1].data.commandId);
 assert(panel.textContent.includes('Preview is published'));
 mounted.dispose();assert.equal(panel.children.length,0);
 owner=false;context.WFGalleryPublicShare.mount({container:panel,api});assert.equal(panel.children.length,0);
});
