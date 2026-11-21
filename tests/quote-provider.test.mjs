import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteProvider} from '../supabase/functions/wow-cloud/modules/quote-provider.mjs';
import {createFinanceActions} from '../supabase/functions/wow-cloud/modules/finance.mjs';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';

const clock=Date.parse('2026-11-21T12:00:00Z');
const fx={base:'USD',quote:'TRY',rate:44.12567,date:'2026-11-20'};
const gold={metal:'XAU',currency:'USD',unit:'troy_ounce',price:3856.125,timestamp:Math.floor(clock/1000)-300};
const unavailable={code:'QUOTE_UNAVAILABLE',status:503};
const commandId='aaaaaaaa-1111-4111-8111-111111111111';

test('provider requests are exact, bounded and contain no business data; quote caches retain observation dates',async()=>{
 let calls=0,time=clock;
 const provider=createQuoteProvider({now:()=>time,fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://api.frankfurter.dev/v2/providers/ecb/rate/usd/try');
  assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{Accept:'application/json'});
  return Response.json(fx);
 }});
 const result=await provider({base:'USD',counter:'TRY'});
 assert.deepEqual(result,{raw:'44.12567',at:'2026-11-20T00:00:00.000Z',source:'ECB reference via Frankfurter / 2026-11-20',unit:'currency'});
 result.raw='999';time+=1000;assert.equal((await provider({base:'USD',counter:'TRY'})).raw,'44.12567');assert.equal(calls,1);
 time+=300001;await provider({base:'USD',counter:'TRY'});assert.equal(calls,2);
});

test('metal token is server-only, with explicit USD and troy ounce provenance',async()=>{
 const secret='fixture-token-for-provider-only';
 const provider=createQuoteProvider({goldApiKey:secret,now:()=>clock,fetch:async(url,options)=>{
  assert.equal(url,'https://www.goldapi.io/api/price/XAU/USD?melt_price=false&currency_info=false');
  assert.equal(options.headers['x-access-token'],secret);assert(!url.includes(secret));return Response.json(gold);
 }});
 const result=await provider({base:'gold',counter:'USD'});
 assert.equal(result.raw,'3856.125');assert.equal(result.unit,'troy_ounce');assert.equal(result.at,new Date(gold.timestamp*1000).toISOString());
 assert(!JSON.stringify(result).includes(secret));assert.equal(provider.configuration.metals,'goldapi');
});

test('unsupported pairs and unconfigured metals fail before any provider request',async()=>{
 let calls=0;const provider=createQuoteProvider({fetch:async()=>{calls++;throw Error();}});
 for(const pair of [{base:'SYP',counter:'USD'},{base:'USD',counter:'SYP'},{base:'USD',counter:'USD'},
  {base:'gold',counter:'USD'},{base:'silver',counter:'EUR'},{base:'https://internal',counter:'USD'},{base:'__proto__',counter:'USD'}]){
  await assert.rejects(()=>provider(pair),unavailable);
 }assert.equal(calls,0);
});

test('mismatched pairs, stale or future observations, false units and invalid prices are rejected',async()=>{
 const invalidFx=[{...fx,base:'EUR'},{...fx,quote:'EUR'},{...fx,date:'2026-11-01'},
  {...fx,date:'2026-11-22'},{...fx,date:'2026-02-30'},{...fx,rate:0},{...fx,rate:1e10},{...fx,rate:'44.1'},{...fx,rate:1e-12}];
 for(const data of invalidFx){const provider=createQuoteProvider({now:()=>clock,fetch:async()=>Response.json(data)});
  await assert.rejects(()=>provider({base:'USD',counter:'TRY'}),unavailable);}
 for(const data of [{...gold,metal:'XAG'},{...gold,currency:'TRY'},{...gold,unit:'gram'},
  {...gold,timestamp:gold.timestamp-73*3600},{...gold,timestamp:Math.floor(clock/1000)+301},
  {...gold,timestamp:gold.timestamp+0.5},{...gold,price:-1}]){
  const provider=createQuoteProvider({goldApiKey:'fixture-token-12345',now:()=>clock,fetch:async()=>Response.json(data)});
  await assert.rejects(()=>provider({base:'gold',counter:'USD'}),unavailable);
 }
});

test('timeouts, status errors, redirects, malformed and oversized responses are normalized without provider secrets',async()=>{
 const responses=[()=>Response.json({error:'fixture-secret'},{status:429}),()=>new Response('{'),
  ()=>new Response('not json',{headers:{'content-type':'text/html'}}),
  ()=>new Response('x'.repeat(16385),{headers:{'content-type':'application/json'}}),
  ()=>Response.json(fx,{headers:{'content-length':'16385'}})];
 for(const response of responses){const provider=createQuoteProvider({now:()=>clock,fetch:async()=>response()});
  await assert.rejects(()=>provider({base:'USD',counter:'TRY'}),error=>{assert.equal(error.message,'QUOTE_UNAVAILABLE');return true;});}
 const timeout=createQuoteProvider({now:()=>clock,timeoutMs:2,fetch:(_,options)=>new Promise((_,reject)=>
  options.signal.addEventListener('abort',()=>reject(Error('fixture-secret')),{once:true}))});
 await assert.rejects(()=>timeout({base:'USD',counter:'TRY'}),unavailable);
});

test('concurrent calls share one fetch and provider failure cannot refresh stale cache or amplify retries',async()=>{
 let time=clock,calls=0,release;
 const gate=new Promise(resolve=>release=resolve);
 const provider=createQuoteProvider({now:()=>time,fetch:async()=>{calls++;if(calls===1){await gate;return Response.json(fx);}throw Error('upstream');}});
 const a=provider({base:'USD',counter:'TRY'}),b=provider({base:'USD',counter:'TRY'});release();
 assert.deepEqual(await a,await b);assert.equal(calls,1);time+=300001;
 await assert.rejects(()=>provider({base:'USD',counter:'TRY'}),unavailable);
 await assert.rejects(()=>provider({base:'USD',counter:'TRY'}),unavailable);assert.equal(calls,2);
 time+=30001;await assert.rejects(()=>provider({base:'USD',counter:'TRY'}),unavailable);assert.equal(calls,3);
});

test('decimal halfway and exponent tokens round exactly before JavaScript numeric conversion',async()=>{
 for(const [raw,expected] of [['0.019123465','0.01912347'],['1.9123465e-2','0.01912347'],['100','100'],
  ['1e-8','0.00000001'],['0.01912346499999999999','0.01912346'],['9999999999.99999998','9999999999.99999998']]){
  const provider=createQuoteProvider({now:()=>clock,fetch:async()=>new Response(
   '{"base":"USD","quote":"TRY","rate":'+raw+',"date":"2026-11-20","other":{"rate":12}}',
   {headers:{'content-type':'application/json'}})});
  assert.equal((await provider({base:'USD',counter:'TRY'})).raw,expected,raw);
 }
 for(const raw of ['1e101','1e-101','9999999999.999999999','0','-1']){
  const provider=createQuoteProvider({now:()=>clock,fetch:async()=>new Response(
   '{"base":"USD","quote":"TRY","rate":'+raw+',"date":"2026-11-20"}',{headers:{'content-type':'application/json'}})});
  await assert.rejects(()=>provider({base:'USD',counter:'TRY'}),unavailable);
 }
 const duplicate=createQuoteProvider({now:()=>clock,fetch:async()=>new Response(
  '{"base":"USD","quote":"TRY","rate":44,"r\\u0061te":45,"date":"2026-11-20"}',{headers:{'content-type':'application/json'}})});
 await assert.rejects(()=>duplicate({base:'USD',counter:'TRY'}),unavailable);
});

test('cache expiry cannot extend an observation beyond the metal or FX age limit',async()=>{
 let time=clock,calls=0;const timestamp=Math.floor(clock/1000)-72*3600+1;
 const metal=createQuoteProvider({goldApiKey:'fixture-token-12345',now:()=>time,fetch:async()=>{calls++;return Response.json({...gold,timestamp});}});
 await metal({base:'gold',counter:'USD'});time+=30000;
 await assert.rejects(()=>metal({base:'gold',counter:'USD'}),unavailable);assert.equal(calls,2);
 time=Date.parse('2026-11-27T00:00:00Z')-1000;calls=0;
 const currency=createQuoteProvider({now:()=>time,fetch:async()=>{calls++;return Response.json(fx);}});
 await currency({base:'USD',counter:'TRY'});time+=30000;
 await assert.rejects(()=>currency({base:'USD',counter:'TRY'}),unavailable);assert.equal(calls,2);
});

test('finance action checks authorization before a quote fetch and never refetches a committed command',async()=>{
 let quotes=0,allowed=false,receipt;
 const api=createFinanceActions({quoteProvider:async()=>{quotes++;return {raw:'44.12567',unit:'currency',at:'2026-11-20T00:00:00Z',source:'fixture'};},
  moduleRpc:async(_,action,data)=>{if(!allowed)throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED'});
   if(action.endsWith('.check'))return {receipt};receipt={id:data.commandId,rate:data.observation.raw};return receipt;}});
 const input={actor:{userId:'actor',sessionId:'session'},body:{commandId,base:'USD',counter:'TRY'}};
 await assert.rejects(()=>api['finance.quote.live'](input),{code:'ACCESS_DENIED'});assert.equal(quotes,0);
 allowed=true;assert.equal((await api['finance.quote.live'](input)).rate,'44.12567');
 assert.deepEqual(await api['finance.quote.live'](input),receipt);assert.equal(quotes,1);
});

test('actual finance SQL stores provider provenance and converts troy ounces once, with a replayed command receipt',async(t)=>{
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 await db.exec(await readFile(new URL('../supabase/modules/finance.sql',import.meta.url),'utf8'));
 const workspace=randomUUID(),userId=randomUUID(),sessionId=randomUUID(),id=randomUUID();
 await db.query("insert into public.wow_workspaces(id,name) values($1,'Quotes')",[workspace]);
 await db.query('insert into auth.users(id) values($1)',[userId]);
 await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,'quotes','Quotes','owner','{}')",[userId,workspace,userId+'@wow.invalid']);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
 await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sessionId,userId]);
 let calls=0;
 const actualNow=Date.now(),value={...gold,timestamp:Math.floor(actualNow/1000)-60};
 const provider=createQuoteProvider({goldApiKey:'fixture-token-12345',now:()=>actualNow,fetch:async()=>{calls++;return Response.json(value);}});
 const api=createFinanceActions({quoteProvider:provider,moduleRpc:async(name,action,data)=>{
  assert.equal(name,'wow_finance_service');return (await db.query('select public.wow_finance_service($1,$2::jsonb) v',[action,JSON.stringify(data)])).rows[0].v;
 }});
 const request={actor:{userId,sessionId},body:{base:'gold',counter:'USD',commandId:id}};
 const result=await api['metals.quote.live'](request);
 const row=(await db.query('select raw::text,rate::text,unit,source,method from wow_fin.quotes where workspace=$1 and id=$2',[workspace,id])).rows[0];
 const expected=(await db.query('select round(3856.125::numeric/31.1034768,8)::text as rate')).rows[0].rate;
 assert.equal(row.rate,expected);assert.equal(row.raw,'3856.12500000');assert.equal(row.unit,'troy_ounce');
 assert.equal(row.method,'live');assert.equal(row.source,'GoldAPI.io spot / USD / troy ounce');
 assert.deepEqual(await api['metals.quote.live'](request),result);assert.equal(calls,1);
 const exactProvider=createQuoteProvider({now:()=>actualNow,fetch:async()=>new Response(
  '{"base":"TRY","quote":"EUR","rate":0.019123465,"date":"'+new Date(actualNow-86400000).toISOString().slice(0,10)+'"}',
  {headers:{'content-type':'application/json'}})});
 const observation=await exactProvider({base:'TRY',counter:'EUR'});
 const amounts=(await db.query('select round($1::numeric * 1000000,2)::text captured, round(round(0.019123465::numeric,8)*1000000,2)::text exact',[observation.raw])).rows[0];
 assert.equal(amounts.captured,amounts.exact);assert.equal(amounts.captured,'19123.47');
 await db.query('update public.wow_sessions set closed_at=now() where session_id=$1',[sessionId]);
 await assert.rejects(()=>api['metals.quote.live']({...request,body:{...request.body,commandId:randomUUID()}}));assert.equal(calls,1);
});
