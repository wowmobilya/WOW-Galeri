/* WOW V23 — pure, bounded local language/teaching engine. No DOM, network or writes. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./assistant-core.js'));
  else root.WOWAssistantDialogue = factory(root.WOWAssistantCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(C) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const norm = C.normalize;
  const has = x => x !== undefined && x !== null && x !== '';
  const blockedKeys = new Set(['__proto__','constructor','prototype']);
  const commandKeys = new Set(['intent','clientQuery','productQuery','invoiceQuery','query','target','page','date','deliveryDate','loadDate','notes','paymentMethod','currency','depositCurrency','discountCurrency','amountCurrency','tier','deposit','discount','amount','taxEnabled','items','fields']);
  const numberKeys = new Set(['quantity','unitPrice','amount','deposit','discount','price','priceA','priceB','priceC','weight','cbm','packets','showrooms']);
  function safeTree(x, depth=0) {
    if (depth>12) throw new Error('teaching_invalid');
    if (!x || typeof x!=='object') return;
    for (const [k,v] of Object.entries(x)) { if (blockedKeys.has(k)) throw new Error('teaching_invalid');safeTree(v,depth+1); }
  }
  function phrases(values) {
    if (!Array.isArray(values) || values.length>300 || values.some(v=>typeof v!=='string'||!norm(v)||v.length>250)) throw new Error('teaching_invalid');
    return [...new Set(values.map(v=>v.trim()))];
  }
  function validateTeaching(value) {
    if (!value || typeof value!=='object' || Array.isArray(value) || value.version!==1 || JSON.stringify(value).length>400000) throw new Error('teaching_invalid');
    safeTree(value);
    if (!value.intents || typeof value.intents!=='object' || Array.isArray(value.intents)) throw new Error('teaching_invalid');
    const out={version:1,name:String(value.name||'WOW').slice(0,160),description:String(value.description||'').slice(0,1500),intents:{},sections:{},productTypes:{},templates:[],aliases:[]}, used=new Map();
    for (const [id,row] of Object.entries(value.intents)) {
      if (!C.intents.includes(id) || !row || typeof row!=='object') throw new Error('teaching_invalid');
      const list=phrases(row.phrases);
      for(const p of list){const n=norm(p);if(used.has(n)&&used.get(n)!==id)throw new Error('teaching_conflict');used.set(n,id);}
      out.intents[id]={phrases:list};
    }
    for(const [key,allowed] of [['sections',C.pages],['productTypes',C.types]]){
      if(value[key] && (typeof value[key]!=='object'||Array.isArray(value[key])))throw new Error('teaching_invalid');
      const labels=new Map();for(const [id,list] of Object.entries(value[key]||{})){if(!allowed.includes(id))throw new Error('teaching_invalid');out[key][id]=phrases(list);for(const phrase of out[key][id]){const label=norm(phrase);if(labels.has(label)&&labels.get(label)!==id)throw new Error('teaching_conflict');labels.set(label,id);}}
    }
    if(value.templates && (!Array.isArray(value.templates)||value.templates.length>300))throw new Error('teaching_invalid');
    for(const row of value.templates||[]) {
      if(!row||typeof row.pattern!=='string'||row.pattern.length>400||!norm(row.pattern)||!row.command||typeof row.command!=='object'||Array.isArray(row.command)||!C.intents.includes(row.command.intent))throw new Error('teaching_invalid');
      if(Object.keys(row.command).some(k=>!commandKeys.has(k)))throw new Error('teaching_invalid');
      const slots=[...row.pattern.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]);
      if(slots.length>4||slots.some(k=>!['client','product','invoice','quantity','amount','name','query'].includes(k))||/\}\s*\{/.test(row.pattern))throw new Error('teaching_invalid');
      const embedded=[...JSON.stringify(row.command).matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]);
      if(embedded.some(k=>!slots.includes(k)))throw new Error('teaching_invalid');
      if(out.templates.some(x=>norm(x.pattern)===norm(row.pattern)&&JSON.stringify(x.command)!==JSON.stringify(row.command)))throw new Error('teaching_conflict');
      out.templates.push(copy(row));
    }
    if(value.aliases&&(!Array.isArray(value.aliases)||value.aliases.length>1000))throw new Error('teaching_invalid');
    for(const row of value.aliases||[]){if(!row||!['client','product','invoice'].includes(row.kind)||typeof row.alias!=='string'||typeof row.name!=='string'||!norm(row.alias)||!norm(row.name)||row.alias.length>160||row.name.length>160)throw new Error('teaching_invalid');out.aliases.push({kind:row.kind,alias:row.alias,name:row.name});}
    return out;
  }
  function lex(value) {return String(value||'').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ı/g,'i').replace(/\s+/g,' ').trim();}
  const wordNumbers={};
  [[0,'صفر zero sifir'],[1,'واحد واحده one bir'],[2,'اثنين اتنين اثنان ثنين اثنتين two iki'],[3,'ثلاث ثلاثه three uc'],[4,'اربع اربعه four dort'],[5,'خمس خمسه five bes'],[6,'ست سته six alti'],[7,'سبع سبعه seven yedi'],[8,'ثمان ثماني ثمانيه eight sekiz'],[9,'تسع تسعه nine dokuz'],[10,'عشر عشره ten on'],[20,'عشرين عشرون twenty yirmi'],[30,'ثلاثين ثلاثون thirty otuz'],[40,'اربعين forty kirk'],[50,'خمسين fifty elli'],[60,'ستين sixty altmis'],[70,'سبعين seventy yetmis'],[80,'ثمانين eighty seksen'],[90,'تسعين ninety doksan'],[100,'ميه مئه مائه hundred yuz'],[1000,'الف thousand bin']].forEach(([n,words])=>words.split(' ').forEach(w=>wordNumbers[w]=n));
  function spokenNumber(value) {
    const s=lex(value).replace(/(?:قطع(?:ه)?|حبات?|عدد|units?|pieces?|adet|tane)/g,' ').trim();
    const direct=C.number(s);if(Number.isFinite(direct))return direct;
    const words=norm(s).split(' ');if(words.length>5||!words.length)return NaN;
    let total=0, part=0;
    for(let word of words){if(word==='و'||word==='and')continue;if(word.startsWith('و')&&!Object.hasOwn(wordNumbers,word))word=word.slice(1);if(!Object.hasOwn(wordNumbers,word))return NaN;const n=wordNumbers[word];if(n===100||n===1000)part=(part||1)*n;else part+=n;if(n===1000){total+=part;part=0;}}
    return total+part;
  }
  const escape=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function contains(text,phrase){return new RegExp('(?:^|\\s)(?:[ولب])?'+escape(norm(phrase))+'(?=$|\\s)','u').test(norm(text));}
  function aliasMatch(text,table){let best=null;for(const [id,list] of Object.entries(table||{}))for(const p of list)if(contains(text,p)&&(!best||norm(p).length>best.length))best={id,length:norm(p).length};return best?.id;}
  function currency(text){const n=norm(text);if(/€/.test(text)||/\b(?:eur|euro|avro)\b|يورو/.test(n))return'EUR';if(/₺/.test(text)||/\b(?:try|tl|lira)\b|ليره|تركي/.test(n))return'TRY';if(/\$/.test(text)||/\b(?:usd|dollar|dolar|dollars)\b|دولار/.test(n))return'USD';return null;}
  function numberAfter(text,labels){const source=lex(text),re=new RegExp('(?:'+labels+')\\s*(?:هو|هي|قدره|قيمته|بقيمة|بقيمه|الي|الى|to|of|is|:|=)?\\s*([+-]?\\d+(?:[.,٫٬]\\d+)*|[\\p{L}]+(?:\\s+(?:و)?[\\p{L}]+)?)','iu'),m=re.exec(source);if(!m)return null;let v=spokenNumber(m[1]);if(!Number.isFinite(v))v=spokenNumber(m[1].split(' ')[0]);return Number.isFinite(v)?{value:v,currency:currency((/^[\s:]*((?:دولار|دولارات|ليره|يورو|usd|eur|try|tl|dollars?|dolar|euro|avro|lira)(?=\s|$|[,،])|[€$₺])/iu.exec(source.slice(m.index+m[0].length))||[])[1]||''),raw:m[1]}:null;}
  function mentions(text,snapshot,teaching,kind){
    const store={client:'companies',product:'products',invoice:'invoices'}[kind], entries=[];
    for(const row of snapshot?.[store]||[])entries.push({row,phrase:kind==='invoice'?row.invNo:row.name});
    for(const a of snapshot?.settings?.assistantMemory?.aliases||[]){if(a.kind!==kind)continue;const row=snapshot[store].find(r=>String(r.id)===String(a.id));if(row)entries.push({row,phrase:a.alias});}
    for(const a of teaching.aliases||[]){if(a.kind!==kind)continue;const matches=(snapshot[store]||[]).filter(r=>norm(kind==='invoice'?r.invNo:r.name)===norm(a.name));if(matches.length===1)entries.push({row:matches[0],phrase:a.alias});}
    const t=norm(text),found=[];
    for(const entry of entries){if(!norm(entry.phrase))continue;const re=new RegExp('(?:^|\\s)(?:[ولب])?('+escape(norm(entry.phrase))+')(?=$|\\s)','gu');let m;while((m=re.exec(t))){const start=m.index+m[0].length-m[1].length;found.push({...entry,start,end:start+m[1].length});}}
    found.sort((a,b)=>(b.end-b.start)-(a.end-a.start));const chosen=[];
    for(const m of found)if(!chosen.some(x=>x.start<m.end&&m.start<x.end))chosen.push(m);
    return chosen.sort((a,b)=>a.start-b.start).filter((x,i,all)=>all.findIndex(y=>String(y.row.id)===String(x.row.id))===i);
  }
  function matchTemplate(text,row){
    const slots=[],parts=row.pattern.split(/(\{[a-zA-Z]+\})/);let re='^';
    for(const p of parts){if(/^\{[a-zA-Z]+\}$/.test(p)){slots.push(p.slice(1,-1));re+='(.{1,160}?)';}else re+=escape(norm(p)).replace(/ /g,'\\s+');if(p&&/\s$/.test(p))re+='\\s*';if(p&&/^\s/.test(p)){} }
    // Normalize literal chunks without losing the separators around placeholders.
    re='^'+parts.map(p=>/^\{[a-zA-Z]+\}$/.test(p)?'(.{1,160}?)':escape(norm(p)).replace(/ /g,'\\s+')).join('\\s*')+'$';
    const m=new RegExp(re,'u').exec(norm(text));if(!m)return null;
    const values=Object.fromEntries(slots.map((k,i)=>[k,m[i+1].trim()]));
    function fill(x,key){if(Array.isArray(x))return x.map(v=>fill(v));if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,fill(v,k)]));if(typeof x==='string'){const value=x.replace(/\{([a-zA-Z]+)\}/g,(_,k)=>values[k]||'');if(numberKeys.has(key)){const n=spokenNumber(value);if(!Number.isFinite(n))throw new Error('amount_invalid');return n;}return value;}return x;}
    try{return fill(row.command);}catch{return null;}
  }
  function control(text){
    const n=norm(text);
    if(/^(نعم|اي|ايوه|ايوا|تمام احفظ|تمام|احفظ|احفظها|احفظ الفاتوره|اكد|تاكيد|تاكيد وحفظ|موافق|نفذ|yes|confirm|save|save it|confirm and save|evet|onayla|kaydet)$/.test(n))return{control:'confirm'};
    if(/^(الغاء|الغي|الغي المسوده|الغ المسوده|كنسل|cancel|cancel draft|iptal|vazgec)$/.test(n))return{control:'cancel'};
    if(/^(لا|لا تحفظ|لا تحفظها|استني|انتظر|توقف|no|do not save|dont save|hold|hayir|kaydetme)$/.test(n))return{control:'hold'};
    if(/^(وقف الصوت|اوقف الصوت|اسكت|بدون صوت|اطفي الصوت|mute|sound off|stop speaking|sesi kapat|sessiz)$/.test(n))return{control:'mute'};
    if(/^(شغل الصوت|تكلم|احكي|رجع الصوت|unmute|sound on|turn sound on|sesi ac)$/.test(n))return{control:'unmute'};
    if(/^(وقف الميكروفون|اوقف الميكروفون|اطفي الميكروفون|stop microphone|stop listening|mikrofonu kapat)$/.test(n))return{control:'mic_stop'};
    if(/^(كمل|تابع|متابعه|اكمل|continue|resume|devam)$/.test(n))return{control:'continue'};
    if(/(?:غير|بدل|حول|change|switch|degistir).*(?:لغه|language|dil)|(?:لغه|language|dil).*(?:عربي|تركي|انجليزي|انكليزي|english|turk|arab)/.test(n)){
      const value=/تركي|turk/.test(n)?'tr':/انجليزي|انكليزي|english|ingiliz/.test(n)?'en':/عربي|arab/.test(n)?'ar':null;
      if(value)return{control:/البرنامج|program|app/.test(n)?'app_language':'language',value};
    }
    if(/^(?:شغل|فعل|حول|change to|switch to|enable)?\s*(?:الوضع الليلي|الوضع الداكن|dark mode|karanlik mod)$/.test(n))return{control:'theme',value:'dark'};
    if(/^(?:شغل|فعل|حول|change to|switch to|enable)?\s*(?:الوضع النهاري|الوضع الفاتح|light mode|aydinlik mod)$/.test(n))return{control:'theme',value:'light'};
    return null;
  }
  function setPath(obj,path,value){const keys=path.split('.');let ref=obj;for(let i=0;i<keys.length-1;i++){const k=keys[i];if(blockedKeys.has(k))throw new Error('request_invalid');ref[k]||=/^\d+$/.test(keys[i+1])?[]:{};ref=ref[k];}if(blockedKeys.has(keys.at(-1)))throw new Error('request_invalid');ref[keys.at(-1)]=value;}
  function reconcileSelections(previous,next,selected={}){
    const out={};if(!previous||!next||previous.intent!==next.intent)return out;
    const top={client:'clientQuery',invoice:'invoiceQuery',product:'productQuery',target:'query'};
    for(const [key,id] of Object.entries(selected)){
      if(key.startsWith('items.'))continue;
      const field=top[key];if(field&&norm(previous[field]||previous.query)===norm(next[field]||next.query)&&(key!=='target'||previous.target===next.target))out[key]=id;
    }
    (next.items||[]).forEach((item,i)=>{const matches=(previous.items||[]).map((x,j)=>({x,j})).filter(v=>norm(v.x.query)===norm(item.query));if(matches.length===1){const value=selected['items.'+matches[0].j+'.product'];if(has(value))out['items.'+i+'.product']=value;}});
    return out;
  }
  function mergeCommand(previous,incoming){
    if(!previous||previous.intent!==incoming.intent)return copy(incoming);
    if(incoming.invoiceQuery&&previous.invoiceQuery&&norm(incoming.invoiceQuery)!==norm(previous.invoiceQuery))return copy(incoming);
    if(incoming.query&&previous.query&&norm(incoming.query)!==norm(previous.query)&&incoming.intent.startsWith('update_'))return copy(incoming);
    const pruned=Object.fromEntries(Object.entries(incoming).filter(([,v])=>v!==null&&v!==undefined)),out={...copy(previous),...copy(pruned)};
    if(pruned.fields)out.fields={...previous.fields,...pruned.fields};
    if(pruned.items){out.items=copy(previous.items||[]);for(const item of pruned.items){const i=out.items.findIndex(x=>norm(x.query)===norm(item.query));if(item.operation==='remove'&&out.intent==='create_invoice'){if(i>=0)out.items.splice(i,1);}else if(i>=0)out.items[i]={...out.items[i],...item};else out.items.push(copy(item));}}
    return out;
  }
  function interpret(text,ctx={}){
    if(typeof text!=='string'||!text.trim()||text.length>6000)return null;
    const ctl=control(text);if(ctl)return ctl;
    const raw=text.trim(), n=norm(raw), snapshot=ctx.snapshot||{companies:[],products:[],invoices:[],settings:{}}, k=ctx.teaching||{intents:{},sections:{},productTypes:{},templates:[],aliases:[]};
    if(/^(?:لا |ما بدي |مش عايز |لازم ما |dont |do not |not )/.test(n))return null;
    let source=raw,after=[];
    const tail=/(?:وبعدين|بعدين|ثم|وبعدها|وبعد|و\s*بعدين|and then|then|sonra)\s*(.*)$/iu.exec(source);
    if(tail){const t=norm(tail[1]);if(/عاين|معاين|اعرض|preview|goster/.test(t))after.push('preview_invoice');if(/pdf|بي دي اف/.test(t))after.push('export_pdf');if(/excel|اكسل|اكسيل/.test(t))after.push('export_excel');if(after.length)source=source.slice(0,tail.index).trim();}
    const s=norm(source),exact=[];let detected=null, matched='',template=null;
    for(const row of k.templates||[]){const m=matchTemplate(source,row);if(m){template=m;break;}}
    for(const [id,row] of Object.entries(k.intents||{}))for(const p of row.phrases||[])if(s===norm(p)||s.startsWith(norm(p)+' '))exact.push({id,p,length:norm(p).length});
    exact.sort((a,b)=>b.length-a.length);if(exact[0]){detected=exact[0].id;matched=exact[0].p;}
    if(template){detected=template.intent;matched=source;}
    const active=ctx.command, q=ctx.plan?.questions?.[0];
    const numericText=lex(source);
    // Ambiguous 1.000/1,000 requires clarification; don't silently choose a locale.
    if(/(?:^|[^\d])\d{1,3}[.,]\d{3}(?![\d.,])/.test(numericText))return null;
    if(q?.type!=='number' && /\d[.,٫]\d/.test(numericText))return null;
    if(active&&['create_invoice','update_invoice'].includes(active.intent)&&/^(احذف|شيل|remove)/.test(s)&&/من الفاتوره|من المسوده|from (the )?(invoice|draft)/.test(s)){
      const found=mentions(source,snapshot,k,'product');if(found.length!==1)return null;
      const changed=copy(active),name=found[0].row.name;
      if(changed.intent==='create_invoice'){const before=changed.items?.length||0;changed.items=(changed.items||[]).filter(i=>norm(i.query)!==norm(name));if(changed.items.length===before)return null;}
      else changed.items=[...(changed.items||[]).filter(i=>norm(i.query)!==norm(name)),{query:name,operation:'remove'}];
      return{command:changed,after,source:'local'};
    }

    // Short answers satisfy the current question rather than starting another unrelated action.
    if(active&&q&&!detected){
      const c=copy(active);let selection=null,valid=false;
      if(q.type==='number'){
        const value=spokenNumber(source.replace(/^(?:العدد|الكميه|الكمية|خليها|quantity|adet)\s*/iu,''));if(Number.isFinite(value)){setPath(c,q.key,value);valid=true;}
      }else if(q.type==='record'&&source.length<=180){
        const ord={'الاول':0,'اول واحد':0,'اول':0,'first':0,'birinci':0,'الثاني':1,'ثاني':1,'second':1,'ikinci':1,'الثالث':2,'third':2,'ucuncu':2};
        const idx=Object.hasOwn(ord,s)?ord[s]:/^\d{1,2}$/.test(s)?Number(s)-1:-1;
        const choice=idx>=0?q.options?.[idx]:null;
        const kind=q.kind,store={client:'companies',product:'products',invoice:'invoices',payment:'payments'}[kind];
        const matches=kind==='payment'?[]:mentions(source,snapshot,k,kind);
        const original=(source.replace(/^(?:العميل|الزبون|الموديل|المنتج|الفاتوره|الفاتورة|اسمه|شركة|شركه|customer|client|model|product|musteri)\s*/iu,'')).trim();
        const actionLike=/^(?:غير|بدل|اضف|ضيف|افتح|احذف|عدل|الغ|كم|ليش|لماذا|what|why|change|open|add|delete|show|kaydet)/u.test(s);
        if(!actionLike&&(choice||matches.length===1||(!/\d/.test(s)&&s.split(' ').length<=9))){
          const record=choice?(snapshot[store]||[]).find(r=>String(r.id)===String(choice.id)):matches.length===1?matches[0].row:null;
          const query=record?(kind==='invoice'?record.invNo:record.name):original;
          if(q.key.startsWith('items.')){const i=Number(q.key.split('.')[1]);c.items||=[];c.items[i]||={};c.items[i].query=query;}else c[q.key==='target'?'query':q.key+'Query']=query;
          if(record)selection={key:q.key,id:record.id};valid=true;
        }
      }else if(q.type==='choice'){
        const row=q.options.find(o=>norm(o.id)===s),value=row?.id||(q.key==='page'?aliasMatch(source,k.sections):q.key==='fields.type'?aliasMatch(source,k.productTypes):null);
        if(value){setPath(c,q.key,value);valid=true;}
      }else if(q.type==='text'&&source.length<250&&!/[<>]/.test(source)){setPath(c,q.key,source);valid=true;}
      if(valid)return{command:c,selection,after,source:'local'};
    }
    let c;
    if(detected){c=active&&active.intent===detected?copy(active):{intent:detected};if(template)c=mergeCommand(c,template);}
    else if(active)c=copy(active);else return null;
    let recognized=!!detected;
    const clients=mentions(source,snapshot,k,'client'),products=mentions(source,snapshot,k,'product'),invoices=mentions(source,snapshot,k,'invoice');
    if(c.intent==='open_page'){
      const page=aliasMatch(source,k.sections);return page?{command:{intent:'open_page',page},after,source:'local'}:null;
    }
    if(c.intent==='help'||c.intent==='dashboard_summary')return{command:c,after,source:'local'};
    if(c.intent==='backup')return{command:{intent:'backup',page:/استعاد|restore|geri yukle/.test(s)?'restore':'backup'},after,source:'local'};
    if(/invoice$/.test(c.intent)||['export_pdf','export_excel','add_payment'].includes(c.intent))if(invoices.length===1)c.invoiceQuery=invoices[0].row.invNo;
    if(['preview_invoice','export_pdf','export_excel'].includes(c.intent)){
      if(!c.invoiceQuery&&ctx.lastCompleted?.invoiceQuery)c.invoiceQuery=ctx.lastCompleted.invoiceQuery;
      if(!c.invoiceQuery){const rest=source.slice(matched.length).trim().replace(/^(?:رقم|number|no)\s*/iu,'');if(rest)c.invoiceQuery=rest;}
      return{command:c,after,source:'local'};
    }
    if(c.intent==='account_statement'){
      if(clients.length===1)c.clientQuery=clients[0].row.name;
      else if(!c.clientQuery)c.clientQuery=source.slice(matched.length).trim().replace(/^(?:العميل|للعميل|ل|customer|for)\s*/iu,'');
      return{command:c,after,source:'local'};
    }
    if(c.intent==='search'||c.intent==='delete_record'){
      c.target=/عميل|زبون|شرك|customer|client|musteri/.test(s)?'client':/فاتور|invoice|fatura/.test(s)?'invoice':/دفع|payment|odeme/.test(s)?'payment':'product';
      const rows=c.target==='client'?clients:c.target==='invoice'?invoices:products;
      c.query=rows.length===1?(c.target==='invoice'?rows[0].row.invNo:rows[0].row.name):source.slice(matched.length).trim().replace(/^(?:عن|على|العميل|عميل|الزبون|موديل|الموديل|المنتج|الفاتورة|الفاتوره|product|customer|invoice)\s*/iu,'');return{command:c,after,source:'local'};
    }
    const invoice=c.intent==='create_invoice'||c.intent==='update_invoice';
    if(invoice){
      if(clients.length===1){c.clientQuery=clients[0].row.name;recognized=true;}
      if(!c.clientQuery&&detected==='create_invoice'&&!template){
        let rest=source.slice(matched.length).trim();
        const match=/^(?:للعميل|للزبون|للشركة|للشركه|لشركة|لشركه|ل|for\s+|customer\s+)(.+?)(?=\s+\d|\s+(?:ضيف|اضف|عربون|خصم|موديل|model)|$)/iu.exec(rest);if(match)c.clientQuery=match[1].trim();
      }
      c.items||=[];
      for(const p of products){
        let i=c.items.findIndex(item=>norm(item.query)===norm(p.row.name));if(i<0){i=c.items.length;c.items.push({query:p.row.name});}recognized=true;
        const canonical=norm(source),before=canonical.slice(0,p.start).trim(),aft=canonical.slice(p.end).trim();
        const m=/(?:^|\s)([\p{L}\d]+)(?:\s+(?:قطع|قطعه|من|موديل|حبات|units|pieces|adet|tane)){0,3}$/u.exec(before),a=/^(\d+|واحد|اثنين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه)(?:\s*(?:قطع|قطعه|adet|units|pieces|tane)(?:\s|$)|$)/u.exec(aft);
        const qty=a?spokenNumber(a[1]):m?spokenNumber(m[1]):NaN;if(Number.isFinite(qty))c.items[i].quantity=qty;
        if(!has(c.items[i].quantity)&&products.length===1){const qtyLabel=numberAfter(source,'الكميه|العدد|عدد|quantity|qty');if(qtyLabel)c.items[i].quantity=qtyLabel.value;}
      }
      if(!products.length&&/موديل|model|urun/.test(s)){
        const m=/(?:موديل|model|urun)\s+([^,،]+?)(?=\s+(?:عدد|العدد|كميه|الكمية|سعر|عربون|خصم)|$)/iu.exec(source);if(m&&m[1].length<160&&!c.items.some(x=>norm(x.query)===norm(m[1]))){c.items.push({query:m[1].trim()});recognized=true;}
      }
      const qty=numberAfter(source,'الكميه|العدد|عدد|quantity|qty');
      if(qty&&c.items.length===1){c.items[0].quantity=qty.value;recognized=true;}
      const price=numberAfter(source,'سعر القطعه|سعر الوحده|سعره|سعرها|السعر|unit price|price');
      if(price&&c.items.length===1){c.items[0].unitPrice=price.value;if(price.currency)c.items[0].currency=price.currency;recognized=true;}
      for(const [key,labels] of [['deposit','العربون|عربون|دفعة اولى|دفعه اولي|kapora|pesinat|deposit'],['discount','الخصم|خصم|discount|indirim']]){
        const amt=numberAfter(source,labels);if(amt){if(key==='discount'&&/%|بالمئه|بالميه|percent/.test(s+source))return null;c[key]=amt.value;if(amt.currency)c[key+'Currency']=amt.currency;recognized=true;}
      }
      const curMatch=/(?:العمله|عمله|currency|para birimi)\s+([^,،]+?)(?=\s+(?:و?عربون|و?خصم|deposit|discount)|$)/iu.exec(lex(source));const cur=currency(curMatch?.[1]||source);if(cur&&/العمله|عمله|currency|para birimi|فاتوره بال(?:يورو|دولار|ليره)/.test(s)){c.currency=cur;recognized=true;}
      const note=/(?:ملاحظات|ملاحظه|ملاحظة|notes?)\s*[:：]?\s*(.+)$/iu.exec(source);if(note){c.notes=note[1].trim();recognized=true;}
      const iso=source.match(/\d{4}-\d{2}-\d{2}/);if(iso){const key=/تسليم|delivery|teslim/.test(s)?'deliveryDate':/تحميل|loading|yukleme/.test(s)?'loadDate':'date';c[key]=iso[0];recognized=true;}
      if(/بدون ضريبه|الغ الضريبه|no tax|without tax|kdv haric/.test(s)){c.taxEnabled=false;recognized=true;}else if(/فعل الضريبه|مع الضريبه|with tax|kdv dahil/.test(s)){c.taxEnabled=true;recognized=true;}
    }else if(c.intent==='add_payment'){
      const amt=numberAfter(source,'دفعه|دفعة|دفعت|مبلغ|payment|pay|odeme');if(amt){c.amount=amt.value;if(amt.currency)c.amountCurrency=amt.currency;recognized=true;}
      if(!has(c.amount)){const val=spokenNumber(source.slice(matched.length).replace(/دولار|ليره|يورو|usd|eur|try|dolar/giu,'').trim());if(Number.isFinite(val)){c.amount=val;recognized=true;}}
      if(!c.invoiceQuery&&ctx.lastCompleted?.invoiceQuery)c.invoiceQuery=ctx.lastCompleted.invoiceQuery;
    }else if(/_(client|product)$/.test(c.intent)){
      const product=c.intent.endsWith('_product');c.fields||={};
      const m=/(?:اسمه|اسمها|باسم|اسم|named|name|adi)\s+(.+?)(?=\s+(?:و?رقم|و?تلفون|و?هاتف|و?سعر|و?قسم|و?نوع|و?لون|و?بلد|و?ايميل|و?email|phone|price|category)|[,،]|$)/iu.exec(source);
      if(m){c.fields.name=m[1].trim();recognized=true;}
      if(c.intent.startsWith('update_')){const rows=product?products:clients;if(rows.length===1)c.query=rows[0].row.name;}
      if(product){
        const type=aliasMatch(source,k.productTypes);if(type){c.fields.type=type;recognized=true;}
        const price=numberAfter(source,'سعره|سعرها|السعر|سعر|price|fiyati|fiyat');if(price){c.fields.priceA=price.value;c.currency=price.currency||'USD';recognized=true;}
        const color=/(?:اللون|لونه|لونها|لون|color|renk)\s+(.+?)(?=\s+(?:سعر|قسم|نوع)|[,،]|$)/iu.exec(source);if(color){c.fields.color=color[1].trim();recognized=true;}
      }else{
        const phone=/(?:رقمه|رقم|تلفون|هاتف|phone|telefon)\s*[:：]?\s*([+\d٠-٩][\d٠-٩\s-]{4,24})/iu.exec(source);if(phone){c.fields.phone=phone[1].trim();recognized=true;}
        const email=source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);if(email){c.fields.email=email[0];recognized=true;}
        if(/محلي جمله|جمله|wholesale|toptan/.test(s))c.fields.type='internal_wholesale';else if(/محلي مفرق|مفرق|retail|perakende/.test(s))c.fields.type='internal_retail';else if(/خارجي|external|export|yurt disi/.test(s))c.fields.type='external';
      }
    }
    return recognized?{command:c,after,source:'local'}:null;
  }
  function teachingContext(k,text){
    const n=norm(text),rows=[];
    for(const [intent,v] of Object.entries(k.intents||{}))for(const p of v.phrases||[])if(contains(n,p))rows.push({phrase:p,intent});
    return{version:1,phrases:rows.slice(0,12),sections:Object.fromEntries(Object.entries(k.sections||{}).filter(([,v])=>v.some(p=>contains(n,p)))),productTypes:k.productTypes,aliases:(k.aliases||[]).filter(a=>contains(n,a.alias)).slice(0,20)};
  }
  return {validateTeaching,interpret,reconcileSelections,mergeCommand,spokenNumber,teachingContext,control};
});
