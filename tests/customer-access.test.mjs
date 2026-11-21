import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createHandler,sha256} from '../supabase/functions/wow-cloud/core.mjs';
import {createRestDependencies} from '../supabase/functions/wow-cloud/rest.mjs';
import {createGalleryActions} from '../supabase/functions/wow-cloud/modules/gallery.mjs';
import {createChatActions} from '../supabase/functions/wow-cloud/modules/chat.mjs';
import {createFilesActions} from '../supabase/functions/wow-cloud/modules/files.mjs';
import {localDOM} from './fixtures/module-dom.mjs';

const require=createRequire(import.meta.url),policy=require('../accounts-policy.js');
const cloud=require('../modules/platform/cloud/wow-cloud-client.js');
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const origin='https://customer-fixture.invalid',signPath='/storage/v1/object/sign/wow-files/';
const password='fixture password for this test';
const access=promise=>assert.rejects(promise,{code:'ACCESS_DENIED',status:403});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WZkAAAAASUVORK5CYII=';

// Auth, Storage and the HTTP hop to PostgREST are in-memory provider fixtures.
// Both application endpoints, the browser identity client and all account/room/file SQL run normally.
function application(db,workspaceId){
  const passwords=new Map(),tokens=new Map(),objects=new Map(),signed=[];
  const auth={
    async createUser({email,password}){
      const id=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
      passwords.set(email,{id,password});return {id};
    },
    async signIn(email,password){
      const row=passwords.get(email);if(!row||row.password!==password)throw Error('Invalid credentials');
      const id=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id,row.id]);
      const token='fixture.'+Buffer.from(JSON.stringify({session_id:id})).toString('base64url')+'.fixture';
      tokens.set(token,row.id);return {access_token:token,refresh_token:randomUUID(),expires_in:3600};
    },
    async getUser(token){return {id:tokens.get(token)};},
    async deleteUser(id){await db.query('delete from auth.users where id=$1',[id]);}
  };
  const storage={async put(path,bytes,mime){objects.set(path,{bytes,mime});},async remove(path){objects.delete(path);},
    async sign(path,ttl){assert(objects.has(path));signed.push({path,ttl});return origin+signPath+path+'?ttl='+ttl;}};
  const sql=new Map(['wow_service','wow_gallery_service','wow_chat_service','wow_files_service'].map(name=>[name,'select public.'+name+'($1,$2::jsonb) result']));
  const remote=createRestDependencies({url:origin,serviceKey:'fixture',fetch:async(url,options)=>{
    const query=sql.get(new URL(url).pathname.split('/').at(-1));assert(query);
    const {p_action,p_data}=JSON.parse(options.body);
    try{return Response.json((await db.query(query,[p_action,JSON.stringify(p_data)])).rows[0].result);}
    catch(error){if(error.code!=='P0001')throw error;return Response.json({code:error.code,message:error.message},{status:400});}
  }});
  const deps={...remote,auth,storage,policy};
  const handler=createHandler({...deps,moduleActions:{...createGalleryActions(deps),...createChatActions(deps),...createFilesActions(deps)}});
  const client=()=>cloud.create({mode:'remote',config:{enabled:true,projectUrl:origin,workspaceId,endpoint:origin+'/functions/v1/wow-cloud',publishableKey:'fixture'},
    sessionStore:{clear(){}},fetch:(url,options)=>handler(new Request(url,options))});
  const fetchBlob=async url=>{
    const object=objects.get(new URL(url).pathname.slice(signPath.length));assert(object);
    return new Response(object.bytes,{headers:{'Content-Type':object.mime}});
  };
  return {client,fetchBlob,signed};
}

function descendants(element){return [element,...element.children.flatMap(descendants)];}
async function filesPage(client,fetchBlob){
  const {doc,body}=localDOM(),container=doc.createElement('div'),calls=[],saved=[],errors=[];
  body.append(container);
  const win={document:doc,navigator:{onLine:true},WOW_CLOUD_CONFIG:{projectUrl:origin},fetch:fetchBlob};
  const sandbox=vm.createContext({globalThis:win,URL,Blob,TextEncoder,AbortController,Intl,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout});
  for(const file of ['core','workspace'])vm.runInContext(await read('modules/files/'+file+'.js'),sandbox);
  // Capture the browser save handoff without writing any local downloads.
  win.WFFileCore.save=(blob,name)=>saved.push({blob,name});
  const api={can:key=>policy.can(client.getSnapshot().currentAccount,key),request:(action,data)=>{
    calls.push({action,data});return client.request(action,data);
  },notify:(message,type)=>{if(type==='error')errors.push(message);}};
  const handle=win.WFFiles.mount({container,api,lang:'en'});
  const tree=()=>descendants(container),button=label=>tree().find(e=>e.tagName==='BUTTON'&&e.textContent===label);
  for(let i=0;i<200&&!button('Select page');i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(button('Select page'),'the file listing loaded');
  return {handle,calls,saved,tree,button,errors,container};
}

test('owner-provisioned customers sign in with restricted galleries, conversations and private files',async t=>{
  const db=await createProviderTestDatabase();t.after(()=>db.close());
  for(const module of ['gallery','files','chat'])await db.exec(await read('supabase/modules/'+module+'.sql'));
  const wid=randomUUID(),setupToken=randomUUID(),{client,fetchBlob,signed}=application(db,wid);
  await db.query('insert into public.wow_workspaces(id,name) values($1,$2)',[wid,'Gallery']);
  await db.query("insert into public.wow_setup_claims(token_hash,workspace_id,expires_at) values($1,$2,now()+interval '1 hour')",[await sha256(setupToken),wid]);
  const owner=client();await owner.enrollOwner({name:'Owner',username:'owner',password,setupToken});
  const staff=client(),colleague=client(),buyer=client(),defaults=policy.presets('customer');
  const provision=async(target,username,role,permissions)=>{
    await owner.createAccount({name:username,username,password,role,permissions});await target.signIn({username,password});
    return target.getSnapshot().userId;
  };
  const ownerId=owner.getSnapshot().userId;
  const staffId=await provision(staff,'team-member','custom',['chat.view','chat.edit']);
  const colleagueId=await provision(colleague,'colleague','custom',['chat.view','chat.edit']);

  await t.test('existing accounts survive repeatable replacement of the legacy role constraint',async()=>{
    await db.exec("alter table public.wow_accounts drop constraint wow_accounts_supported_role, add constraint wow_accounts_role_check check (role in ('owner','manager','sales','carpentry','assembly','warehouse','custom'))");
    const schema=await read('supabase/wow-schema.sql');
    const upgrade=schema.slice(schema.indexOf('create table if not exists public.wow_accounts ('),schema.indexOf('create index if not exists wow_accounts_workspace_status_idx'));
    await db.exec(upgrade);await db.exec(upgrade);
    assert.equal((await db.query('select count(*)::int n from public.wow_accounts')).rows[0].n,3);
    await assert.rejects(db.query("update public.wow_accounts set role='unsupported' where id=$1",[staffId]),/wow_accounts_supported_role/);
  });
  const buyerId=await provision(buyer,'purchaser','customer');
  await t.test('the real account command normalizes customer grants and PostgreSQL rejects persisted staff grants',async()=>{
    assert.deepEqual(buyer.getSnapshot().currentAccount.permissions,defaults);
    assert.deepEqual(buyer.getSnapshot().accounts.map(account=>account.id),[buyerId]);
    const staffOnly=['orders.view','gallery.edit','finance.view','payroll.view','reports.view','server.view'];
    await owner.updateAccount(buyerId,{permissions:[...defaults,...staffOnly]});
    const stored=(await db.query('select role,permissions from public.wow_accounts where id=$1',[buyerId])).rows[0];
    assert.deepEqual(stored,{role:'customer',permissions:defaults});
    for(const key of staffOnly)await assert.rejects(db.query('update public.wow_accounts set permissions=array_append(permissions,$1::text) where id=$2',[key,buyerId]),/INVALID_PERMISSIONS/);
    await access(buyer.createAccount({name:'Somebody',username:'somebody',role:'owner',password}));
  });
  await t.test('current customers see only owner direct rooms, including after reassignment from the internal team',async()=>{
    for(const member of [owner,staff,colleague,buyer])await member.request('chat.init');
    const ownerRooms=(await owner.request('chat.rooms')).rooms;
    const team=ownerRooms.find(room=>room.kind==='team').id;
    const internal=(await owner.request('chat.send',{roomId:team,requestId:randomUUID(),text:'Staff schedule'})).id;
    const staffDirect=(await staff.request('chat.direct',{targetId:colleagueId})).roomId;
    const group=(await owner.request('chat.group',{name:'Workshop',members:[staffId,colleagueId]})).roomId;
    const readPeople=async actor=>(await actor.request('chat.people')).people.map(p=>p.id).sort();
    assert.deepEqual(await readPeople(buyer),[ownerId,buyerId].sort());assert(!(await readPeople(staff)).includes(buyerId));
    const rooms=(await buyer.request('chat.rooms')).rooms;
    assert.equal(rooms.length,1);assert.equal(rooms[0].peer.id,ownerId);assert.equal(rooms[0].kind,'direct');
    const ownMessage=await buyer.request('chat.send',{roomId:rooms[0].id,requestId:randomUUID(),text:'Can I collect my order?'});
    assert((await owner.request('chat.feed',{roomId:rooms[0].id})).messages.some(m=>m.id===ownMessage.id));
    await access(buyer.request('chat.direct',{targetId:staffId}));
    await access(buyer.request('chat.group',{name:'Group',members:[ownerId]}));
    await access(owner.request('chat.group',{name:'Workshop',members:[buyerId]}));
    await access(owner.request('chat.member',{roomId:team,targetId:buyerId,operation:'add'}));
    for(const roomId of [team,group,staffDirect])await access(buyer.request('chat.feed',{roomId}));
    await owner.updateAccount(staffId,{role:'customer'});
    await assert.rejects(staff.request('chat.rooms'),{code:'SESSION_REVOKED'});
    await staff.signIn({username:'team-member',password});await staff.request('chat.init');
    const after=(await staff.request('chat.rooms')).rooms;assert.equal(after.length,1);assert.equal(after[0].peer.id,ownerId);
    assert.deepEqual(await readPeople(staff),[ownerId,staffId].sort());
    for(const roomId of [team,group,staffDirect])await access(staff.request('chat.feed',{roomId}));
    await access(staff.request('chat.forward',{roomId:after[0].id,sourceRoomId:team,messageId:internal,requestId:randomUUID()}));
    assert.equal((await db.query('select public.wow_chat_push_allowed($1,$2,$3,$4) permitted',[wid,staffId,team,internal])).rows[0].permitted,false);
  });
  await t.test('the catalog accepts a purchaser order and only returns their personal orders',async()=>{
    await db.query(`insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by)
      values($1,'products','7','{"id":7,"name":"Console","priceA":12.35}',1,$2)`,[wid,ownerId]);
    await owner.request('gallery.stock',{commandId:randomUUID(),rows:[{productId:7,version:0,published:true,stock:7}]});
    const catalog=await buyer.request('gallery.snapshot');assert.equal(catalog.items[0].name,'Console');
    const order={accepted:true,items:[{productId:7,quantity:1,priceMinor:1235,currency:'USD'}]};
    const mine=await buyer.request('gallery.order.place',{...order,commandId:randomUUID()});
    await owner.request('gallery.order.place',{...order,commandId:randomUUID()});
    const ownOrders=await buyer.request('gallery.orders',{scope:'own'});
    assert.deepEqual(ownOrders.items.map(item=>item.id),[mine.orderId]);assert(!('adminNote' in ownOrders.items[0]));
    assert.equal((await owner.request('gallery.orders',{scope:'staff'})).items.length,2);
    await access(buyer.request('gallery.orders',{scope:'staff'}));await access(buyer.request('gallery.snapshot',{manage:true}));
  });
  await t.test('personal preview stays available and explicit downloads, ZIP, and five-minute shares require export',async()=>{
    const picture={requestId:randomUUID(),name:'chair.png',mime:'image/png',data:png};
    const {file:own}=await buyer.request('files.upload',picture);
    const {file:doc}=await buyer.request('files.upload',{requestId:randomUUID(),name:'note.txt',mime:'text/plain',data:btoa('Private note')});
    const {file:other}=await owner.request('files.upload',picture);
    assert.equal((await buyer.request('files.list')).count,2);
    const preview=await buyer.request('files.open',{fileId:own.id});assert.equal(new URL(preview.url).searchParams.has('download'),false);
    const before=signed.length;
    await access(buyer.request('files.open',{fileId:own.id,download:true}));
    await access(buyer.request('files.open',{fileId:doc.id}));
    await access(buyer.request('files.share',{fileId:own.id}));await access(buyer.request('files.open',{fileId:other.id}));
    assert.equal(signed.length,before);
    const viewer=await filesPage(buyer,fetchBlob);
    try{
      await viewer.button('Select page').fire('click');
      for(const label of ['Share','Download','ZIP · Download'])assert(!viewer.button(label));
      const open=viewer.tree().find(e=>e.className==='wf-file-open'&&e.textContent.includes(own.name));
      await open.fire('click');assert(viewer.tree().some(e=>e.tagName==='IMG'&&e.src?.startsWith('blob:')));
      assert(viewer.calls.some(c=>c.action==='files.open'&&c.data.download===false));assert(!viewer.button('Download'));assert(!viewer.button('Share'));
      assert.deepEqual(viewer.errors,[]);
    }finally{viewer.handle.dispose();}
    await owner.updateAccount(buyerId,{permissions:[...defaults,'files.export']});await buyer.signIn({username:'purchaser',password});
    const exporter=await filesPage(buyer,fetchBlob);
    try{
      const open=exporter.tree().find(e=>e.className==='wf-file-open'&&e.textContent.includes(own.name));
      await open.fire('click');await exporter.button('Download').fire('click');assert.equal(exporter.saved[0].name,own.name);
      await exporter.button('Share').fire('click');
      const link=new URL(exporter.tree().find(e=>e.tagName==='TEXTAREA').value);
      assert.equal(link.searchParams.get('ttl'),'300');assert.equal(link.searchParams.get('download'),own.name);
      for(const dialog of exporter.container.querySelectorAll('dialog[open]'))dialog.close();
      await exporter.button('Select page').fire('click');await exporter.button('ZIP · Download').fire('click');
      const archive=exporter.saved.at(-1);assert.equal(archive.blob.type,'application/zip');
      assert.equal(exporter.calls.filter(c=>c.action==='files.open'&&c.data.download).length,3);
      assert.equal((await buyer.request('files.list')).files.find(row=>row.id===own.id).downloads,2);
      await access(buyer.request('files.share',{fileId:other.id}));assert.deepEqual(exporter.errors,[]);
    }finally{exporter.handle.dispose();}
  });
});
