import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createAssistantActions} from '../supabase/functions/wow-cloud/modules/assistant.mjs';
import {createAssistantProvider} from '../supabase/functions/wow-cloud/modules/assistant-provider.mjs';
import {createChatActions} from '../supabase/functions/wow-cloud/modules/chat.mjs';

test('a monthly assistant report aggregates every cash group before UI pagination and preserves currency and workspace boundaries',async(t)=>{
  const db=await createProviderTestDatabase();t.after(()=>db.close());
  for(const name of ['finance','chat','assistant'])await db.exec(await readFile(new URL('../supabase/modules/'+name+'.sql',import.meta.url),'utf8'));
  const w=randomUUID(),other=randomUUID(),userId=randomUUID(),sessionId=randomUUID();
  await db.query('insert into public.wow_workspaces(id,name) values($1,$2),($3,$4)',[w,'Monthly report',other,'Other']);
  await db.query('insert into auth.users(id) values($1)',[userId]);
  await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,'report@example.test','report','Report','owner','{}')",[userId,w]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sessionId,userId]);
  async function cash(workspace,id,day,type,currency,units){
    const record='cashbox-entry/'+id;
    await db.query("insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by) values($1,'settings',$2::jsonb,$3::jsonb,1,$4)",
      [workspace,JSON.stringify(record),JSON.stringify({id:record,date:day,type,legs:[{currency,units}]}),userId]);
  }
  for(let n=0;n<52;n++)await cash(w,'group-'+n,'2026-11-15','group-'+n,'USD','100');
  await cash(w,'eur','2026-11-30','expense','EUR','-200');
  await cash(w,'past','2026-10-31','past','USD','90000');
  await cash(w,'future','2026-12-01','future','USD','90000');
  await cash(other,'elsewhere','2026-11-15','other','USD','90000');
  const ctx={workspaceId:w,account:{role:'owner',permissions:[]}};
  const page=await db.query("select * from wow_fin.query_rows($1,$2::jsonb,'finance',$3::jsonb)",
    [w,JSON.stringify(ctx),JSON.stringify({tab:'reports',from:'2026-11-01',to:'2026-11-30'})]);
  assert.equal(page.rows.length,51,'the fixture exceeds the ordinary UI page and look-ahead row');
  const actions=createAssistantActions({moduleRpc:async(fn,action,data)=>(await db.query('select public.'+fn+'($1,$2::jsonb) v',[action,JSON.stringify(data)])).rows[0].v,
    provider:createAssistantProvider()});
  const report=await actions['assistant.inspect']({actor:{userId,sessionId},body:{mode:'report',month:'2026-11'}});
  assert.equal(report.more,false);assert.equal(report.rows.length,2);
  const usd=report.rows.find(row=>row.currency==='USD'),eur=report.rows.find(row=>row.currency==='EUR');
  assert.equal(Number(usd.inflow),52);assert.equal(Number(usd.outflow),0);assert.equal(Number(usd.net),52);assert.equal(usd.entries,'52');
  assert.equal(Number(eur.inflow),0);assert.equal(Number(eur.outflow),2);assert.equal(Number(eur.net),-2);assert.equal(eur.entries,'1');
});

test('PostgreSQL scopes evidence, computes exact reports and enforces metering, receipts, revocation and visibility',async(t)=>{
  const db=await createProviderTestDatabase();
  t.after(()=>db.close());
  const read=name=>readFile(new URL('../supabase/modules/'+name+'.sql',import.meta.url),'utf8');
  for(const name of ['finance','chat','assistant','assistant'])await db.exec(await read(name));
  const moduleRpc=async(fn,action,b)=>(await db.query('select public.'+fn+'($1,$2::jsonb) v',[action,JSON.stringify(b)])).rows[0].v;
  const w=randomUUID(),other=randomUUID();
  await db.query('insert into public.wow_workspaces(id,name) values($1,$2),($3,$4)',[w,'WOW',other,'Other']);
  let onGenerate=async()=>{},calls=0,lastInput;
  const receiptKey=Buffer.alloc(32,0xab);
  const provider=createAssistantProvider({apiKey:'test-fixture-fake-credential',model:'fixture-model',receiptKey:receiptKey.toString('hex'),
    async fetch(url,options){
      calls++;
      const envelope=JSON.parse(options.body);lastInput=JSON.parse(envelope.input[0].content[0].text);
      await onGenerate();
      const ref=lastInput.evidence[0].ref;
      const notes=lastInput.task==='chat'?[{refs:[ref],summary:'The speaker asks about a delivery.'}]:[{ref}];
      return Response.json({status:'completed',usage:{input_tokens:31,output_tokens:9},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({notes})}]}]});
    }
  });
  const actions={...createChatActions({moduleRpc,storage:{}}),...createAssistantActions({moduleRpc,provider})};
  async function account(name,workspace=w,permissions=['assistant.view'],role='custom'){
    const userId=randomUUID(),sessionId=randomUUID();
    await db.query('insert into auth.users(id) values($1)',[userId]);
    await db.query('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$4,$5,$6)',[userId,workspace,name+'@invalid.test',name,role,permissions]);
    await db.query('insert into auth.sessions(id,user_id) values ($1,$2)',[sessionId,userId]);
    await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sessionId,userId]);
    return {userId,sessionId,call:(action,body={})=>actions[action]({actor:{userId,sessionId},body})};
  }
  const owner=await account('owner',w,[],'owner'),outsider=await account('other',other,[],'owner');
  const viewer=await account('viewer',w,['assistant.view','products.view','chat.view']),basic=await account('basic');
  const none=await account('none',w,['products.view']);
  const store=async(workspace,writer,store,payload)=>db.query('insert into public.wow_records(workspace_id,updated_by,store,record_id,payload,revision) values($1,$2,$3,$4::jsonb,$5::jsonb,1)',[workspace,writer.userId,store,JSON.stringify(payload.id),JSON.stringify(payload)]);
  await store(w,owner,'products',{id:7,name:'Showroom oak',type:'Table',barcode:'X72',costing:{supplier:'secret-price-912'},password:'test-pass'});
  await store(w,owner,'products',{id:'p2',name:'Oak companion',type:'Chair',barcode:'X72'});
  await store(w,owner,'products',{id:'nested',name:{secret:'nestedprivate'},privateNote:'secret-price-912'});
  await store(w,owner,'products',{id:'arch',name:'Tombstone',isDeleted:true});
  await store(w,owner,'companies',{id:'VIP',name:'Private client',iban:'secret-price-912',buyerBank:'Private bank'});
  await store(w,owner,'invoices',{id:'i',invNo:'I-11',companyName:'Private client',notes:'secret-price-912'});
  await store(other,outsider,'products',{id:1,name:'Elsewhere oak'});
  await store(w,owner,'settings',{id:'cashbox-entry/test',date:'2026-11-20',type:'test',legs:[
    {currency:'USD',units:'999999999999999'},{currency:'USD',units:'-1'},{currency:'EUR',units:'-42'}],note:'secret-price-912'});
  const reject=(promise,code)=>assert.rejects(promise,e=>e.message===code);
  const search={mode:'search',source:'all',query:'oak'};
  await reject(none.call('assistant.status'),'ACCESS_DENIED');
  const noRights=await basic.call('assistant.status');assert(Object.values(noRights.sources).every(v=>v===false));
  await reject(basic.call('assistant.inspect',search),'ACCESS_DENIED');
  await reject(viewer.call('assistant.inspect',{...search,source:'customers',userId:owner.userId}),'ACCESS_DENIED');
  const visible=await viewer.call('assistant.inspect',{...search,userId:owner.userId,workspaceId:other});
  assert.deepEqual(visible.rows.map(r=>r.title),['Oak companion','Showroom oak']);
  for(const query of ['secret-price-912','nestedprivate','Private client','Elsewhere','Tombstone','%_']){
    assert.deepEqual((await viewer.call('assistant.inspect',{...search,query})).rows,[]);
  }
  assert.equal((await owner.call('assistant.inspect',{...search,query:'secret-price-912'})).rows.length,0);
  const checks=await viewer.call('assistant.inspect',{mode:'checks',source:'products'});
  assert.equal(checks.rows.filter(r=>r.finding==='duplicateBarcode').length,2);
  assert(checks.rows.some(r=>r.finding==='missingName'&&r.record==='nested'));
  assert.equal((await outsider.call('assistant.inspect',search)).rows.length,1);
  const report={mode:'report',month:'2026-11'};
  await reject(viewer.call('assistant.inspect',report),'ACCESS_DENIED');
  const reported=await owner.call('assistant.inspect',report),usd=reported.rows.find(r=>r.currency==='USD'),eur=reported.rows.find(r=>r.currency==='EUR');
  assert.match(usd.net,/^9999999999999\.980*$/);assert.equal(usd.finding,'netIn');
  assert.match(eur.net,/^-0\.420*$/);assert.equal(eur.finding,'netOut');
  assert.equal((await owner.call('assistant.inspect',{...report,month:'2026-10'})).rows.length,0);
  const generate=(spec,preview,extra={})=>({...spec,fingerprint:preview.fingerprint,refs:[preview.rows[0].ref],lang:'ar',focus:'',requestId:randomUUID(),...extra});
  const req=generate(search,visible);
  let first=await viewer.call('assistant.generate',req);assert.equal(first.cached,false);assert.deepEqual(first.answer.notes,[{ref:'E1'}]);assert.equal(calls,1);
  assert((await viewer.call('assistant.generate',req)).cached);assert.equal(calls,1);
  await reject(viewer.call('assistant.generate',{...req,focus:'different'}),'IDEMPOTENCY_MISMATCH');
  await reject(viewer.call('assistant.generate',{...req,requestId:randomUUID(),refs:['E12']}),'INVALID_ASSISTANT_INPUT');assert.equal(calls,1);
  const status=await viewer.call('assistant.status');assert.equal(status.usedToday,1);assert(status.provider.lastSuccessAt);
  let ledger=(await db.query('select row_to_json(r)::text text from wow_assist.requests r')).rows;
  assert.equal(ledger.length,1);assert.doesNotMatch(ledger[0].text,/oak|secret-price|Showroom|Private client|"notes"/i);
  const {rows:[receipt]}=await db.query(`select a.sealed,r.request_hash from wow_assist.answers a
    join wow_assist.requests r using(workspace,actor,request_id)
    where a.workspace=$1 and a.actor=$2 and a.request_id=$3`,[w,viewer.userId,req.requestId]);
  assert.match(receipt.sealed,/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/);
  const [iv,encrypted]=receipt.sealed.split('.').map(part=>Buffer.from(part,'base64'));
  const plaintext=Buffer.from(JSON.stringify(first.answer));
  assert.equal(iv.length,12);
  assert.equal(encrypted.length,plaintext.length+16);
  function decryptReceipt(key,actor){
    const binding=JSON.stringify([1,actor.userId,actor.sessionId,req.requestId,receipt.request_hash,req.fingerprint]);
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(Buffer.from(binding));
    decipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);
  }
  assert.deepEqual(decryptReceipt(receiptKey,viewer),plaintext);
  assert.throws(()=>decryptReceipt(Buffer.alloc(32,0xcd),viewer));
  assert.throws(()=>decryptReceipt(receiptKey,outsider));
  assert.deepEqual(lastInput.evidence.map(e=>e.ref),['E1']);assert(!JSON.stringify(lastInput).includes('recordType')&&!JSON.stringify(lastInput).includes('p2'));
  await db.query("update public.wow_records set payload=jsonb_set(payload,'{name}','\"Changed oak\"') where workspace_id=$1 and store='products' and record_id='7'",[w]);
  await reject(viewer.call('assistant.generate',req),'AI_EVIDENCE_CHANGED');assert.equal(calls,1);
  const noProvider=createAssistantActions({moduleRpc,provider:createAssistantProvider()});
  await reject(noProvider['assistant.generate']({actor:basic,body:{}}),'AI_NOT_CONFIGURED');
  await reject(noProvider['assistant.generate']({actor:none,body:{}}),'ACCESS_DENIED');
  const chatActor=await account('chatreader',w,['assistant.view','chat.view']);
  const {roomId}=await owner.call('chat.group',{name:'Delivery room',members:[chatActor.userId]});
  const msg=await owner.call('chat.send',{roomId,requestId:randomUUID(),text:'Where is the delivery? sk-secretfixturekey123456'});
  await owner.call('chat.draft',{roomId,text:'Private draft only'});
  const chat={mode:'chat',roomId};
  assert.deepEqual((await chatActor.call('assistant.rooms')).rooms.map(r=>Object.keys(r).sort()),[['id','kind','name']]);
  await reject(viewer.call('assistant.inspect',chat),'ACCESS_DENIED');
  await reject(outsider.call('assistant.inspect',{...chat,sessionId:owner.sessionId}),'ACCESS_DENIED');
  const messages=await chatActor.call('assistant.inspect',chat),chatReq=generate(chat,messages);
  assert.match(messages.rows[0].text,/\[redacted\]/);
  assert(!JSON.stringify(messages).includes('Private draft'));
  onGenerate=async()=>{await chatActor.call('chat.hide',{roomId,messageId:msg.id});};
  await reject(chatActor.call('assistant.generate',chatReq),'AI_EVIDENCE_CHANGED');
  assert.deepEqual(Object.keys(lastInput.evidence[0]).sort(),['excerpt','ref']);
  assert(!JSON.stringify(lastInput).includes(owner.userId));
  assert.equal((await chatActor.call('assistant.inspect',chat)).rows.length,0);
  const second=await owner.call('chat.send',{roomId,requestId:randomUUID(),text:'Can it ship today?'});
  const secondReq=generate(chat,await chatActor.call('assistant.inspect',chat));
  onGenerate=async()=>{await owner.call('chat.member',{roomId,targetId:chatActor.userId,operation:'ban'});};
  await reject(chatActor.call('assistant.generate',secondReq),'ACCESS_DENIED');
  assert.equal((await chatActor.call('assistant.rooms')).rooms.length,0);
  assert.equal(second.id!==msg.id,true);
  onGenerate=async()=>{await db.query("update public.wow_sessions set closed_at=now() where session_id=$1",[viewer.sessionId]);};
  const fresh=await viewer.call('assistant.inspect',search);
  await reject(viewer.call('assistant.generate',generate(search,fresh)),'SESSION_REVOKED');
  assert.equal((await db.query("select count(*)::int n from wow_assist.requests where actor=$1 and state='done'",[viewer.userId])).rows[0].n,2);
  onGenerate=async()=>{};
  const ownerReq=generate(report,reported);let unblock,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  onGenerate=()=>{entered();return new Promise(resolve=>{unblock=resolve;});};
  const inFlight=owner.call('assistant.generate',ownerReq);await started;
  await reject(owner.call('assistant.generate',ownerReq),'AI_IN_PROGRESS');
  await reject(owner.call('assistant.generate',{...ownerReq,requestId:randomUUID()}),'AI_BUSY');
  unblock();await inFlight;onGenerate=async()=>{};
  await db.query("update wow_assist.answers set expires_at=now()-interval '1 second' where request_id=$1",[ownerReq.requestId]);
  const count=calls;await reject(owner.call('assistant.generate',ownerReq),'AI_RECEIPT_EXPIRED');assert.equal(calls,count);
  await db.exec('select wow_assist.prune()');assert.equal((await db.query('select count(*)::int n from wow_assist.answers where request_id=$1',[ownerReq.requestId])).rows[0].n,0);
  // Real reservations from all concurrent callers count against the same hard workspace and per-account ceilings.
  onGenerate=async()=>{throw Error('upstream text and key must not escape');};
  for(let n=0;n<3;n++){await reject(owner.call('assistant.generate',{...ownerReq,requestId:randomUUID()}),'AI_PROVIDER_UNAVAILABLE');}
  await reject(owner.call('assistant.generate',{...ownerReq,requestId:randomUUID()}),'AI_CIRCUIT_OPEN');
  await db.query("update wow_assist.requests set finished_at=now()-interval '6 minutes' where state='failed'");
  onGenerate=async()=>{};
  let remaining=12-(await owner.call('assistant.status')).usedToday;
  for(let n=0;n<remaining;n++)await owner.call('assistant.generate',{...ownerReq,requestId:randomUUID()});
  await reject(owner.call('assistant.generate',{...ownerReq,requestId:randomUUID()}),'AI_DAILY_LIMIT');
  const otherPreview=await outsider.call('assistant.inspect',search);
  const timedRequest=generate(search,otherPreview);
  let timedCalls=0;
  const timedActions=createAssistantActions({moduleRpc,provider:createAssistantProvider({apiKey:'fixture-check-timeout',model:'fixture-model',receiptKey:'ab'.repeat(32),timeoutMs:5,
    fetch:(_url,{signal})=>new Promise((_resolve,rejectPromise)=>{timedCalls++;signal.addEventListener('abort',()=>rejectPromise(Error('cancelled')),{once:true});})
  })});
  const timed=()=>timedActions['assistant.generate']({actor:outsider,body:timedRequest});
  await reject(timed(),'AI_PROVIDER_TIMEOUT');await reject(timed(),'AI_PROVIDER_TIMEOUT');assert.equal(timedCalls,1);
  const {rows:timedMeta}=await db.query('select error_code,input_tokens from wow_assist.requests where request_id=$1',[timedRequest.requestId]);
  assert.deepEqual(timedMeta,[{error_code:'AI_PROVIDER_TIMEOUT',input_tokens:null}]);

  // Four sessions on the same workspace cannot race through the three-slot limit.
  const members=[outsider];
  for(const name of ['membera','memberb','memberc'])members.push(await account(name,other,['assistant.view','products.view']));
  const releases=[];onGenerate=()=>new Promise(release=>{releases.push(release);});
  const running=members.slice(0,3).map(m=>m.call('assistant.generate',generate(search,otherPreview)));
  for(let n=0;n<200&&releases.length<3;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(releases.length,3);
  await reject(members[3].call('assistant.generate',generate(search,otherPreview)),'AI_BUSY');
  for(const release of releases)release();await Promise.all(running);onGenerate=async()=>{};
  // Populate historical metadata to exercise the tenant-wide day boundary independently of the caller's quota.
  const used=(await db.query('select count(*)::int n from wow_assist.requests where workspace=$1',[other])).rows[0].n;
  await db.query(`insert into wow_assist.requests(workspace,actor,request_id,session_id,epoch,request_hash,evidence_hash,mode,model,state)
    select $1,$2,gen_random_uuid(),$3,1,repeat('a',64),repeat('a',64),'checks','fixture-model','done' from generate_series(1,$4::integer)`,
    [other,outsider.userId,outsider.sessionId,60-used]);
  await reject(members[3].call('assistant.generate',generate(search,otherPreview)),'AI_DAILY_LIMIT');
  await db.query(`update wow_assist.requests set started_at=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '1 second'
    where workspace=$1 and model='fixture-model' and mode='checks'`,[other]);
  assert.equal((await members[3].call('assistant.generate',generate(search,otherPreview))).cached,false);
  assert.deepEqual((await db.query("select relname from pg_class where relnamespace='wow_assist'::regnamespace and relkind='r' and not relrowsecurity")).rows,[]);
  const perms=await db.query("select has_function_privilege('authenticated','public.wow_assistant_service(text,jsonb)','execute') a,has_function_privilege('anon','public.wow_assistant_service(text,jsonb)','execute') b,has_table_privilege('authenticated','wow_assist.answers','select') c,has_schema_privilege('anon','wow_assist','usage') d,has_function_privilege('service_role','public.wow_assistant_service(text,jsonb)','execute') e");
  assert.deepEqual(perms.rows[0],{a:false,b:false,c:false,d:false,e:true});
});
