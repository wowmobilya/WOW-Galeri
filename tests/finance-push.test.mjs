import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createFinanceActions} from '../supabase/functions/wow-cloud/modules/finance.mjs';
import {formatPushPayload} from '../supabase/functions/wow-cloud/push-events.mjs';

test('native posted cash queues a single financial alert per owner device and revalidates it before delivery',async()=>{
  const db=await createProviderTestDatabase();
  try{
    for(const name of ['finance','files','chat','gallery','operations','notifications']){
      await db.exec(await readFile(new URL('../supabase/modules/'+name+'.sql',import.meta.url),'utf8'));
    }
    const w=randomUUID(),otherW=randomUUID();
    await db.query("insert into public.wow_workspaces(id,name) values($1,'Cash'),($2,'Unrelated')",[w,otherW]);
    async function rpc(name,action,body){
      return (await db.query('select public.'+name+'($1,$2::jsonb) as r',[action,JSON.stringify(body)])).rows[0].r;
    }
    async function member(workspace,role,permissions){
      const userId=randomUUID(),sessionId=randomUUID();
      await db.query('insert into auth.users(id) values($1)',[userId]);
      await db.query('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$5,$6,$7)',
        [userId,workspace,userId+'@wow.invalid','u'+userId.slice(0,9),'Fixture '+role,role,permissions]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
      await rpc('wow_service','session.open',{userId,sessionId});
      return {userId,sessionId};
    }
    const owner=await member(w,'owner',[]),worker=await member(w,'custom',['finance.view','finance.edit','chat.view']),foreign=await member(otherW,'owner',[]);
    // Nonfunctional fixture keys. The provider adapter records pg_net calls in memory.
    await db.query('select public.wow_push_configure($1::jsonb)',[JSON.stringify({projectUrl:'https://abcdefghijklmnopqrst.supabase.co',
      publicKey:'A'.repeat(87),privateKey:'B'.repeat(43),workerToken:'C'.repeat(64)})]);
    for(const actor of [owner,worker,foreign]){
      const endpoint='https://fcm.googleapis.com/fcm/send/test-'+actor.userId;
      await rpc('wow_service','push.subscribe',{...actor,deviceId:'device-'+actor.userId,
        subscription:{endpoint,keys:{p256dh:'A'.repeat(87),auth:'C'.repeat(22)}},
        endpointHash:createHash('sha256').update(endpoint).digest('hex'),language:'en'});
    }
    assert.equal((await db.query('select count(*)::int as n from public.wow_push_active_devices')).rows[0].n,3);
    const actions=createFinanceActions({moduleRpc:rpc});
    const post=(action,body,actor=owner)=>actions[action]({body,actor});
    const commands=async()=> (await db.query('select record_id,kind,action,details from public.wow_push_events where workspace_id=$1 order by created_at,id',[w])).rows;
    const receiptId=randomUUID(),expenseId=randomUUID(),date='2025-06-04';
    const receipt={kind:'income',commandId:receiptId,box:'main:USD',currency:'USD',amount:'100.00',day:date,description:'Till receipt',origin:'restore'};
    await post('finance.transaction',receipt,worker);
    await post('finance.transaction',receipt,worker);
    let events=await commands();
    assert.equal(events.length,1);
    assert.equal(events[0].kind,'receipt');
    assert.equal(events[0].details.amount,100);
    assert.equal((await db.query("select payload->>'type' as type from public.wow_records where record_id=to_jsonb($1::text)",['cashbox-entry/finance/'+receiptId])).rows[0].type,'receipt');

    const expense={...receipt,kind:'expense',commandId:expenseId,amount:'90.00',description:'Materials',reference:'EX-1'};
    await post('finance.transaction',expense,worker);
    await post('finance.transaction',expense,worker);
    await assert.rejects(()=>post('finance.transaction',{...expense,commandId:randomUUID(),amount:'11.00'},worker),/INVALID_INSUFFICIENT_BALANCE/);
    // The replacement can pass its own positive posting and enqueue before the final balance check.
    // Both writes and its event must disappear when that final check rejects the correction.
    await assert.rejects(()=>post('finance.transaction',{...receipt,commandId:randomUUID(),amount:'5',replaces:receiptId},worker),/INVALID_INSUFFICIENT_BALANCE/);
    assert.equal((await commands()).length,2);
    const revised={...expense,commandId:randomUUID(),amount:'80.00',replaces:expenseId};
    await post('finance.transaction',revised,worker);
    const revision=(await commands()).find(e=>e.record_id.endsWith(revised.commandId));
    assert.deepEqual([revision.action,revision.details.amount,revision.details.previousAmount],['updated',80,90]);
    assert.equal((await commands()).length,3);

    const fx=randomUUID(),transfer=randomUUID();
    await post('finance.quote.manual',{commandId:fx,base:'USD',counter:'EUR',rate:'0.9005',at:date+'T00:00:00Z',source:'test desk'},worker);
    await post('finance.transfer',{commandId:transfer,fromBox:'main:USD',toBox:'main:EUR',amount:'10.00',quote:fx,day:date},worker);
    const moved=(await commands()).find(e=>e.record_id.endsWith(transfer));
    assert.deepEqual([moved.kind,moved.details.movement,moved.details.currency,moved.details.amount,moved.details.receivedCurrency,moved.details.receivedAmount],
      ['expense','transfer','USD',10,'EUR',9.01]);

    const beforeHistory=(await commands()).length,boxId=randomUUID();
    await post('finance.resource',{id:boxId,kind:'box',commandId:randomUUID(),version:0,profile:{name:'Cutover',currency:'USD',active:true},opening:'500',day:date});
    const historical={...receipt,commandId:randomUUID(),description:'Restored evidence'};
    const restore={scope:'finance',workspace:w,commands:[{action:'finance.transaction',data:historical}]};
    await post('finance.restore',{...restore,commandId:randomUUID(),preview:true});
    await post('finance.restore',{...restore,commandId:randomUUID(),preview:false});
    await post('finance.transaction',historical);
    assert.equal((await commands()).length,beforeHistory);

    const employee=randomUUID(),privateNote='identifying payroll metadata',payId=randomUUID();
    await post('payroll.employee',{id:employee,version:0,commandId:randomUUID(),profile:{name:privateNote,rate:'7',model:'monthly',currency:'USD',box:boxId}});
    const salary=await post('payroll.pay',{commandId:payId,day:date,period:'2025-06',note:privateNote,employees:[{employee,box:boxId,expected:'7.00'}]});
    const metalQuote=randomUUID(),trade=randomUUID();
    await post('metals.quote.manual',{commandId:metalQuote,base:'gold',counter:'USD',rate:'10.00',at:date+'T00:00:00Z',source:'private dealer'});
    await post('metals.trade',{commandId:trade,kind:'buy',metal:'gold',box:boxId,quote:metalQuote,grams:'1.2',day:date,note:'private dealer',reference:'private note'});
    events=await commands();
    for(const [id,amount] of [[salary.payments[0],7],[trade,12]]){
      const record=events.find(e=>e.record_id.endsWith(id));
      assert.deepEqual(record.details,{movement:'expense',date,amount,currency:'USD'});
    }
    assert.ok(!JSON.stringify(events).includes(privateNote));
    const jobs=(await db.query('select s.account_id,p.record_id from public.wow_push_jobs j join public.wow_push_subscriptions s on s.id=j.subscription_id join public.wow_push_events p on p.id=j.event_id')).rows;
    assert.equal(jobs.length,6);
    assert.ok(jobs.every(j=>j.account_id===owner.userId));
    const leases=(await rpc('wow_push_worker','claim',{})).jobs;
    assert.equal(leases.length,6);
    const prepared=await rpc('wow_push_worker','prepare',leases[0]);
    assert.equal(prepared.recipient.userId,owner.userId);
    assert.equal(formatPushPayload(prepared.event,prepared.recipient).userId,owner.userId);
    await db.query('update public.wow_sessions set closed_at=now() where session_id=$1',[owner.sessionId]);
    assert.deepEqual(await rpc('wow_push_worker','prepare',leases[1]),{cancelled:true});
  }finally{await db.close();}
});
