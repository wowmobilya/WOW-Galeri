// Public requests carry exact decimal strings. PostgreSQL owns balances, payroll and rounding.
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const currencies = ['USD','TRY','EUR','SYP'];
const scopes = ['finance','payroll','metals'];
const kinds = ['box','vendor','category','barcode','employee'];
const dayKinds = ['present','absent','half','late','piece','overtime','bonus','advance','deduction'];
function fail(code='INVALID_FINANCE_INPUT',status=422) { throw Object.assign(Error(code),{code,status}); }
const plain = v => !!v && typeof v==='object' && !Array.isArray(v);
function text(v,max=200,required=false) {
  if (v==null && !required) return '';
  if (typeof v!=='string' || v.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)) fail();
  const trimmed=v.trim().normalize('NFC'); if (required && !trimmed) fail(); return trimmed;
}
function choice(v,choices) { if (!choices.includes(v)) fail(); return v; }
function id(v) { if (typeof v!=='string' || !UUID.test(v)) fail(); return v.toLowerCase(); }
function integer(v,min,max) { if (!Number.isSafeInteger(v)||v<min||v>max) fail(); return v; }
function decimal(v,scale=2,allowZero=true) {
  if (typeof v!=='string' || !new RegExp('^(0|[1-9]\\d{0,9})(?:\\.\\d{1,'+scale+'})?$').test(v)) fail();
  if (!allowZero && !/[1-9]/.test(v)) fail(); return v;
}
function day(v) {
  if (typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||v<'1900-01-01'||v>'9999-12-31') fail();
  const t=Date.parse(v+'T00:00:00Z'); if (!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==v) fail();return v;
}
function period(v) { if (typeof v!=='string'||day(v+'-01').slice(0,7)!==v) fail(); return v; }
function time(v) {
  if (typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v)||!/(Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))) fail();
  return new Date(v).toISOString();
}
function box(v) { return currencies.some(c=>v==='main:'+c)?v:id(v); }
function typedId(v) { if (typeof v==='number') return integer(v,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);return text(v,180,true); }
function optional(v,fn) {return v==null||v===''?null:fn(v);}
function array(v,max,mapper,min=0) { if(!Array.isArray(v)||v.length>max||v.length<min) fail();return v.map(mapper); }
function distinct(rows,key) { if(new Set(rows.map(r=>r[key])).size!==rows.length)fail();return rows; }
function labels(v) {
  if (!plain(v)) fail(); const names={};
  for (const lang of ['ar','tr','en','fr','ru']) if(v[lang])names[lang]=text(v[lang],120);
  return names;
}
const version=v=>integer(v??0,0,2147483646);
const currency=v=>choice(v,currencies);
const metal=v=>choice(v,['gold','silver']);
const checkedBool=v=>{if(typeof v!=='boolean')fail();return v;};
function resource(b,employee=false) {
  const kind=employee?'employee':choice(b.kind,kinds.slice(0,4));
  const p=b.profile;if(!plain(p))fail();
  const profile={name:text(p.name,120,true),active:checkedBool(p.active??true)};
  if(kind==='box'||kind==='category')Object.assign(profile,{labels:labels(p.labels??{}),color:choice(p.color??'gold',['gold','green','blue','red','silver','purple'])});
  if(kind==='box')Object.assign(profile,{currency:currency(p.currency),threshold:decimal(p.threshold??'0')});
  if(kind==='category')profile.direction=choice(p.direction??'both',['income','expense','both']);
  if(kind==='barcode'){
    const format=choice(p.format,['CODE128','EAN13','QR']);let code=text(p.code,512,true);
    if(format==='CODE128'&&!/^[\x20-\x7e]{1,160}$/.test(code))fail('INVALID_BARCODE');
    if(format==='EAN13'){
      if(!/^\d{12,13}$/.test(code))fail('INVALID_BARCODE');
      const twelve=code.slice(0,12),sum=[...twelve].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0),full=twelve+String((10-sum%10)%10);
      if(code.length===13&&code!==full)fail('INVALID_BARCODE');code=full;
    }
    Object.assign(profile,{format,code,price:decimal(p.price??'0'),currency:currency(p.currency)});
  }
  if(kind==='vendor'||employee)Object.assign(profile,{phone:text(p.phone,50),phone2:text(p.phone2,50),email:text(p.email,254),notes:text(p.notes,1000)});
  if(kind==='vendor')Object.assign(profile,{company:text(p.company,150),city:text(p.city,120),address:text(p.address,300),taxNumber:text(p.taxNumber,100)});
  if(employee)Object.assign(profile,{position:text(p.position,100),department:text(p.department,100),start:optional(p.start,day),
    status:choice(p.status??'active',['active','inactive','leave','terminated']),model:choice(p.model,['monthly','daily','hourly','piece']),
    currency:currency(p.currency),rate:decimal(p.rate),absence:decimal(p.absence??'0'),lateRate:decimal(p.lateRate??'0'),
    overtimeRate:decimal(p.overtimeRate??'0',4),multiplier:decimal(p.multiplier??'1.5',3),days:integer(p.days??26,1,31),
    hours:decimal(p.hours??'8',2,false),box:optional(p.box,box),avatar:optional(p.avatar,id)});
  return {kind,id:id(b.id),version:version(b.version),profile,legacy:optional(b.legacy,id),
    ...(kind==='box'?{opening:decimal(b.opening??'0'),day:day(b.day)}:{})};
}
function party(b) {
  if(b==null) return null;if(!plain(b))fail();
  return {type:choice(b.type,['customer','vendor']),id:b.type==='customer'?typedId(b.id):id(b.id)};
}
function transaction(b) {
  return {kind:choice(b.kind,['income','expense']),box:box(b.box),amount:decimal(b.amount,2,false),currency:currency(b.currency),
    day:day(b.day),description:text(b.description,240,true),note:text(b.note,1500),reference:text(b.reference,140),
    party:party(b.party),category:optional(b.category,id),method:choice(b.method??'cash',['cash','bank','card','cheque','other']),fxQuote:optional(b.fxQuote,id),attachments:array(b.attachments??[],5,id),replaces:optional(b.replaces,id)};
}
function attendanceRow(r) {
  if(!plain(r))fail(); return {id:id(r.id),version:version(r.version),employee:id(r.employee),kind:choice(r.kind,dayKinds),day:day(r.day),
    hours:decimal(r.hours??'0',2),lateHours:decimal(r.lateHours??'0',2),quantity:decimal(r.quantity??'0',3),
    unit:optional(r.unit,v=>decimal(v,4)),amount:optional(r.amount,v=>decimal(v)),box:optional(r.box,box),note:text(r.note,500)};
}
function quote(b) {
  const base=choice(b.base,[...currencies,'gold','silver']),counter=currency(b.counter);if(base===counter)fail();
  return {base,counter};
}
function page(b) {return {offset:integer(b.offset??0,0,10000000),limit:integer(b.limit??50,1,200)};}
function filters(b) {
  const from=optional(b.from,day),to=optional(b.to,day); if(from && to && from>to)fail();
  return {...page(b),from,to,box:optional(b.box,box),kind:text(b.kind,35),currency:optional(b.currency,currency),
    category:optional(b.category,id),party:party(b.party),employee:optional(b.employee,id),search:text(b.search,100),metal:optional(b.metal,metal),
    period:optional(b.period,period),resource:optional(b.resource,v=>choice(v,kinds)),base:optional(b.base,v=>choice(v,[...currencies,'gold','silver'])),legacyTable:optional(b.legacyTable,v=>choice(v,legacyTables))};
}
const legacyTables=['transactions','invoices','customers','suppliers','employees','categories','cashboxes','metals','metalTx','metalPrices','transfers','rates','barcodes','statements','attendance','settings'];
function legacyScope(table,r) {
  if(['employees','attendance'].includes(table)||['transactions','statements'].includes(table)&&String(r.entity_type).toLowerCase()==='employee')return 'payroll';
  return ['metals','metalTx','metalPrices'].includes(table)?'metals':'finance';
}
function historicRecord(scope,b) {
  const table=choice(b.table,legacyTables),record=b.record;
  if(!plain(record)||Object.keys(record).length>160||JSON.stringify(record).length>1200000||scope!==legacyScope(table,record))fail('INVALID_LEGACY_RECORD');
  // Settings may have been hand-extended with connection and authentication secrets.
  if(/"(?:password|access_token|refresh_token|service_role|api_key|private_key|secret_key)"\s*:/i.test(JSON.stringify(record)))fail('INVALID_LEGACY_SECRET');
  if(table==='settings'&&Object.keys(record).some(k=>!['id','company_name','company_name_ar','company_name_en','company_name_tr','company_phone','company_email','company_address',
    'default_currency','language','theme','font_size','notif_overdue','notif_low_balance','notif_salary','print_logo','print_watermark','print_header','print_footer','print_paper_size','created_at','updated_at'].includes(k)))fail('INVALID_LEGACY_SETTINGS');
  return {table,sourceId:typedId(b.sourceId),record};
}
const tabOptions={finance:['boxes','resources','customers','invoices','ledger','quotes','reports','statement','barcodes','audit','legacy'],payroll:['boxes','resources','attendance','slips','ledger','statement','audit','legacy'],
  metals:['boxes','holdings','ledger','quotes','fx','audit','legacy']};
const validators={
  'finance.resource':b=>resource(b),
  'finance.transaction':transaction,
  'finance.transfer':b=>({fromBox:box(b.fromBox),toBox:box(b.toBox),amount:decimal(b.amount,2,false),quote:optional(b.quote,id),
    day:day(b.day),reference:text(b.reference,140),note:text(b.note,1000)}),
  'payroll.employee':b=>resource(b,true),
  'payroll.attendance':b=>({rows:distinct(array(b.rows,200,attendanceRow,1),'id')}),
  'payroll.remove':b=>({id:id(b.id),version:version(b.version)}),
  'payroll.pay':b=>({period:period(b.period),day:day(b.day),note:text(b.note,500),employees:distinct(array(b.employees,200,e=>({
    employee:id(e.employee),box:box(e.box),expected:decimal(e.expected,2,false),amount:optional(e.amount,v=>decimal(v,2,false))}),1),'employee')}),
  'metals.opening':b=>({metal:metal(b.metal),grams:decimal(b.grams,4,false),day:day(b.day),reference:text(b.reference,140,true)}),
  'metals.trade':b=>({metal:metal(b.metal),kind:choice(b.kind,['buy','sell']),grams:decimal(b.grams,4,false),quote:id(b.quote),
    fxQuote:optional(b.fxQuote,id),box:box(b.box),day:day(b.day),note:text(b.note,1000),reference:text(b.reference,140)}),
  'finance.archive':b=>({scope:choice(b.scope,[...scopes,'all']),after:integer(b.after??0,0,Number.MAX_SAFE_INTEGER),
    until:b.until==null?null:integer(b.until,0,Number.MAX_SAFE_INTEGER),limit:integer(b.limit??40,1,100)}),
  'finance.attachment':b=>({id:id(b.id),scope:choice(b.scope,['finance','payroll'])})
};
const reads=new Set(['finance.archive','finance.attachment']);
for (const s of scopes) {
  validators[s+'.legacy.detail']=b=>({id:id(b.id)});reads.add(s+'.legacy.detail');
  validators[s+'.legacy.record']=b=>historicRecord(s,b);
  validators[s+'.legacy.link']=b=>({id:id(b.id),version:version(b.version),target:typedId(b.target)});
  validators[s+'.list']=b=>({tab:choice(b.tab,tabOptions[s]),...filters(b)});reads.add(s+'.list');
  validators[s+'.reverse']=b=>({id:id(b.id),day:day(b.day),reason:text(b.reason,500,true)});
}
for (const s of ['metals','finance']) {
  for(const mode of ['manual','live']) validators[s+'.quote.'+mode]=b=>{
    const pair=quote(b);if((s==='metals')!==['gold','silver'].includes(pair.base))fail();
    if(s==='metals'&&mode==='live'&&pair.counter!=='USD')fail();
    return mode==='manual'?{...pair,rate:decimal(b.rate,8,false),at:time(b.at),source:text(b.source,120,true)}:pair;
  };
}
function asset(b) {
  const file=b.file;if(!plain(file))fail();
  const type=choice(file.mime,['image/jpeg','image/png','image/webp','application/pdf']);
  const limit=type==='application/pdf'?4*1024*1024:768*1024;
  const raw=file.data;if(typeof raw!=='string'||raw.length>Math.ceil(limit/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))fail();
  let decoded;try{decoded=atob(raw);}catch{fail();} if(decoded.length<12||decoded.length>limit)fail();
  const has=(offset,bytes)=>bytes.every((v,i)=>decoded.charCodeAt(offset+i)===v);
  if(!(type==='image/jpeg'&&has(0,[255,216,255])||type==='image/png'&&has(0,[137,80,78,71,13,10,26,10])||
    type==='image/webp'&&decoded.startsWith('RIFF')&&decoded.slice(8,12)==='WEBP'||type==='application/pdf'&&decoded.startsWith('%PDF-')))fail();
  return {file:{mime:type,name:text(file.name,140,true),data:raw},scope:choice(b.scope,['finance','payroll'])};
}
validators['finance.attach']=asset;
export function validateFinanceAction(a,b) {
  if(!plain(b)||!Object.hasOwn(validators,a))fail();
  const result=validators[a](b);if(!reads.has(a))result.commandId=id(b.commandId);return result;
}

// A provider adapter runs in Edge only after its licence, units, timestamp and availability have been verified.
function observation(value,pair) {
  if(!plain(value))fail('QUOTE_UNAVAILABLE',503);
  const raw=decimal(value.raw,8,false),at=time(value.at),source=text(value.source,120,true);
  const unit=choice(value.unit,['gold','silver'].includes(pair.base)?['gram','troy_ounce']:['currency']);
  if(Date.parse(at)>Date.now()+300000)fail('INVALID_QUOTE');
  return {raw,at,unit,source};
}
export function createFinanceActions({moduleRpc,quoteProvider}) {
  const invoke=(a,b,actor)=>moduleRpc('wow_finance_service',a,{...b,userId:actor.userId,sessionId:actor.sessionId});
  const result=Object.fromEntries(Object.keys(validators).map(action=>[action,async({body,actor})=>{
    const data=validateFinanceAction(action,body);
    if(action.endsWith('.quote.live')){
      const existing=await invoke(action+'.check',data,actor);if(existing.receipt)return existing.receipt;
      if(typeof quoteProvider!=='function')fail('QUOTE_UNAVAILABLE',503);
      try{data.observation=observation(await quoteProvider({base:data.base,counter:data.counter}),data);}
      catch{fail('QUOTE_UNAVAILABLE',503);}
    }
    return invoke(action,data,actor);
  }]));
  function importCommands(b) {
    const commands=array(b.commands,400,c=>{
      if(!plain(c)||reads.has(c.action)||c.action==='finance.attach'&&b.scope==='metals')fail();
      const data=validateFinanceAction(c.action,c.data);
      if(c.action.endsWith('.quote.live'))data.observation=observation(c.data.observation,data);
      return {action:c.action,data};
    },1);
    return commands;
  }
  result['finance.restore.stage']=async({body,actor})=>invoke('finance.restore.stage',{
    scope:choice(body.scope,[...scopes,'all']),workspace:id(body.workspace),stage:id(body.stage),start:integer(body.start,0,100000),
    total:integer(body.total,1,100000),commands:importCommands(body)},actor);
  result['finance.restore']=async({body,actor})=>invoke('finance.restore',{
    scope:choice(body.scope,[...scopes,'all']),workspace:id(body.workspace),...(body.stage?{stage:id(body.stage)}:{commands:importCommands(body)}),
    preview:checkedBool(body.preview),commandId:id(body.commandId)},actor);
  return result;
}
