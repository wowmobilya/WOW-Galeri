(function(root){
'use strict';
const C=root.WFFinanceCore,registry=root.WFModules;
if(!C||!registry)return;
const scopes={finance:['boxes','ledger','resources','customers','invoices','reports','quotes','statement','barcodes','audit','legacy'],
 payroll:['slips','attendance','resources','ledger','statement','audit','legacy'],metals:['holdings','quotes','ledger','audit','legacy']};
const columns={barcodes:['name','format','code','price','currency','status'],statement:['day','kind','reference','description','box','inflow','outflow','currency','balance'],legacy:['table','sourceId','name','day','target'],boxes:['name','currency','balance','threshold','status'],ledger:['day','kind','box','description','reference','amount','currency'],
 resources:['name','kind','phone','email','status'],customers:['name','phone'],invoices:['reference','customer','due','total','remaining','currency','status'],
 reports:['month','box','kind','category','currency','inflow','outflow','net'],quotes:['base','counter','rate','at','source','method'],
 holdings:['metal','grams','valuations'],audit:['at','actor','action'],slips:['name','model','currency','base','additions','deductions','advances','net','paidAmount','remaining','status'],
 attendance:['day','name','kind','hours','quantity','value','currency','note']};
const codes=['USD','TRY','EUR','SYP'],shifts=['present','half','absent','late'],events=[...shifts,'piece','overtime','advance','bonus','deduction'];
const numFields=new Set(['price','amount','received','balance','threshold','total','remaining','rate','grams','value','inflow','outflow','net','additions','deductions','advances','hours','quantity','shortfall','paidAmount']);
const transFields=new Set(['kind','model','status','method','metal','base','unit']);
const uid=()=>root.crypto.randomUUID();
const make=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=String(value);return n;};
const append=(parent,...nodes)=>{parent.append(...nodes.filter(Boolean));return parent;};
const obj=entries=>Object.fromEntries(entries);
const today=()=>C.day(),currentMonth=()=>today().slice(0,7);
const ident=v=>JSON.stringify(v);
function download(name,blob){const u=URL.createObjectURL(blob),a=make('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function csvBlob(content){return new Blob([content],{type:'text/csv;charset=utf-8'});}
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('INVALID_ATTACHMENT'));r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(file);});}
function fmtDate(iso,lang){if(!iso)return '—';const date=new Date(iso);return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(date):String(iso);}
const readFile=async file=>{if(!file||file.size>128*1024*1024)throw Error('INVALID_ARCHIVE');return JSON.parse(await file.text());};

async function mount({container,api,lang,route,params}){
 let currentLang=lang,tab=scopes[route].includes(params?.tab)?params.tab:scopes[route][0],generation=0,disposed=false,loading=false;
 let rows=[],complete=false,dialog=null,dirty=false,draftFileIds=new WeakMap(),filters={},dataTime=null,hideAmounts=false;
 const ctrl=new AbortController(),urls=new Set(),selected=new Set(),deferred=new Map();
 const lookups={boxes:[],resources:[],customers:[],quotes:[],fx:[]},loadedRefs=new Set();
 const shell=make('div','wf-fin'),head=make('nav','wf-fin-tabs'),actions=make('div','wf-fin-actions'),filtersArea=make('div'),
   summaries=make('div','wf-fin-summary'),visual=make('div'),body=make('div','wf-fin-body'),status=make('p','wf-fin-status'),sync=make('p','wf-fin-sync'),pending=make('div','wf-fin-pending');
 status.setAttribute('role','status');sync.setAttribute('role','status');pending.setAttribute('role','status');
 container.append(append(shell,head,actions,filtersArea,sync,pending,summaries,visual,body,status));
 const t=key=>C.t(currentLang,key),can=op=>api.can(route+'.'+op),visible=()=>!disposed;
 const button=(key,fn,primary=false)=>{const b=make('button','btn '+(primary?'btn-p':'wf-fin-secondary'),t(key));b.type='button';b.addEventListener('click',()=>Promise.resolve().then(fn).catch(showError));return b;};
 const textOption=(value,label)=>({value:String(value),label:String(label)});
 const choices=list=>list.map(k=>textOption(k,t(k)));
 const named=(items,key='id')=>items.map(r=>textOption(r[key],C.label(r,currentLang)||r[key]));
 const active=items=>items.filter(r=>r.active!==false);
 const namedBox=id=>C.label(lookups.boxes.find(r=>r.id===id),currentLang)||id||'—';
 const resources=kind=>lookups.resources.filter(r=>r.kind===kind);
 const keyName=(key)=>key==='value'?'amount':key==='base'&&tab==='slips'?'basePay':key==='method'?'method':key;
 const fields=()=>tab==='ledger'&&route==='metals'?['day','metal','kind','grams','rate','priceCurrency','fxRate','box','amount','currency','source']:
  tab==='ledger'&&route==='payroll'?['day','kind','employee','period','box','amount','currency','note']:columns[tab]||[];
 const content=(r,k)=>{
  if(hideAmounts&&(numFields.has(k)||k==='valuations'||k==='base'&&tab==='slips'))return '••••';
  if(k==='employee')return C.label(resources('employee').find(x=>x.id===r.employee),currentLang)||'—';if(k==='table')return t(r[k]);if(k==='box')return namedBox(r[k]);if(k==='name'&&r.labels)return C.label(r,currentLang);
  if(k==='category')return C.label(resources('category').find(x=>x.id===r.category),currentLang)||r.category||'—';
  if(k==='status'){const stat=tab==='slips'?(r.paid?'paid':r.frozen?'partial':r.eligible?'pending':'excluded'):r.status||(r.active===false?'inactive':'active');return t(stat);}
  if(k==='description')return r.description||r.reason||r.note||t(r.kind);
  if(k==='valuations')return (r.valuations||[]).map(q=>C.amount(q.value,currentLang)+' '+q.currency+' · '+q.source+' · '+fmtDate(q.at,currentLang)+(q.stale?' · '+t('stale'):'')).join('\n')||'—';
  if(k==='at')return fmtDate(r.at,currentLang);
  if(k==='action')return String(r.action).split('.').map(t).join(' · ');
  if(k==='base'&&tab==='slips'||numFields.has(k))return C.amount(r[k],currentLang);
  if(transFields.has(k))return t(r[k]??'—');return r[k]??'—';
 };
 function showError(e){if(!visible())return;const code=e?.code||e?.message||'';
  const message=t(code==='CONFLICT'||code==='IDEMPOTENCY_MISMATCH'?'conflict':code==='QUOTE_UNAVAILABLE'?'noquote':
   code==='INVALID_INSUFFICIENT_BALANCE'?'insufficient':'failed')+(code&&/^[A-Z][A-Z0-9_]{2,60}$/.test(code)?' ('+code+')':'');
  status.textContent=message;if(dialog){const el=dialog.querySelector('[role=alert]');if(el)el.textContent=message;}else api.notify?.(message,'error');
 }
 async function list(scope,sub,options={},refresh=false){
  const res=await api.request(scope+'.list',{...options,tab:sub},{refresh});
  if(!visible())throw Error('AUTH_REQUIRED');if(!Array.isArray(res?.items))throw Error('INVALID_RESPONSE');return res;
 }
 async function all(scope,sub,options={},refresh=false){
  const items=[];let batch;do{batch=await list(scope,sub,{...options,offset:items.length,limit:200},refresh);items.push(...batch.items);
   if(batch.more&&!batch.items.length)throw Error('INVALID_RESPONSE');}while(batch.more);return items;
 }
 async function refs(force){
  const jobs=[['boxes',route,'boxes',{}]];
  if(route!=='metals')jobs.push(['resources',route,'resources',{}]);
  if(route==='finance'&&['customers','invoices','ledger','reports','statement'].includes(tab)&&api.can('customers.view'))jobs.push(['customers',route,'customers',{}]);
  if(route==='metals'||route==='finance'&&tab==='ledger')jobs.push(['quotes',route,'quotes',{}]);
  if(route==='metals')jobs.push(['fx',route,'fx',{}]);
  const results=await Promise.all(jobs.filter(([key])=>force||!loadedRefs.has(key)).map(async([key,scope,sub,q])=>[key,await all(scope,sub,q,force)]));
  return obj(results);
 }
 function renderPending(){
  pending.replaceChildren();for(const [key,r] of deferred){const p=make('p',null,t(r.state||'queued')+(r.error?' ('+r.error+')':'')+' · '+String(r.action).split('.').map(t).join(' · '));pending.append(p);}
 }
 async function refresh(force=false){
  const n=++generation;loading=true;status.textContent=t('loading');selected.clear();
  try{
   const req=[refs(force),list(route,tab,{...filters,limit:100},force)];
   const [ref,res]=await Promise.all(req);if(n!==generation||!visible())return;
   Object.assign(lookups,ref);Object.keys(ref).forEach(k=>loadedRefs.add(k));rows=res.items;complete=!res.more;
   const snapshotTab=tab;
   if((['reports','slips','attendance'].includes(snapshotTab)||snapshotTab==='quotes'&&route==='metals')&&res.more){
    const extra=await all(route,tab,filters,force);if(n!==generation||!visible())return;rows=extra;complete=true;
   }
   dataTime=res._sync;status.textContent='';paint(); 
  }catch(e){if(n===generation)showError(e);}finally{if(n===generation)loading=false;}
 }
 async function more(){if(loading||complete)return;const n=generation;loading=true;
  try{const res=await list(route,tab,{...filters,limit:100,offset:rows.length});if(n!==generation)return;rows.push(...res.items);complete=!res.more;paintRows();}
  finally{if(n===generation)loading=false;}
 }
 function tabs(){
  head.replaceChildren();head.setAttribute('aria-label',t(route));
  for(const name of scopes[route]){
   if(name==='legacy'&&api.getSession()?.role!=='owner')continue;
   if(name==='customers'&&!api.can('customers.view')||name==='invoices'&&(!api.can('invoices.view')||!api.can('payments.view')))continue;
   const b=button(name==='legacy'?'historical':name==='resources'&&route==='payroll'?'employee':name,()=>switchTab(name));b.setAttribute('aria-current',name===tab?'page':'false');head.append(b);
  }
 }
 function switchTab(next,q={}){tab=next;filters={...(['slips','attendance'].includes(next)?{period:currentMonth()}:{}),...q};rows=[];summaries.replaceChildren();visual.replaceChildren();body.replaceChildren();filtersArea.replaceChildren();tabs();toolbar();return refresh();}
 function described(k,v){const span=make('span');append(span,make('small',null,t(k)),make('strong',null,v));return span;}
 function paint(){
  sync.textContent=dataTime?.source==='device'?t('cached')+' · '+fmtDate(dataTime.cachedAt,currentLang):'';sync.hidden=!sync.textContent;
  tabs();toolbar();buildFilters();paintRows();paintVisual();
 }
 function paintVisual(){
  summaries.replaceChildren();visual.replaceChildren();
  if(!hideAmounts&&tab==='boxes'&&can('view'))for(const r of C.cashTotals(rows,'balance'))summaries.append(described(r.currency,C.amount(r.value,currentLang)));
  if(!hideAmounts&&(tab==='reports'||tab==='slips'))for(const r of C.cashTotals(rows.filter(x=>tab!=='slips'||x.eligible!==false),'net'))summaries.append(described(r.currency,t('net')+' '+C.amount(r.value,currentLang)));
  if(tab==='attendance'&&filters.employee){
   const p=filters.period||currentMonth(),y=Number(p.slice(0,4)),m=Number(p.slice(5));
   const cal=make('div','wf-fin-calendar'),offset=(new Date(y,m-1,1).getDay()+6)%7,n=new Date(y,m,0).getDate();
   for(let i=0;i<7;i++)cal.append(make('b',null,new Intl.DateTimeFormat(currentLang,{weekday:'short'}).format(new Date(2024,0,i+1))));
   for(let i=0;i<offset;i++)cal.append(make('span'));
   for(let i=1;i<=n;i++){const date=p+'-'+String(i).padStart(2,'0'),shift=rows.find(r=>r.day===date&&shifts.includes(r.kind));
    const cell=make(can('edit')?'button':'span','wf-fin-day',String(i)+(shift?' · '+t(shift.kind):''));cell.title=date;
    if(can('edit')){cell.type='button';cell.onclick=()=>attendanceForm(shift||{employee:filters.employee,day:date});}cal.append(cell);}
   visual.append(cal);
  }
  if(!hideAmounts&&((tab==='quotes'&&route==='metals')||tab==='reports')){
   const groups=new Map();
   if(tab==='quotes'){for(const r of rows){const k=t(r.base)+' · '+r.counter;if(!groups.has(k))groups.set(k,[]);if(groups.get(k).length<12)groups.get(k).unshift({label:r.at.slice(0,10),value:r.rate});}}
   else {
    const months=new Map();for(const r of rows){const k=r.currency+'|'+(r.month||'—');months.set(k,(months.get(k)||0n)+C.units(r.net));}
    for(const [key,v] of [...months].sort()){const [cur,m]=key.split('|');if(!groups.has(cur))groups.set(cur,[]);groups.get(cur).push({label:m,value:C.fixed(v)});}
   }
   for(const [key,entries] of groups){const figure=make('figure','wf-fin-chart'),max=Math.max(...entries.map(e=>Math.abs(Number(e.value))),1);
    figure.append(make('figcaption',null,key));for(const e of entries){const wrap=make('div','wf-fin-bar'),bar=make('i');bar.style.inlineSize=String(Math.abs(Number(e.value))/max*100)+'%';
     const track=make('span','wf-fin-track');track.append(bar);append(wrap,make('time',null,e.label),track,make('b',null,C.amount(e.value,currentLang)));figure.append(wrap);}visual.append(figure);}
  }
 }
 function createTable(items,cols,buttons=false){
  const table=make('table','wf-fin-table'),tr=make('tr');for(const c of cols)tr.append(make('th',null,t(keyName(c))));if(buttons)tr.append(make('th',null,t('action')));
  const tbody=make('tbody');table.append(append(make('thead'),tr),tbody);
  for(const r of items){const tr=make('tr');for(const c of cols){const td=make('td',numFields.has(c)?'wf-fin-number':null,content(r,c));
   if(c==='balance'&&r.balance!=null&&C.units(r.balance)<C.units(r.threshold||'0'))td.append(make('small','wf-fin-warning',t('low')));
   if(c==='at'&&r.stale)td.append(make('small','wf-fin-warning',t('stale')));tr.append(td);}
   if(buttons){const td=make('td','wf-fin-row-actions');rowActions(td,r);tr.append(td);}tbody.append(tr);}
  return table;
 }
 function paintRows(){body.replaceChildren();if(!rows.length){body.append(make('p','wf-fin-empty',t('empty')));return;}
  const wrap=make('div','wf-fin-scroll');wrap.append(createTable(rows,fields(),true));body.append(wrap);if(!complete)body.append(button('more',more));
 }
 function rowActions(cell,r){
  const edit=can('edit'),canDelete=can('delete'),print=can('print');
  if(tab==='barcodes'){cell.append(button('barcode',()=>barcodeView(r)));if(edit)cell.append(button('edit',()=>barcodeForm(r)));return;}
  if(tab==='legacy'){
   cell.append(button('history',async()=>{const data=await api.request(route+'.legacy.detail',{id:r.id});if(visible()){const dlg=panel('historical');dlg.append(make('pre','wf-fin-record',JSON.stringify(data.record,null,2)));}}));
   if(!r.target&&['customers','invoices','employees','suppliers','categories','cashboxes','barcodes'].includes(r.table)){
    cell.append(button('link',()=>legacyLink(r)));if(['employees','suppliers','categories','cashboxes','barcodes'].includes(r.table))cell.append(button('cutover',()=>fromHistoric(r)));}return;
  }
  if(tab==='boxes'){cell.append(button('history',()=>switchTab('ledger',{box:r.id})));if(edit&&!r.system)cell.append(button('edit',()=>resourceForm('box',r)));return;}
  if(tab==='resources'){
   if(edit)cell.append(button('edit',()=>resourceForm(r.kind,r)));
   if(r.kind==='employee'){cell.append(button('calendar',()=>switchTab('attendance',{employee:r.id,period:currentMonth()})),button('slip',()=>switchTab('slips',{employee:r.id,period:currentMonth()})));
    cell.append(button('statement',()=>switchTab('statement',{employee:r.id})));if(r.avatar)cell.append(button('avatar',()=>openAsset(r.avatar,'payroll')));}
   if(r.kind==='vendor')cell.append(button('statement',()=>switchTab('statement',{party:{type:'vendor',id:r.id}})));return;
  }
  if(tab==='customers'){cell.append(button('ledger',()=>switchTab('ledger',{party:{type:'customer',id:r.id}})));
   if(api.can('payments.view'))cell.append(button('statement',()=>root.wfOpenStatement?.(r.id)));return;}
  if(tab==='invoices'){if(!['draft','void','cancelled','canceled','paid'].includes(r.status)&&api.can('payments.view'))cell.append(button('pay',()=>root.openPaymentMgmt?.(r.id)));
   if(r.companyId!=null&&api.can('payments.view'))cell.append(button('statement',()=>root.wfOpenStatement?.(r.companyId)));return;}
  if(tab==='ledger'){
   if(print)cell.append(button('printReceipt',()=>printRows([r],['day','kind','description','reference','box','amount','currency','note'],'printReceipt')));
   if(edit&&r.scope===route&&!r.reversed&&['income','expense'].includes(r.kind))cell.append(button('edit',()=>transactionForm(r.kind,r)));
   if(canDelete&&r.scope===route&&!r.reversed&&r.kind!=='advance')cell.append(button('reverse',()=>reversal(r)));
   for(const file of r.attachments||[])cell.append(button('file',()=>openAsset(file,'finance')));return;
  }
  if(tab==='attendance'){if(edit)cell.append(button('edit',()=>attendanceForm(r)));
   if(canDelete)cell.append(button('remove',()=>form('remove',[F('day','display',r.day),F('kind','display',t(r.kind))],()=>({action:'payroll.remove',body:{id:r.id,version:r.version}}))));return;}
  if(tab==='slips'){
   cell.append(button('slip',()=>slip(r)));if(edit&&!r.paid&&r.eligible&&C.units(r.net)>0n){
    const check=make('input');check.type='checkbox';check.checked=selected.has(r.employee);check.setAttribute('aria-label',t('choose')+' '+r.name);
    check.onchange=()=>check.checked?selected.add(r.employee):selected.delete(r.employee);cell.append(check,button('pay',()=>payForm([r])));}
   if(r.frozen&&r.payment&&canDelete)cell.append(button('reverse',()=>reversal({id:r.payment,day:r.day})));return;
  }
  if(tab==='holdings'&&edit)cell.append(button('buy',()=>tradeForm('buy',r.metal)),button('sell',()=>tradeForm('sell',r.metal)));
 }
 const F=(name,type='text',value='',options=[],extra={})=>({name,type,value:value??'',options,...extra});
 function field(spec){
  const wrap=make('label','wf-fin-field'),caption=make('span',null,spec.caption??t(spec.name));wrap.append(caption);
  let el;
  if(spec.type==='display')el=make('output',null,spec.value);
  else if(spec.type==='select'){el=make('select','fc');
   for(const o of spec.options){const opt=make('option',null,o.label);opt.value=o.value;el.append(opt);}if(spec.value!==''||spec.options.some(o=>o.value===''))el.value=String(spec.value);
  }else if(spec.type==='textarea'){el=make('textarea','fc');el.value=String(spec.value);}
  else {el=make('input','fc');el.type=spec.type==='decimal'?'text':spec.type;
   if(spec.type==='decimal'){el.inputMode='decimal';el.pattern='[0-9]+([.][0-9]+)?';el.dir='ltr';}
   if(spec.type==='file'){el.accept=spec.accept||'';el.multiple=!!spec.multiple;}
   else if(spec.type==='checkbox')el.checked=!!spec.value;else el.value=String(spec.value);
  }
  el.name=spec.name;if(spec.required)el.required=true;if(spec.max)el.maxLength=spec.max;
  if(spec.type==='hidden')wrap.hidden=true;wrap.append(el);return wrap;
 }
 const blank=()=>textOption('',t('all'));const optionalOpts=a=>[textOption('','—'),...a];
 function values(form){const result={};for(const el of form.elements){if(!el.name||el.tagName==='OUTPUT')continue;
  result[el.name]=el.type==='checkbox'?el.checked:el.type==='file'?[...el.files]:el.value;}return result;}
 function closeDialog(){if(!dialog)return;const el=dialog;dialog=null;dirty=false;el.close?.();el.remove();for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
 function panel(title){closeDialog();dialog=make('dialog','wf-fin-dialog');dialog.dir=currentLang==='ar'?'rtl':'ltr';dialog.lang=currentLang;
  const hdr=make('header');append(hdr,make('h2',null,t(title)),button('close',closeDialog));dialog.append(hdr);shell.append(dialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');return dialog;
 }
 function form(title,specs,collect,{submit='save',afterRender}={}){
  const dlg=panel(title),f=make('form','wf-fin-form'),grid=make('div','wf-fin-grid');for(const spec of specs)grid.append(field(spec));
  const error=make('p','wf-fin-form-error');error.setAttribute('role','alert');const save=make('button','btn btn-p',t(submit));save.type='submit';
  append(f,grid,error,save);dlg.append(f);f.oninput=()=>{dirty=true;};afterRender?.(f);
  let attempt=null,busy=false;
  f.onsubmit=async event=>{event.preventDefault();if(busy||!f.reportValidity())return;busy=true;error.textContent='';save.disabled=true;
   try{const operation=await collect(values(f),f);if(!operation)return;
    const fingerprint=JSON.stringify(operation);if(!attempt||attempt.fingerprint!==fingerprint)attempt={fingerprint,commandId:uid()};
    const result=await api.request(operation.action,{...operation.body,commandId:attempt.commandId});
    if(!visible()||dialog!==dlg)return;
    if(result?.queued||result?.pending){deferred.set(result.queueId||attempt.commandId,{action:operation.action,state:'queued'});renderPending();closeDialog();return;}
    closeDialog();await refresh(true);if(visible()){status.textContent=t('saved');api.notify?.(t('saved'),'success');}
   }catch(e){showError(e);}finally{busy=false;save.disabled=false;}};
  return f;
 }
 function buildFilters(){
  filtersArea.replaceChildren();if(['holdings','boxes'].includes(tab))return;
  const specs=[];
  if(['ledger','quotes','reports','audit','attendance','statement'].includes(tab))specs.push(F('from','date',filters.from),F('to','date',filters.to));
  if(route==='payroll'&&tab==='statement')specs.push(F('employee','select',filters.employee,[blank(),...named(resources('employee'))]));
  if(['attendance','slips'].includes(tab))specs.push(F('period','month',filters.period||currentMonth()),F('employee','select',filters.employee,[blank(),...named(resources('employee'))]));
  if(tab==='statement')specs.push(F('box','select',filters.box,[blank(),...named(lookups.boxes)]));
  if(['ledger','reports'].includes(tab))specs.push(F('box','select',filters.box,[blank(),...named(lookups.boxes)]),
   F('kind','select',filters.kind,[blank(),...choices(route==='metals'?['buy','sell','reversal']:route==='payroll'?['salary','advance','reversal']:['income','expense','opening','transfer','invoice','salary','advance','buy','sell','reversal'])]));
  if(route==='finance'&&['ledger','reports','invoices','statement'].includes(tab))specs.push(F('party','select',filters.party?ident(filters.party):'',[blank(),...partyOptions()]));
  if(route==='finance'&&['ledger','reports'].includes(tab))specs.push(F('category','select',filters.category,[blank(),...named(resources('category'))]));
  if(['ledger','reports','quotes','statement'].includes(tab))specs.push(F('currency','select',filters.currency,[blank(),...choices(codes)]));
  if(route==='metals'&&tab==='ledger')specs.push(F('metal','select',filters.metal,[blank(),...choices(['gold','silver'])]));
  if(tab==='quotes')specs.push(F('base','select',filters.base,[blank(),...choices(route==='metals'?['gold','silver']:codes)]));
  if(tab==='resources'&&route==='finance')specs.push(F('resource','select',filters.resource,[blank(),...choices(['vendor','category','box'])]));
  if(['resources','customers','ledger','reports','legacy','barcodes'].includes(tab))specs.push(F('search','search',filters.search));
  if(!specs.length)return;
  const det=make('details','wf-fin-filter'),summary=make('summary',null,t('filters'));det.open=Object.keys(filters).some(k=>k!=='period');
  const f=make('form','wf-fin-grid');specs.forEach(s=>f.append(field(s)));const go=make('button','btn',t('filter'));go.type='submit';f.append(go);
  f.onsubmit=e=>{e.preventDefault();const v=values(f);filters=obj(Object.entries(v).filter(([,val])=>val!==''));
   if(filters.party)filters.party=JSON.parse(filters.party);refresh();};append(det,summary,f);filtersArea.append(det);
 }
 function partyOptions(){return [...lookups.customers.map(r=>textOption(ident({type:'customer',id:r.id}),t('customer')+' · '+r.name)),
  ...named(resources('vendor')).map(r=>textOption(ident({type:'vendor',id:r.value}),t('vendor')+' · '+r.label))];}
 async function documentBytes(file){
  if(file.type==='application/pdf'){if(file.size>4*1024*1024)throw Error('INVALID_ATTACHMENT');return {blob:file,mime:file.type};}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>16*1024*1024)throw Error('INVALID_ATTACHMENT');
  if(file.size<=768*1024)return {blob:file,mime:file.type};
  const image=await createImageBitmap(file);
  try{if(image.width*image.height>50000000)throw Error('INVALID_ATTACHMENT');
   const canvas=document.createElement('canvas');let size=Math.min(1800,Math.max(image.width,image.height));
   for(let n=0;n<5;n++){const ratio=Math.min(1,size/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));if(blob&&blob.size<=768*1024)return {blob,mime:'image/jpeg'};size*=0.75;
   }throw Error('INVALID_ATTACHMENT');
  }finally{image.close();}
 }
 async function upload(file,scope){
  if(!file)return null;
  let id=draftFileIds.get(file);if(!id){id=uid();draftFileIds.set(file,id);}
  const prepared=await documentBytes(file);const res=await api.request('finance.attach',{commandId:id,scope,file:{name:file.name,mime:prepared.mime,data:await fileData(prepared.blob)}});
  if(!res?.id)throw Error('INVALID_ATTACHMENT');return res.id;
 }
 async function openAsset(id,scope){
  const res=await api.request('finance.attachment',{id,scope});if(!visible())return;
  const f=res.file,bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:f.mime});
  if(!f.mime.startsWith('image/')){download(f.name,blob);return;}
  const dlg=panel('file'),url=URL.createObjectURL(blob),img=make('img','wf-fin-photo');urls.add(url);img.alt=f.name;img.src=url;dlg.append(img);
 }
 function labelGraphic(row){
  const encoded=C.barcodeImage(row.format,row.code,{encode:root.JsBarcode,qr:root.generateQRCodeSVG}),card=make('figure','wf-fin-label');
  const img=make('img');img.alt=row.name||encoded.code;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(encoded.svg);
  append(card,make('figcaption',null,row.name||encoded.code),img,make('bdi',null,encoded.code));
  if(C.units(row.price||'0')>0n)card.append(make('strong',null,C.amount(row.price,currentLang)+' '+row.currency));return {card,encoded};
 }
 function labelActions(parent,row){
  const {card,encoded}=labelGraphic(row);parent.append(card);
  if(can('export'))parent.append(button('download',()=>download('WOW-label.svg',new Blob([encoded.svg],{type:'image/svg+xml'}))));
  if(can('print'))parent.append(button('print',()=>printDocument(t('barcode'),[card.cloneNode(true)])));
 }
 function barcodeView(row){const dlg=panel('barcode');labelActions(dlg,row);}
 function barcodeForm(r={},historic=null){
  const id=historic?.id||r.id||uid();
  const specs=[F('name','text',r.name),F('format','select',r.format||'CODE128',choices(['CODE128','QR','EAN13'])),F('code','text',r.code,[],{required:true}),
   F('price','decimal',r.price||'0'),F('currency','select',r.currency||'USD',choices(codes))];if(can('delete'))specs.push(F('active','checkbox',r.active!==false));
  form('generate',specs,v=>{const {encoded}=labelGraphic(v);return {action:'finance.resource',body:{id,kind:'barcode',version:r.version??0,legacy:historic?.id||null,
   profile:{...v,name:v.name||encoded.code,code:encoded.code,active:v.active??true}}};},{afterRender:f=>{
    const preview=make('div','wf-fin-label-preview');f.append(preview);
    const paint=()=>{preview.replaceChildren();const v=values(f);if(v.code)try{labelActions(preview,v);}catch{preview.append(make('p',null,t('failed')+' (INVALID_BARCODE)'));}};
    f.addEventListener('input',paint);paint();
   }});
 }
 async function legacyLink(r){
  const key={customers:'customers',invoices:'invoices',suppliers:'vendor',categories:'category',cashboxes:'box',employees:'employee',barcodes:'barcodes'}[r.table];
  const list=['customers','invoices','barcodes'].includes(key)?await all('finance',key):key==='box'?lookups.boxes:resources(key);
  const opts=list.map(x=>textOption(ident(x.id),C.label(x,currentLang)||x.reference||String(x.id)));
  form('link',[F('sourceId','display',r.sourceId),F('target','select','',opts,{required:true})],v=>({action:route+'.legacy.link',body:{id:r.id,version:r.version,target:JSON.parse(v.target)}}));
 }
 async function fromHistoric(r){
  const x=(await api.request(route+'.legacy.detail',{id:r.id})).record;if(!visible())return;const kind={suppliers:'vendor',employees:'employee',categories:'category',cashboxes:'box'}[r.table];
  if(r.table==='barcodes'){barcodeForm({name:x.label||x.code,format:x.barcode_type||'CODE128',code:x.code,price:String(x.price??0),currency:x.currency||'TRY'},r);return;}
  const cur=x.currency||x.salary_currency||'USD';if(!codes.includes(cur))throw Error('INVALID_CURRENCY');
  const n={name:x.name||x.name_tr||x.company||'',active:x.is_active!==false,labels:{en:x.name_en||'',ar:x.name_ar||'',tr:x.name_tr||''},
   phone:x.phone,phone2:x.phone2,email:x.email,company:x.company,city:x.city,address:x.address,taxNumber:x.tax_no,notes:x.notes,
   currency:cur,threshold:String(x.min_balance??0),opening:String(x.balance??0),direction:['income','expense'].includes(x.type)?x.type:'both',
   department:x.dept,position:x.position,model:{fixed:'monthly',piece:'piece',daily:'daily',hourly:'hourly'}[x.salary_type]||'monthly',
   rate:String(x.salary??0),absence:String(x.absence_deduction??0),lateRate:String(x.late_deduction??0),multiplier:String(x.overtime_rate??1.5),
   status:x.status||'active',start:x.start_date||''};
  resourceForm(kind,n,r);
 }
 function resourceForm(kind,r={},historic=null){
  const id=historic?.id||r.id||uid(),specs=[F('name','text',r.name,[],{required:true,max:120})];
  if(['box','category'].includes(kind)){
   specs.push(...C.languages.map(lang=>F('label_'+lang,'text',r.labels?.[lang],[],{caption:new Intl.DisplayNames([currentLang],{type:'language'}).of(lang),max:120})));
   specs.push(F('color','select',r.color||'gold',choices(['gold','green','blue','red','silver','purple'])));
  }
  if(kind==='box'){specs.push(F('currency','select',r.currency||'USD',choices(codes)),F('threshold','decimal',r.threshold||'0'));
   if(!r.id)specs.push(F('opening','decimal',r.opening||'0'),F('day','date',today(),[],{required:true}));}
  if(kind==='category')specs.push(F('direction','select',r.direction||'both',choices(['both','income','expense'])));
  if(kind==='vendor'||kind==='employee')specs.push(F('phone','tel',r.phone),F('phone2','tel',r.phone2),F('email','email',r.email),F('notes','textarea',r.notes));
  if(kind==='vendor')specs.push(...['company','city','address','taxNumber'].map(k=>F(k,'text',r[k])));
  if(kind==='employee')specs.push(F('position','text',r.position),F('department','text',r.department),F('start','date',r.start),
   F('status','select',r.status||'active',choices(['active','inactive','leave','terminated'])),F('model','select',r.model||'monthly',choices(['monthly','daily','hourly','piece'])),
   F('rate','decimal',r.rate||'0',[],{required:true}),F('currency','select',r.currency||'USD',choices(codes)),F('box','select',r.box,optionalOpts(named(active(lookups.boxes)))),
   ...['absence','lateRate','overtimeRate','multiplier','days','hours'].map((k,i)=>F(k,'decimal',r[k]??['0','0','0','1.5','26','8'][i])),
   F('avatar','file','',[],{accept:'image/jpeg,image/png,image/webp'}));
  if(can('delete'))specs.push(F('active','checkbox',r.active!==false));
  form(kind,specs,async v=>{
   const profile={...v,active:v.active??r.active??true};
   if(['box','category'].includes(kind))profile.labels=obj(C.languages.map(lang=>[lang,v['label_'+lang]]));
   if(kind==='employee'){profile.days=Number(v.days);profile.avatar=v.avatar[0]?await upload(v.avatar[0],'payroll'):r.avatar||null;}
   return {action:kind==='employee'?'payroll.employee':'finance.resource',body:{kind,id,version:r.version??0,profile,legacy:historic?.id||null,opening:v.opening||'0',day:v.day||today()}};
  });
 }
 function transactionForm(kind,r={}){
  const cats=active(resources('category')).filter(c=>c.direction==='both'||c.direction===kind);
  form(kind,[F('box','select',r.box||filters.box,named(active(lookups.boxes)),{required:true}),F('amount','decimal',r.originalAmount||(r.amount?String(r.amount).replace(/^-/,''):''),[],{required:true}),
   F('day','date',r.day||today(),[],{required:true}),F('description','text',r.description,[],{required:true,max:240}),F('reference','text',r.reference),
   F('currency','select',r.originalCurrency||r.currency||lookups.boxes.find(b=>b.id===(r.box||filters.box))?.currency||lookups.boxes[0]?.currency,choices(codes)),
   F('fxQuote','select',r.fxQuote,optionalOpts(quoteOptions(lookups.quotes))),F('method','select',r.method||'cash',choices(['cash','bank','card','cheque','other']),{caption:t('paymentMethod')}),
   F('category','select',r.category,optionalOpts(named(cats))),F('party','select',r.party?ident(r.party):'',optionalOpts(partyOptions())),
   F('note','textarea',r.note),...(r.attachments||[]).map(id=>F('keep_'+id,'checkbox',true,[],{caption:t('file')+' · '+id.slice(0,8)})),F('attachments','file','',[],{multiple:true,accept:'image/jpeg,image/png,image/webp,application/pdf'})],async v=>{
    const files=(r.attachments||[]).filter(id=>v['keep_'+id]);if(files.length+v.attachments.length>5)throw Error('INVALID_ATTACHMENT');
    for(const f of v.attachments)files.push(await upload(f,'finance'));
    return {action:'finance.transaction',body:{...v,kind,fxQuote:v.fxQuote||null,category:v.category||null,
     party:v.party?JSON.parse(v.party):null,replaces:r.id||null,attachments:files}};
   },{afterRender:f=>{
    const update=()=>{const dest=lookups.boxes.find(b=>b.id===f.elements.box.value)?.currency,src=f.elements.currency.value,sel=f.elements.fxQuote,prev=sel.value||r.fxQuote;
     sel.replaceChildren();for(const o of optionalOpts(quoteOptions(lookups.quotes.filter(q=>q.base===src&&q.counter===dest&&q.at.slice(0,10)<=f.elements.day.value))))sel.add(new Option(o.label,o.value));
     if([...sel.options].some(o=>o.value===prev))sel.value=prev;sel.required=src!==dest;sel.disabled=!sel.required;};
    for(const k of ['currency','box','day'])f.elements[k].addEventListener('change',update);update();
   }});
 }
 const quoteOptions=quotes=>quotes.map(q=>textOption(q.id,t(q.base)+' / '+q.counter+' · '+C.amount(q.rate,currentLang)+' · '+fmtDate(q.at,currentLang)+' · '+q.source+(q.stale?' · '+t('stale'):'')));
 function transferForm(){
  form('transfer',[F('fromBox','select',filters.box,named(active(lookups.boxes)),{required:true}),F('toBox','select','',named(active(lookups.boxes)),{required:true}),
   F('amount','decimal','',[],{required:true}),F('day','date',today(),[],{required:true}),F('quote','select','',optionalOpts(quoteOptions(lookups.quotes))),
   F('reference'),F('note','textarea')],v=>({action:'finance.transfer',body:{...v,quote:v.quote||null}}),{afterRender:f=>{
    const update=()=>{const x=lookups.boxes.find(b=>b.id===f.elements.fromBox.value),y=lookups.boxes.find(b=>b.id===f.elements.toBox.value);
     const sel=f.elements.quote,old=sel.value;sel.replaceChildren();for(const q of optionalOpts(quoteOptions(lookups.quotes.filter(q=>q.base===x?.currency&&q.counter===y?.currency&&q.at.slice(0,10)<=f.elements.day.value))))sel.add(new Option(q.label,q.value));
     if([...sel.options].some(o=>o.value===old))sel.value=old;sel.required=x?.currency!==y?.currency;sel.disabled=!sel.required;};
    for(const k of ['fromBox','toBox','day'])f.elements[k].addEventListener('change',update);update();}});
 }
 function quoteForm(live){
  const metalen=route==='metals',base=metalen?['gold','silver']:codes;
  const specs=[F('base','select',base[0],choices(base)),F('counter','select',metalen?'USD':'TRY',choices(live&&metalen?['USD']:codes))];
  if(!live)specs.push(F('rate','decimal','',[],{required:true,caption:t(metalen?'perGram':'rate')}),F('at','datetime-local',today()+'T'+new Date().toTimeString().slice(0,5),[],{required:true}),F('source','text','',[],{required:true,max:120}));
  form(live?'live':'manual',specs,v=>({action:route+'.quote.'+(live?'live':'manual'),body:live?v:{...v,at:new Date(v.at).toISOString()}}));
 }
 function tradeForm(kind,metal='gold'){
  form(kind,[F('metal','select',metal,choices(['gold','silver'])),F('day','date',today(),[],{required:true}),F('box','select','',named(active(lookups.boxes)),{required:true}),
   F('grams','decimal','',[],{required:true}),F('quote','select','',quoteOptions(lookups.quotes),{required:true}),F('fxQuote','select','',optionalOpts(quoteOptions(lookups.fx))),F('reference'),F('note','textarea')],v=>({action:'metals.trade',body:{...v,kind}}),
   {afterRender:f=>{const update=()=>{const dest=lookups.boxes.find(b=>b.id===f.elements.box.value)?.currency,sel=f.elements.quote,last=sel.value;
    const quotes=lookups.quotes.filter(q=>q.base===f.elements.metal.value&&q.at.slice(0,10)<=f.elements.day.value);
    sel.replaceChildren();for(const o of quoteOptions(quotes))sel.add(new Option(o.label,o.value));
    if([...sel.options].some(o=>o.value===last))sel.value=last;
    const base=quotes.find(q=>q.id===sel.value)?.counter,fxSel=f.elements.fxQuote,lastFx=fxSel.value;fxSel.replaceChildren();
    for(const opt of optionalOpts(quoteOptions(lookups.fx.filter(q=>q.base===base&&q.counter===dest&&q.at.slice(0,10)<=f.elements.day.value))))fxSel.add(new Option(opt.label,opt.value));
    if([...fxSel.options].some(o=>o.value===lastFx))fxSel.value=lastFx;fxSel.required=!!base&&base!==dest;fxSel.disabled=!fxSel.required;};
    for(const k of ['metal','box','day','quote'])f.elements[k].addEventListener('change',update);update();}});
 }
 function reversal(r){form('reverse',[F('day','date',today(),[],{required:true}),F('reason','textarea','',[],{required:true})],v=>({action:route+'.reverse',body:{id:r.id,...v}}));}
 function attendanceForm(r={}){
  const id=r.id||uid();form('attendance',[F('employee','select',r.employee||filters.employee,named(active(resources('employee'))),{required:true}),F('day','date',r.day||today(),[],{required:true}),
   F('kind','select',r.kind||'present',choices(events)),F('hours','decimal',r.hours||'0'),F('lateHours','decimal',r.lateHours||'0'),F('quantity','decimal',r.quantity||'0'),
   F('unit','decimal',r.unit||''),F('amount','decimal',r.amount||''),F('box','select',r.box,optionalOpts(named(active(lookups.boxes)))),F('note','textarea',r.note)],
   v=>({action:'payroll.attendance',body:{rows:[{...v,id,version:r.version||0,hours:v.hours||'0',lateHours:v.lateHours||'0',quantity:v.quantity||'0',amount:v.amount||null,unit:v.unit||null,box:v.box||null}]}}),
   {afterRender:f=>{const display={hours:['present','late','half','overtime'],lateHours:['late'],quantity:['piece'],unit:['piece'],amount:['bonus','advance','deduction'],box:['advance']};
    const update=()=>{for(const [k,kinds] of Object.entries(display))f.elements[k].closest('label').hidden=!kinds.includes(f.elements.kind.value);};
    f.elements.kind.onchange=update;update();}});
 }
 function bulkForm(){
  const source=active(resources('employee')).filter(e=>e.status==='active'),ids=new Map(source.map(e=>[e.id,uid()]));
  form('bulk',[F('day','date',today(),[],{required:true}),F('kind','select','present',choices(['present','half','absent'])),
   ...source.map(e=>F('emp_'+e.id,'checkbox',true,[],{caption:e.name}))],async v=>{
    const existing=await all('payroll','attendance',{from:v.day,to:v.day});const shiftsById=new Map(existing.filter(r=>shifts.includes(r.kind)).map(r=>[r.employee,r]));
    const rows=source.filter(e=>v['emp_'+e.id]).map(e=>{const old=shiftsById.get(e.id);
     return {id:old?.id||ids.get(e.id),version:old?.version||0,employee:e.id,day:v.day,kind:v.kind,hours:'0',lateHours:'0',quantity:'0'};});
    if(rows.length===0||rows.length>200)throw Error('INVALID_ATTENDANCE_BATCH');return {action:'payroll.attendance',body:{rows}};
   });
 }
 function payForm(slips){
  if(!slips.length||slips.length>200)throw Error('INVALID_PAYROLL_SELECTION');
  const specs=[F('period','display',slips[0].period),F('day','date',today(),[],{required:true}),F('note','textarea')];
  for(const s of slips){const boxes=active(lookups.boxes).filter(b=>b.currency===s.currency);specs.push(F('box_'+s.employee,'select',s.box||boxes[0]?.id,named(boxes),
   {required:true,caption:s.name+' · '+C.amount(s.remaining,currentLang)+' '+s.currency}));if(slips.length===1)specs.push(F('amount','decimal',s.remaining,[],{required:true}));}
  form('pay',specs,v=>({action:'payroll.pay',body:{period:slips[0].period,day:v.day,note:v.note,employees:slips.map(r=>({employee:r.employee,box:v['box_'+r.employee],expected:C.fixed(C.units(r.remaining)),amount:slips.length===1?v.amount:null}))}}));
 }
 function slip(r){
  const dlg=panel('slip');dlg.append(make('h3',null,r.name+' · '+r.period));const data=make('dl','wf-fin-facts');
  for(const k of ['model','base','additions','deductions','advances','net','paidAmount','remaining','status'])append(data,make('dt',null,t(keyName(k))),make('dd',null,content(r,k)+(numFields.has(k)||k==='base'?' '+r.currency:'')));
  for(const [k,v] of Object.entries(r.breakdown||{}))append(data,make('dt',null,t(k)+' × '+v.count),make('dd',null,C.amount(v.amount,currentLang)+' '+r.currency));
  dlg.append(data);if(can('print'))dlg.append(button('print',()=>printDocument(t('slip'),[make('h2',null,r.name+' · '+r.period),data.cloneNode(true)])));
 }
 function printDocument(title,nodes){
  if(!can('print'))return;
  const frame=make('iframe','wf-fin-print-frame');frame.title=title;document.body.append(frame);
  const doc=frame.contentDocument;doc.documentElement.lang=currentLang;doc.documentElement.dir=currentLang==='ar'?'rtl':'ltr';doc.title=title;
  const style=doc.createElement('style');style.textContent='figure{display:inline-grid;justify-items:center;break-inside:avoid;vertical-align:top;margin:4mm;padding:2mm;max-width:90%}figure img{max-width:100%;max-height:38mm}figcaption,figure bdi,figure strong{display:block}@page{size:'+printPrefs.paper+';margin:14mm}body{font:12px system-ui;color:#171717}h1{font-size:22px;margin-bottom:6px}header{border-bottom:2px solid #8d784b;padding-bottom:8px}table{border-collapse:collapse;width:100%;margin:14px 0}thead{display:table-header-group}tr{break-inside:avoid}td,th{text-align:start;border:1px solid #aaa;padding:5px;white-space:pre-line}dl{display:grid;grid-template-columns:1fr 1fr}dt,dd{margin:0;padding:5px;border-bottom:1px solid #ccc}small{display:block}';
  doc.head.append(style);const h=doc.createElement('header'),label=make('b',null,document.querySelector('#navTitle')?.textContent||'WOW Furniture');h.append(label,make('h1',null,title),make('time',null,fmtDate(new Date().toISOString(),currentLang)));doc.body.append(h);
  const logo=document.querySelector('#navLogo img');if(printPrefs.logo&&logo){const img=doc.createElement('img');const src=logo.getAttribute('src')||'';
   if(src.startsWith('data:image/')||new URL(src,location.href).origin===location.origin){img.src=logo.src;img.alt='';img.width=72;h.prepend(img);}}
  for(const n of nodes)doc.body.append(doc.importNode(n,true));if(printPrefs.footer)doc.body.append(make('footer',null,printPrefs.footer));
  const finish=()=>frame.remove();frame.contentWindow.addEventListener('afterprint',finish,{once:true});Promise.allSettled([...doc.images].map(img=>img.decode?.())).then(()=>{if(!visible()){finish();return;}frame.contentWindow.focus();frame.contentWindow.print();});setTimeout(finish,120000);
 }
 const printPrefs={paper:'A4',footer:'',logo:true};
 function printRows(items,cols,title){printDocument(t(title),[createTable(items,cols)]);}
 function printOptions(){
  const dlg=panel('print'),f=make('form','wf-fin-form'),go=make('button','btn btn-p',t('print'));go.type='submit';
  append(f,field(F('paper','select',printPrefs.paper,choices(['A4','Letter']))),field(F('footer','text',printPrefs.footer)),field(F('logo','checkbox',printPrefs.logo)),go);dlg.append(f);
  f.onsubmit=async e=>{e.preventDefault();go.disabled=true;try{const v=values(f);printPrefs.paper=v.paper==='Letter'?'Letter':'A4';printPrefs.footer=v.footer;printPrefs.logo=v.logo;
   const data=await all(route,tab,filters);if(visible()&&dialog===dlg){closeDialog();printRows(data,fields(),tab);}}catch(err){showError(err);}finally{go.disabled=false;}};
 }
 async function exportCSV(){
  if(!can('export'))return;const captured=tab,data=await all(route,captured,filters);if(!visible()||captured!==tab)return;
  const fieldsForExport=fields(),exportRows=data.map(r=>({...r,...obj(fieldsForExport.filter(k=>k==='box'||k==='status'||k==='valuations'||k==='category').map(k=>[k,content(r,k)]))}));
  download('WOW-'+route+'-'+tab+'-'+today()+'.csv',csvBlob(C.csv(exportRows,fieldsForExport,k=>t(keyName(k)))));
 }
 async function archive(scope=route){
  const commands=[];let after=0,until=null,w;
  do{const page=await api.request('finance.archive',{scope,after,until,limit:100});if(!visible())return;
   if(!Array.isArray(page.commands))throw Error('INVALID_ARCHIVE');until=page.until;w=page.workspace;if(!page.commands.length)break;
   commands.push(...page.commands);const next=page.commands.at(-1).seq;if(next<=after)throw Error('INVALID_ARCHIVE_CURSOR');after=next;
  }while(after<until);
  download('WOW-'+scope+'-'+today()+'.json',new Blob([JSON.stringify({format:'wow.finance.v1',workspace:w,scope,commands})],{type:'application/json'}));
 }
 function restore(){
  const dlg=panel('restore'),file=field(F('file','file','',[],{accept:'.json,application/json'})),pre=make('div','wf-fin-restore'),err=make('p');err.setAttribute('role','alert');append(dlg,file,pre,err);
  file.querySelector('input').onchange=async e=>{const chosen=e.target.files?.[0];if(!chosen)return;pre.replaceChildren();err.textContent='';
   try{let a=await readFile(chosen);if(!visible()||dialog!==dlg)return;
    if(a.format!=='wow.finance.v1'){
     a=await C.legacyCommands(a,api.getSession().workspaceId,route);if(!visible()||dialog!==dlg)return;
     pre.append(make('h3',null,t('legacy')),make('p',null,t('retain')));
     for(const r of a.inventory)pre.append(described(r.table,r.present?String(r.records):'—'));
     if(a.excludedSettings.length)pre.append(described('settingsSkipped',a.excludedSettings.join(', ')));
    }
    if((a.scope!==route&&a.scope!=='all')||!Array.isArray(a.commands))throw Error('INVALID_ARCHIVE');
    if(!a.commands.length){pre.append(described('newRows','0'));return;}
    let payload={scope:a.scope,workspace:a.workspace,commands:a.commands.map(({action,data})=>({action,data}))};
    if(payload.commands.length>350||chosen.size>6*1024*1024){
     const commands=payload.commands,stage=uid();let start=0;
     while(start<commands.length){let bytes=0,end=start;
      while(end<commands.length&&end-start<350){const size=new TextEncoder().encode(JSON.stringify(commands[end])).length;if(end>start&&bytes+size>5*1024*1024)break;bytes+=size;end++;}
      await api.request('finance.restore.stage',{scope:a.scope,workspace:a.workspace,stage,start,total:commands.length,commands:commands.slice(start,end)});
      if(!visible()||dialog!==dlg)return;start=end;
     }payload={scope:a.scope,workspace:a.workspace,stage};
    }
    const validated=await api.request('finance.restore',{...payload,commandId:uid(),preview:true});
    if(!visible()||dialog!==dlg)return;pre.append(described('newRows',validated.new),described('existing',validated.existing));const cmd=uid();
    const apply=button('restore',async()=>{apply.disabled=true;try{await api.request('finance.restore',{...payload,commandId:cmd,preview:false});if(visible()&&dialog===dlg){closeDialog();await refresh(true);status.textContent=t('saved');}}finally{apply.disabled=false;}},true);pre.append(apply);
   }catch(error){showError(error);}};
 }
 function toolbar(){
  actions.replaceChildren();const add=(k,fn,primary=false)=>actions.append(button(k,fn,primary));
  if(can('edit')){
   if(tab==='barcodes')add('generate',()=>barcodeForm(),true);
   if(tab==='boxes')add('add',()=>resourceForm('box'),true);
   if(tab==='ledger'&&route==='finance'){add('income',()=>transactionForm('income'),true);add('expense',()=>transactionForm('expense'));add('transfer',transferForm);}
   if(tab==='resources'){if(route==='payroll')add('employee',()=>resourceForm('employee'),true);else{add('vendor',()=>resourceForm('vendor'),true);add('category',()=>resourceForm('category'));}}
   if(tab==='attendance'){add('attendance',()=>attendanceForm(),true);add('bulk',bulkForm);}
   if(tab==='slips'){add('bulkPay',()=>payForm(rows.filter(r=>selected.has(r.employee))),true);add('payAll',()=>payForm(rows.filter(r=>r.eligible&&!r.paid&&C.units(r.remaining)>0n)));}
   if(['holdings','ledger'].includes(tab)&&route==='metals'){add('buy',()=>tradeForm('buy'),true);add('sell',()=>tradeForm('sell'));}
   if(route==='metals'&&tab==='holdings'&&api.getSession()?.role==='owner')add('metalOpening',()=>form('metalOpening',[F('metal','select','gold',choices(['gold','silver'])),F('grams','decimal','',[],{required:true}),F('day','date',today(),[],{required:true}),F('reference','text','',[],{required:true})],v=>({action:'metals.opening',body:v})));
   if(tab==='quotes'){add('manual',()=>quoteForm(false),true);add('live',()=>quoteForm(true));}
  }
  if(tab==='customers'&&api.can('customers.edit'))add('add',()=>api.open('add-company'));
  if(tab==='invoices'&&api.can('invoices.edit'))add('add',()=>api.open('create-invoice'));
  if(tab==='boxes'&&api.can('settings.view'))add('settings',()=>api.open('settings'));
  if(tab==='barcodes'&&can('print'))add('printAll',async()=>{const entries=(await all(route,'barcodes',filters)).filter(r=>r.active!==false);if(visible())printDocument(t('barcodes'),entries.map(r=>labelGraphic(r).card));});
  if((tab==='invoices'||tab==='barcodes')&&api.can('invoices.edit'))add('barcode',()=>api.open('quick-barcode'));
  add('refresh',()=>refresh(true));if(!['audit','resources','customers','legacy'].includes(tab))add(hideAmounts?'showAmounts':'hideAmounts',()=>{hideAmounts=!hideAmounts;paint();});
  if(can('print'))add('print',printOptions);
  if(can('export'))add('csv',exportCSV);
  if(['audit','legacy'].includes(tab)&&api.getSession()?.role==='owner'){add('backup',()=>archive());add('backupAll',()=>archive('all'));add('restore',restore);}
 }
 const receiptOff=api.subscribeReceipts?.(r=>{if(!visible()||!(r.action?.startsWith(route+'.')||route==='payroll'&&r.action==='finance.attach'))return;
  if(r.status==='posted'){deferred.delete(r.queueId);renderPending();if(!dialog)refresh(true);}
  else if(['failed','conflict'].includes(r.status)){deferred.set(r.queueId,{action:r.action,state:r.status==='conflict'?'conflict':'failed',error:r.errorCode});renderPending();}
 });
 try{const queue=await api.listOutbox?.()||[];for(const r of queue)if(r.action.startsWith(route+'.'))deferred.set(r.queueId,{action:r.action,state:r.status==='pending'?'queued':r.status==='conflict'?'conflict':'failed',error:r.errorCode});
  if(['slips','attendance'].includes(tab))filters.period=currentMonth();renderPending();tabs();toolbar();await refresh();
 }catch(e){receiptOff?.();throw e;}
 return {updateLanguage(next){currentLang=next;if(visible()){paint();renderPending();}},hasUnsavedChanges:()=>dirty,
  dispose(){disposed=true;generation++;ctrl.abort();receiptOff?.();closeDialog();selected.clear();deferred.clear();draftFileIds=new WeakMap();shell.remove();}};
}
for(const [route,icon] of Object.entries({finance:'wallet',payroll:'users',metals:'coins'}))registry.register({id:route,
 title:objTitle(route),permission:route+'.view',icon,mount});
function objTitle(key){return Object.fromEntries(C.languages.map(lang=>[lang,C.t(lang,key)]));}
})(typeof window==='object'?window:globalThis);
