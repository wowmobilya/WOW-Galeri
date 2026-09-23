/* WOW task memory: data-only, bounded and independent of the language provider. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WOWAssistantAgent=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v)), plain=v=>v&&typeof v==='object'&&!Array.isArray(v), text=(v,n=6000)=>typeof v==='string'?v.slice(0,n):'';
 const intents=['create_invoice','update_invoice','create_client','update_client','create_product','update_product','add_payment','delete_record','search','account_statement','dashboard_summary','open_page','preview_invoice','export_pdf','export_excel','share_pdf','share_excel','print_invoice','backup','help'];
 const norm=v=>String(v||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0300-\u036f]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ı/g,'i').toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.').replace(/\s+/g,' ').trim();
 const values={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,sifir:0,bir:1,iki:2,uc:3,dort:4,bes:5,alti:6,yedi:7,sekiz:8,dokuz:9,on:10,yirmi:20,otuz:30,kirk:40,elli:50,altmis:60,yetmis:70,seksen:80,doksan:90,صفر:0,واحد:1,وحده:1,اثنين:2,اثنان:2,اتنين:2,ثنين:2,ثلاث:3,ثلاثه:3,تلاته:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10,عشرين:20,عشرون:20,ثلاثين:30,ثلاثون:30,تلاتين:30,اربعين:40,اربعون:40,خمسين:50,خمسون:50,ستين:60,ستون:60,سبعين:70,سبعون:70,ثمانين:80,ثمانون:80,تمانين:80,تسعين:90,تسعون:90,ميتين:200,مئتين:200,مائتين:200,الفين:2000};
 function number(raw){
  let s=norm(raw).replace(/،/g,',');if(!String(raw).includes('٫')&&/^[1-9]\d{0,2}\.\d{3}$/.test(s))return null;if(s.includes(',')){if(/^\d+,\d{1,2}$/.test(s))s=s.replace(',','.');else return null;}if(s.includes('٬')){if(!/^\d{1,3}(?:٬\d{3})+(?:\.\d+)?$/.test(s))return null;s=s.replace(/٬/g,'');}if(/^\d+(?:\.\d+)?$/.test(s)){const n=Number(s);return Number.isFinite(n)&&n<=1e12?n:null;}
  s=s.replace(/ثلاثميه|تلتميه|تلاتميه/g,'ثلاث ميه').replace(/اربعم(?:يه|ائه)/g,'اربع ميه').replace(/خمسم(?:يه|ائه)/g,'خمس ميه').replace(/ستميه/g,'ست ميه').replace(/سبعميه/g,'سبع ميه').replace(/ثمانميه/g,'ثمان ميه').replace(/تسعميه/g,'تسع ميه');
  const pieces=s.split(/\s+|-/).filter(Boolean);if(!pieces.length||pieces.length>16)return null;
  let total=0,group=0,seen=false,lastUnit=false;
  for(let token of pieces){if(token==='and'||token==='و')continue;if(token.startsWith('و')&&token!=='واحد'&&token!=='وحده')token=token.slice(1);
   if(['hundred','yuz','ميه','مئه','مائه'].includes(token)){group=(group||1)*100;lastUnit=false;seen=true;}
   else if(['thousand','bin','الف','الاف'].includes(token)){total+=(group||1)*1000;group=0;lastUnit=false;seen=true;}
   else if(Object.hasOwn(values,token)){const v=values[token];if(lastUnit&&v<10)return null;group+=v;lastUnit=v<10;seen=true;}
   else return null;
  }return seen&&total+group<=1e12?total+group:null;
 }
 function safeCommand(c){if(!plain(c)||!intents.includes(c.intent))return null;const json=JSON.stringify(c);if(json.length>40000||/"(?:__proto__|prototype|constructor)"\s*:/.test(json))return null;return clone(c);}
 function workspace(v){
  v=plain(v)?v:{};const last=plain(v.lastRecord)&&['companies','products','invoices','payments'].includes(v.lastRecord.store)?{store:v.lastRecord.store,id:text(v.lastRecord.id,150),reference:text(v.lastRecord.reference,250),intent:text(v.lastRecord.intent,60)}:null;
  return {version:1,updatedAt:text(v.updatedAt,40),history:(Array.isArray(v.history)?v.history:[]).filter(r=>plain(r)&&['user','assistant'].includes(r.role)&&typeof r.text==='string').slice(-60).map(r=>({role:r.role,text:text(r.text,2000),error:!!r.error})),command:safeCommand(v.command),selections:Object.fromEntries(Object.entries(plain(v.selections)?v.selections:{}).filter(([k,val])=>/^(client|product|invoice|target|items\.\d{1,3}\.product)$/.test(k)&&['string','number'].includes(typeof val)).slice(0,100)),operationId:/^[\w-]{16,100}$/.test(v.operationId||'')?v.operationId:'',blocked:!!v.blocked,backendChoices:(Array.isArray(v.backendChoices)?v.backendChoices:[]).filter(r=>plain(r)&&r.label&&r.message).slice(0,8).map(r=>({label:text(r.label,160),message:text(r.message,600)})),lastRecord:last?.id?last:null,queue:(Array.isArray(v.queue)?v.queue:[]).filter(r=>typeof r==='string'&&r.trim()).slice(0,6).map(r=>text(r,3000))};
 }
 function queryFor(c,k){if(k==='target')return c.query;if(k.startsWith('items.'))return c.items?.[Number(k.split('.')[1])]?.query;return c[k+'Query'];}
 function retainSelections(before,after,selected){
  if(!before||!after||before.intent!==after.intent||before.target!==after.target)return {};
  return Object.fromEntries(Object.entries(selected||{}).filter(([k])=>{const a=queryFor(before,k),b=queryFor(after,k);return typeof a==='string'&&norm(a)===norm(b);}));
 }
 function previous(command,selections,last,snapshot){
  if(command){const out=clone(command);for(const [key,id] of Object.entries(selections||{})){const kind=key.startsWith('items.')?'product':key==='target'?command.target:key;const store={client:'companies',product:'products',invoice:'invoices',payment:'payments'}[kind];const row=snapshot[store]?.find(r=>String(r.id)===String(id));if(!row)continue;
   const label=row.invNo||row.name;if(!label)continue;if(key.startsWith('items.')){const i=Number(key.split('.')[1]);if(out.items?.[i])out.items[i].query=label;}else out[key==='target'?'query':key+'Query']=label;
  }return out;}
  if(!last)return null;const row=snapshot[last.store]?.find(r=>String(r.id)===String(last.id));if(!row)return null;
  if(last.store==='invoices')return {intent:'update_invoice',invoiceQuery:row.invNo};
  if(last.store==='companies')return {intent:'update_client',clientQuery:row.name};
  if(last.store==='products')return {intent:'update_product',productQuery:row.name};return null;
 }
 function context(history,facts){
  const ref=facts.previous?.intent==='update_invoice'?(facts.snapshot?.invoices||[]).find(r=>norm(r.invNo)===norm(facts.previous.invoiceQuery)):null;
  const record=ref?{invoice:ref.invNo,customer:text(ref.companyName,80),items:(ref.items||[]).slice(0,8).map(r=>({model:text((facts.snapshot?.products||[]).find(p=>String(p.id)===String(r.productId))?.name||r.name,60),quantity:r.qty,color:text(r.color,30)})),moreItems:(ref.items||[]).length>8}:null;
  const state={record,active:!!facts.previous,previousTask: facts.previous?.intent||null,lastSaved: facts.lastRecord||null,pendingSteps:facts.queue||[],note:'Facts from the app. A saved record is not an unsaved draft. Ask about missing details; never claim a commit.'};
  return [{role:'assistant',text:JSON.stringify(state).slice(0,1400)},...(history||[]).slice(-5).map(r=>({role:r.role,text:text(r.text,1400)}))];
 }
 function edit(raw,previous,snapshot){
  if(!previous||!['create_invoice','update_invoice'].includes(previous.intent))return null;
  let s=norm(raw);if(/^(?:لا |مو |ليس |dont |don't |do not |not |hayir )/.test(s))return null;
  const c=clone(previous);let field,tail,selectionHints={};
  const ar=s.match(/^(?:(?:خلي|خل|اجعل|عدل|عدلي|غير|غيرلي|حط|حطلي|سجل|ضيف|اضف)\s+)?(?:ال)?(عربون|مقدم|خصم|حسم|كميه|عدد|سعر)(?:\s+(?:يكون|يصير|الي|الى|ل|هو))?\s+(.+)$/);
  const en=s.match(/^(?:(?:set|change|make|update)\s+(?:the\s+)?)?(deposit|discount|quantity|price)(?:\s+to)?\s+(.+)$/);
  const tr=s.match(/^(kapora(?:yi)?|indirim(?:i)?|miktar(?:i)?|fiyat(?:i)?)\s+(.+?)(?:\s+(?:yap|olsun))?$/);
  const m=ar||en||tr;if(!m)return null;
  field=/عربون|مقدم|deposit|kapora/.test(m[1])?'deposit':/خصم|حسم|discount|indirim/.test(m[1])?'discount':/كميه|عدد|quantity|miktar/.test(m[1])?'quantity':'unitPrice';tail=m[2];
  let currency;const currencies=[['USD',/\s+(?:دولار|دولارات|usd|dollars?|dolar)$/],['EUR',/\s+(?:يورو|يوروهات|eur|euros?|avro)$/],['TRY',/\s+(?:ليره|ليرات|try|tl|lira|turkish lira)$/]];
  for(const [cur,re]of currencies)if(re.test(tail)){currency=cur;tail=tail.replace(re,'');break;}
  const n=number(tail);if(n===null)return null;
  if(['quantity','unitPrice'].includes(field)){if(!c.items?.length && c.intent==='update_invoice' && snapshot){const rows=(snapshot.invoices||[]).filter(r=>norm(r.invNo)===norm(c.invoiceQuery));if(rows.length===1&&rows[0].items?.length===1){const item=rows[0].items[0],product=(snapshot.products||[]).find(r=>String(r.id)===String(item.productId));if(!product)return null;c.items=[{query:product.name}];selectionHints={invoice:rows[0].id,'items.0.product':product.id};}}if(c.items?.length!==1)return null;c.items[0][field]=n;if(currency)c.items[0].currency=currency;}
  else {c[field]=n;if(currency)c[field+'Currency']=currency;}
  return {command:c,field,value:n,selectionHints};
 }
 function split(raw){const s=String(raw).trim();if(/ملاحظ|notes?\s*:|notlar|["“”]/iu.test(s))return[s];const parts=s.split(/\s+(?:و?بعدين|و?بعدها|ثم|and then|then|ve sonra|sonra)\s+/iu).map(v=>v.trim()).filter(Boolean);return parts.length>6?[s]:parts;}
 const forbidden=/^(?:احفظ|حفظ|حذف|احذف|الغاء|الغ|نعم|لا|save|delete|cancel|yes|no|kaydet|sil|iptal|evet|hayir)$/;
 function learning(v){
  if(!plain(v)||v.version!==1||JSON.stringify(v).length>150000)throw new Error('learning_invalid');
  const rows=(list,keys)=>{if(list===undefined)return[];if(!Array.isArray(list)||list.length>200)throw new Error('learning_invalid');return list.map(r=>{if(!plain(r))throw new Error('learning_invalid');const out={};for(const key of keys){const value=r[key];if(typeof value!=='string'||!value.trim()||value.length>160||/[<>\u0000-\u001f]/.test(value))throw new Error('learning_invalid');out[key]=value.trim();}if(forbidden.test(norm(out[keys[0]])))throw new Error('learning_invalid');if(keys[0]==='word'&&r.locale!==undefined){if(!['ar','tr','en'].includes(r.locale))throw new Error('learning_invalid');out.locale=r.locale;}return out;});};
  return {version:1,phrases:rows(v.phrases,['phrase','meaning']),pronunciations:rows(v.pronunciations,['word','spoken'])};
 }
 function expand(input,data){let output=String(input);for(const row of (data?.phrases||[]).slice().sort((a,b)=>b.phrase.length-a.phrase.length)){const escaped=row.phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');output=output.replace(new RegExp('(^|[^\\p{L}\\p{N}])('+escaped+')(?=$|[^\\p{L}\\p{N}])','giu'),(_,prefix)=>prefix+row.meaning);}return output.slice(0,6000);}
 function teach(raw){
  const s=String(raw||'').trim();let m=s.match(/^(?:تعلم|تعلّم|تذكر|تذكّر)(?:\s+ان|\s+أن)?\s+(.{2,100}?)\s+(?:يعني|معناه|معناها)\s+(.{2,100})$/u)||s.match(/^(?:remember|learn)\s+(.{2,100}?)\s+means\s+(.{2,100})$/iu)||s.match(/^(.{2,100}?)\s+demek\s+(.{2,100}?)\s+(?:ogren|öğren|hatirla|hatırla)$/iu);
  return m?{phrase:m[1].trim(),meaning:m[2].trim()}:null;
 }
 function fingerprint(value){let a=2166136261,b=2246822519;for(const ch of String(value||'')){a=Math.imul(a^ch.charCodeAt(0),16777619);b=Math.imul(b^ch.charCodeAt(0),3266489917);}return(a>>>0).toString(16)+(b>>>0).toString(16);}
 function pronunciation(input,locale,data){let output=String(input);const currencies={ar:{USD:'دولار أمريكي',EUR:'يورو',TRY:'ليرة تركية'},tr:{USD:'dolar',EUR:'avro',TRY:'Türk lirası'},en:{USD:'US dollars',EUR:'euros',TRY:'Turkish lira'}}[locale]||{};for(const [code,word]of Object.entries(currencies))output=output.replace(new RegExp('\\b'+code+'\\b','g'),word);output=output.replace(/[\u200e\u200f\u061c]/g,'').replace(/US\$/g,currencies.USD||'dollars').replace(/€/g,currencies.EUR||'euros').replace(/₺/g,currencies.TRY||'Turkish lira');return expand(output,{phrases:(data?.pronunciations||[]).filter(r=>!r.locale||r.locale===locale).map(r=>({phrase:r.word,meaning:r.spoken}))}).replace(/[✦✓◉]/g,'');}
 return {teach,fingerprint,number,workspace,retainSelections,previous,context,edit,split,learning,expand,pronunciation,normalize:norm};
});
