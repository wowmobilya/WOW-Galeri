/* WOW Account Statement V22. Pure, read-only financial model. No network or storage.
 * Internal invoice totals and new payments are USD. Legacy payment-management
 * records explicitly marked EUR/TRY contained native-currency amounts in V21.
 * Never substitute today's FX for missing historical FX. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WOWStatementCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const id=v=>v==null?'':String(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const value=v=>v==null||v===''?null:(typeof v==='number'?v:Number(String(v).trim()));
const valid=v=>Number.isFinite(v);
function cents(v){const n=value(v);if(!valid(n)||Math.abs(n)>90071992547400)return null;return Math.round((n+Math.sign(n)*Number.EPSILON)*100);}
const money=v=>v==null?null:v/100;
function day(v){
 if(v==null||v==='')return null;let s=String(v).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
 let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);let y,mo,d;
 if(m){y=+m[1];mo=+m[2];d=+m[3];}else{
  m=s.match(/^(\d{1,2})([./])(\d{1,2})\2(\d{4})$/);if(!m)return null;
  y=+m[4];let a=+m[1],b=+m[3];
  if(m[2]==='.'||a>12){d=a;mo=b;}else if(b>12){mo=a;d=b;}else if(a===b){d=a;mo=b;}else return null;
 }
 if(y<1900||y>9999)return null;const dt=new Date(Date.UTC(y,mo-1,d));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
}
const days=(a,b)=>a&&b?Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000):null;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function dateOf(r,kind){const list=kind==='invoice'?[r.regDate,r.orderDate,r.createdAt,r.date]:[r.date,r.paymentDate,r.createdAt];for(const v of list){const d=day(v);if(d)return d;}return null;}
function currency(v){const s=String(v||'USD').toUpperCase();return s==='TL'?'TRY':s;}
function rateFrom(r,cur){if(cur==='USD')return 1;const key=cur==='TRY'?'usdTry':cur==='EUR'?'usdEur':null;if(!key)return null;for(const n of [r?.[key],r?.rates?.[key],r?.exchangeRates?.[key],r?.fx?.[key]]){const v=value(n);if(valid(v)&&v>0)return v;}return null;}
function paymentValue(p,inv={}){
 const cur=currency(p.currency||'USD');let c,rate=1,estimated=false,source='USD';
 if(own(p,'amountUSD')&&p.amountUSD!==null&&p.amountUSD!=='')c=cents(p.amountUSD);
 else if(p.amountBasis==='USD'||cur==='USD')c=cents(p.amount);
 else{
  rate=rateFrom(p,cur);source='paymentFX';
  if(rate==null){rate=rateFrom(inv,cur);estimated=rate!==null;source='invoiceFX';}
  const n=value(p.amount);c=rate!=null&&valid(n)?cents(n/rate):null;
 }
 const originalCurrency=currency(p.originalCurrency|| (p.amountBasis==='USD'?'USD':cur));
 const originalAmount=value(p.originalAmount)??value(p.amount);
 return {cents:c,amountUSD:money(c),rate,estimated,source,originalCurrency,originalAmount:valid(originalAmount)?originalAmount:null,
  issue:c==null?(cur!=='USD'&&p.amountBasis!=='USD'&&!own(p,'amountUSD')&&rate==null?'missingFX':'invalidAmount'):estimated?'estimatedFX':null};
}
function newPayment(input){
 const amount=value(input.amount),cur=currency(input.currency),rates=input.rates||{};
 if(!valid(amount)||amount<=0||cents(amount)==null)throw new Error('INVALID_PAYMENT_AMOUNT');
 const rate=rateFrom(rates,cur);if(!rate||!valid(rate))throw new Error('MISSING_PAYMENT_FX');
 if(input.date&&!day(input.date))throw new Error('INVALID_PAYMENT_DATE');
 const amountUSD=money(cents(amount/rate));if(!(amountUSD>0))throw new Error('INVALID_PAYMENT_AMOUNT');
 return {amount:amountUSD,amountUSD,amountBasis:'USD',currency:'USD',originalAmount:amount,originalCurrency:cur,
  usdTry:rateFrom(rates,'TRY'),usdEur:rateFrom(rates,'EUR'),rateToUSD:1/rate,invoiceId:input.invoiceId,date:day(input.date)||today(),statementSchema:22};
}
function collectPayments(invoices,payments,warn=()=>{}){
 const groups=new Map(invoices.map(i=>[id(i.id),[]]));const byID=new Map(),anonymous=new Map();const unattached=[];
 const fingerprint=p=>JSON.stringify([id(p.invoiceId),p.date||'',p.amount,p.amountUSD,p.currency||'',p.receiptType||'',p.note||'',p.createdAt||'']);
 const push=(p,invKey,source)=>{
  if(!p||typeof p!=='object'||p.deleted||p.isDeleted||p.voided)return;
  const k=id(p.id),sig=fingerprint(p);
  if(k&&byID.has(k)){
   const old=byID.get(k);if(fingerprint(old.raw)!==sig)warn('duplicateConflict',k,'review');return;
  }
  if(!k&&source==='snapshot'){
   const n=anonymous.get(sig)||0;if(n>0){anonymous.set(sig,n-1);return;}
  }
  if(!k&&source==='store')anonymous.set(sig,(anonymous.get(sig)||0)+1);
  const record={raw:p,key:k||`anonymous-${source}-${byID.size}-${groups.get(invKey)?.length||0}-${unattached.length}`,source};
  if(k)byID.set(k,record);
  if(groups.has(invKey))groups.get(invKey).push(record);else unattached.push(record);
 };
 for(const p of payments||[])push(p,id(p.invoiceId),'store');
 for(const inv of invoices)for(const p of inv.payments||[])push({...p,invoiceId:p.invoiceId??inv.id},id(p.invoiceId??inv.id),'snapshot');
 return {groups,unattached};
}
function build(state,companyId,options={}){
 const key=id(companyId),client=(state.companies||[]).find(c=>id(c.id)===key);
 if(!client)throw new Error('CLIENT_NOT_FOUND');
 const from=options.from?day(options.from):null,to=options.to?day(options.to):today();
 if((options.from&&!from)||!to||(from&&from>to))throw new Error('INVALID_DATE_RANGE');
 const cur=options.currency&&options.currency!=='ALL'?currency(options.currency):'ALL';
 const warnings=[],seenWarnings=new Set();
 const warn=(code,ref='',severity='info',detail='')=>{const wkey=[code,ref,detail].join('|');if(!seenWarnings.has(wkey)){warnings.push({code,ref:id(ref),severity,detail:String(detail)});seenWarnings.add(wkey);}};
 const excludedInvoices=[],allInvoices=[];const seenInv=new Set();
 for(const i of state.invoices||[]){
  if(id(i.companyId)!==key||(cur!=='ALL'&&currency(i.currency)!==cur))continue;
  if(seenInv.has(id(i.id))){warn('duplicateInvoice',i.invNo||i.id,'review');continue;}seenInv.add(id(i.id));
  if(i.deleted||i.isDeleted||i.cancelled||i.canceled||i.voided||['draft','void','cancelled','canceled'].includes(String(i.status||'').toLowerCase())){excludedInvoices.push(i);continue;}
  allInvoices.push(i);
 }
 const allInvIds=new Set(allInvoices.map(i=>id(i.id)));
 const relevantPayments=(state.payments||[]).filter(p=>allInvIds.has(id(p.invoiceId))||(!id(p.invoiceId)&&id(p.companyId??p.customerId)===key&&cur==='ALL'));
 for(const p of state.payments||[]){if(id(p.companyId??p.customerId)===key&&id(p.invoiceId)&&!(state.invoices||[]).some(i=>id(i.id)===id(p.invoiceId)))warn('orphanPayment',p.id,'review');}
 const collected=collectPayments(allInvoices,relevantPayments,warn);
 const ledger=[],paymentsOut=[],invoicesOut=[];
 const inAsOf=date=>date?date<=to:!from;
 const inPeriod=date=>date?(!from||date>=from)&&date<=to:!from;
 function checkDate(date,ref){if(!date)warn('undated',ref,'review');}
 function checkMoney(c,ref){if(c==null)warn('invalidAmount',ref,'review');}
 function pushPayment(raw,record,inv,overrides={}){
  const pv=paymentValue(raw,inv||{}),date=overrides.date??dateOf(raw,'payment'),ref=inv?.invNo||id(raw.invoiceId)||'';
  if(pv.issue)warn(pv.issue,raw.id||ref,pv.issue==='estimatedFX'?'estimate':'review');
  checkDate(date,raw.id||ref);
  const p={id:record.key,invoiceId:id(inv?.id||raw.invoiceId),invNo:ref,date,kind:overrides.kind||(raw.isDeposit||raw.kind==='deposit'||raw.type==='deposit'?'deposit':pv.cents<0?'refund':'payment'),
   method:raw.receiptType||raw.method||inv?.payMethod||'',note:raw.note||'',reference:raw.reference||raw.receiptNo||raw.transactionId||raw.id||'',
   ...pv,fxSource:pv.source,source:record.source,raw,inPeriod:inPeriod(date),asOf:inAsOf(date),...overrides};
  paymentsOut.push(p);
  const signed=pv.cents??0;
  ledger.push({id:'payment:'+record.key,invoiceId:p.invoiceId,invNo:ref,date,kind:p.kind,method:p.method,note:p.note,
   reference:p.reference,originalAmount:p.originalAmount,originalCurrency:p.originalCurrency,amountUSD:p.amountUSD,estimated:pv.estimated,
   debitCents:signed<0?-signed:0,creditCents:signed>0?signed:0,unresolved:pv.cents==null,order:p.kind==='deposit'?1:2});
  return p;
 }
 for(const inv of allInvoices){
  const invId=id(inv.id),ref=String(inv.invNo||invId),date=dateOf(inv,'invoice'),total=cents(inv.grandTotal??inv.grandTotalUSD);
  checkDate(date,ref);checkMoney(total,ref);
  const totalSigned=total??0;
  ledger.push({id:'invoice:'+invId,invoiceId:invId,invNo:ref,date,kind:totalSigned<0?'creditNote':'invoice',reference:ref,note:inv.notes||'',method:'',
   debitCents:totalSigned>0?totalSigned:0,creditCents:totalSigned<0?-totalSigned:0,unresolved:total==null,order:0,originalCurrency:currency(inv.currency),
   originalAmount:rateFrom(inv,currency(inv.currency))!=null&&total!=null?money(cents(money(total)*rateFrom(inv,currency(inv.currency)))):null});
  const group=collected.groups.get(invId)||[],actual=[];
  for(const record of group)actual.push(pushPayment(record.raw,record,inv));
  let dep=own(inv,'depositUSD')?cents(inv.depositUSD??0):cents(inv.deposit??0);checkMoney(dep,ref+' deposit');
  const marked=actual.filter(p=>p.kind==='deposit').reduce((n,p)=>n+(p.cents??0),0);
  if(marked&&dep!=null&&marked!==dep)warn('depositMismatch',ref,'review');
  const synthetic=dep==null?null:Math.max(0,dep-Math.max(0,marked));
  if(synthetic>0||dep<0||dep==null){
   const d=day(inv.depositDate)||date;
   if(!day(inv.depositDate))warn('depositDateAssumed',ref,'info');
   const raw={id:'deposit-'+invId,invoiceId:invId,amount:money(dep<0?dep:synthetic),amountBasis:'USD',currency:'USD',receiptType:inv.payMethod||'',date:d,note:inv.depositNote||''};
   const p=pushPayment(raw,{key:raw.id,source:'invoice'},inv,{date:d,kind:'deposit',dateAssumed:!day(inv.depositDate)});actual.push(p);
  }
  const asOfPays=actual.filter(p=>p.asOf),paidCents=asOfPays.reduce((n,p)=>n+(p.cents??0),0),allPaid=actual.reduce((n,p)=>n+(p.cents??0),0);
  if(own(inv,'totalPaidUSD')&&valid(value(inv.totalPaidUSD))&&Math.abs((cents(inv.totalPaidUSD)??0)-allPaid)>1)warn('cachedMismatch',ref,'review');
  const issued=inAsOf(date),charge=issued?totalSigned:0,balance=charge-paidCents;
  if(issued||asOfPays.length){
   const dueDate=day(inv.paymentDueDate)||day(inv.dueDate);const overdueDays=dueDate&&balance>0?Math.max(0,days(dueDate,to)):null;
   const subtotal=cents(inv.subtotalUSD??(inv.items||[]).reduce((n,p)=>n+(value(p.totalUSD)??(value(p.priceUSD)||0)*(value(p.qty)||0)),0));
   const discount=cents(inv.discountUSD??0),vat=cents(inv.kdvAmtUSD??0);
   const items=(inv.items||[]).map((p,index)=>({index:index+1,productId:id(p.productId),name:String(p.name||''),qty:value(p.qty),unitPrice:value(p.priceUSD),total:value(p.totalUSD),
    dimensions:p.dimensions||'',dimPieces:p.dimPieces||[],color:p.color||'',cbm:value(p.cbm),weight:value(p.weight),packets:value(p.packets),code:p.hsCode||p.code||'',raw:p}));
   invoicesOut.push({id:invId,invNo:ref,date,dueDate,ageDays:date?Math.max(0,days(date,to)):null,overdueDays,currency:currency(inv.currency),
    grandTotal:money(total),chargedAsOf:money(charge),deposit:money(dep),paid:money(paidCents),balance:money(balance),subtotal:money(subtotal),discount:money(discount),vat:money(vat),
    originalTotal:rateFrom(inv,currency(inv.currency))!=null&&total!=null?money(cents(money(total)*rateFrom(inv,currency(inv.currency)))):null,
    archived:!!inv.archived,delivered:!!inv.delivered,regDate:inv.regDate||'',loadDate:inv.loadDate||'',deliveryDate:inv.deliveryDate||'',
    notes:inv.notes||'',tier:inv.tier||'',plate:inv.plate||'',truck:inv.truck||'',usdTry:rateFrom(inv,'TRY'),usdEur:rateFrom(inv,'EUR'),
    items,payments:actual.filter(p=>p.asOf||!p.date),inPeriod:inPeriod(date),issued,raw:inv});
  }
 }
 for(const record of collected.unattached)if(!id(record.raw.invoiceId)&&id(record.raw.companyId??record.raw.customerId)===key)pushPayment(record.raw,record,null,{kind:'onAccount'});
 ledger.sort((a,b)=>(a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||a.order-b.order||a.invNo.localeCompare(b.invNo)||a.id.localeCompare(b.id));
 let opening=0,running=0,invoiced=0,received=0,refunded=0,credits=0,periodDebit=0,periodCredit=0;
 for(const e of ledger)if(e.date&&from&&e.date<from){opening+=e.debitCents-e.creditCents;}
 running=opening;const entries=[];
 for(const e of ledger){if(!inPeriod(e.date))continue;running+=e.debitCents-e.creditCents;
  periodDebit+=e.debitCents;periodCredit+=e.creditCents;
  if(e.kind==='invoice')invoiced+=e.debitCents;
  else if(e.kind==='creditNote')credits+=e.creditCents;
  else {received+=e.creditCents;refunded+=e.debitCents;}
  entries.push({...e,debit:money(e.debitCents),credit:money(e.creditCents),balance:money(running)});
 }
 const totals={opening:money(opening),invoiced:money(invoiced),received:money(received),refunded:money(refunded),creditNotes:money(credits),
  debit:money(periodDebit),creditMovement:money(periodCredit),closing:money(running),due:money(Math.max(0,running)),credit:money(Math.max(0,-running)),
  invoiceCount:entries.filter(e=>e.kind==='invoice'||e.kind==='creditNote').length,paymentCount:entries.filter(e=>!['invoice','creditNote'].includes(e.kind)).length};
 const buckets=[0,0,0,0,0];
 for(const i of invoicesOut){if(i.balance<=0)continue;const n=i.overdueDays;
  const b=n==null?4:n<=0?0:n<=30?1:n<=60?2:3;buckets[b]+=cents(i.balance)||0;}
 const incomplete=warnings.some(w=>w.severity==='review'),estimated=warnings.some(w=>w.severity==='estimate');
 return {version:22,companyId:key,client:{...client},seller:{...(state.settings||{})},from,to,currencyFilter:cur,baseCurrency:'USD',generatedAt:new Date().toISOString(),
  totals,entries,invoices:invoicesOut.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.invNo.localeCompare(b.invNo)),
  payments:paymentsOut.filter(p=>p.asOf||!p.date).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id)),
  warnings,incomplete,estimated,excludedInvoices,aging:{notDue:money(buckets[0]),days1to30:money(buckets[1]),days31to60:money(buckets[2]),days61plus:money(buckets[3]),noDueDate:money(buckets[4])}};
}
function financialIndex(state){
 const co=new Map((state.companies||[]).map(c=>[id(c.id),{companies:[c],invoices:[],payments:[],settings:state.settings}]));
 const owner=new Map();for(const i of state.invoices||[]){owner.set(id(i.id),id(i.companyId));co.get(id(i.companyId))?.invoices.push(i);}
 for(const p of state.payments||[]){const k=owner.get(id(p.invoiceId))||id(p.companyId??p.customerId);co.get(k)?.payments.push(p);}
 const out=new Map();for(const [key,data] of co){const m=build(data,key,{to:'9999-12-31'});out.set(key,{count:m.invoices.length,totalInvoiced:m.totals.invoiced-m.totals.creditNotes,
  totalPaid:m.totals.received-m.totals.refunded,remaining:m.totals.due,credit:m.totals.credit,balance:m.totals.closing,incomplete:m.incomplete||m.estimated});}return out;
}
return {build,newPayment,paymentValue,collectPayments,financialIndex,day,days,today,cents,version:22};
});
