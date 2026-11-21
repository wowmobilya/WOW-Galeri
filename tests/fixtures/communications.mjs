import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createProviderTestDatabase} from '../../supabase/testing/provider-fixtures.mjs';
import {createCommunications} from '../../supabase/functions/wow-cloud/modules/communications.mjs';
import {createMailProvider} from '../../supabase/functions/wow-cloud/modules/mail-provider.mjs';

export async function communicationsFixture(options={}){
 const db=await createProviderTestDatabase();
 for(const module of ['files','chat','finance','gallery','operations','notifications','maintenance','customer-auth','communications'])
  await db.exec(await readFile(new URL('../../supabase/modules/'+module+'.sql',import.meta.url),'utf8'));
 const workspace=randomUUID(),foreignWorkspace=randomUUID();
 await db.query("insert into public.wow_workspaces(id,name) values($1,'Mail'),($2,'Other')",[workspace,foreignWorkspace]);
 async function member(w,role,permissions=[]){
  const userId=randomUUID(),sessionId=randomUUID(),email=userId+'@example.test';
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[userId,email]);
  await db.query('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$5,$6,$7)',
   [userId,w,email,'u'+userId.slice(0,12),'Fixture '+role,role,permissions]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sessionId,userId]);
  return {userId,sessionId};
 }
 const owner=await member(workspace,'owner'),staff=await member(workspace,'custom',['communications.view','communications.edit','communications.export','communications.delete','customers.view','orders.view']),
  limited=await member(workspace,'custom',['communications.view']),foreign=await member(foreignWorkspace,'owner'),customer=await member(workspace,'customer',['gallery.view','myorders.view','myorders.edit']);
 const company={id:7,name:'Furniture client <script>',buyerName:'Buyer',email:"o'brien!box=tag@example.test",phone:'+90 (555) 123 45 67'};
 for(const [wid,user] of [[workspace,owner],[foreignWorkspace,foreign]])await db.query("insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by) values($1,'companies','7',$2,1,$3)",[wid,JSON.stringify(company),user.userId]);
 const order=randomUUID();await db.query("insert into public.wow_gallery_orders(id,workspace_id,account_id,number,customer_name,admin_note) values($1,$2,$3,'ORDER-123','Customer','private staff note')",[order,workspace,customer.userId]);
 const moduleRpc=async(name,action,data)=>{
  if(name!=='wow_communications_service')throw Error('Unexpected service');
  return (await db.query('select public.wow_communications_service($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value;
 };
 const workerRpc=async(action,data)=> (await db.query('select public.wow_communications_worker($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value;
 const sends=[],providerIds=new Map();
 const fetcher=options.fetch||(async(url,request)=>{
  if(url!=='https://api.resend.com/emails'||request.method!=='POST')throw Error('Unexpected provider call');
  const key=request.headers['Idempotency-Key'];if(!providerIds.has(key))providerIds.set(key,randomUUID());
  sends.push({url,request,payload:JSON.parse(request.body)});return Response.json({id:providerIds.get(key)});
 });
 const provider=options.provider||createMailProvider({apiKey:'re_fixture_key_only_123456',enabled:true,fetch:fetcher});
 const service=createCommunications({moduleRpc,workerRpc,provider});
 const call=(suffix,data={},actor=owner)=>service.actions['communications.'+suffix]({body:data,actor});
 const draft=async({actor=owner,channel='email',source={kind:'company',id:7},body='Reviewed message',subject='Hello',...rest}={})=>
  (await call('save',{id:randomUUID(),version:0,commandId:randomUUID(),language:'en',channel,source,subject,body,...rest},actor)).message;
 const queue=(message,actor=owner)=>moduleRpc('wow_communications_service','communications.send',{
  userId:actor.userId,sessionId:actor.sessionId,id:message.id,version:message.version,commandId:randomUUID(),providerFrom:provider.from});
 return {db,workspace,foreignWorkspace,owner,staff,limited,foreign,customer,company,order,moduleRpc,workerRpc,provider,service,call,draft,queue,sends,member};
}
