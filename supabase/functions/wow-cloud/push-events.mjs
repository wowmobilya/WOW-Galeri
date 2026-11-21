import {normalizeLanguage} from './push-security.mjs';
import {formatGalleryNotice} from './modules/gallery.mjs';
const key=(store,id)=>store+':'+JSON.stringify(id);
const numeric=value=>value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export const cleanPushText=(value,limit=180)=>Array.from(String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim()).slice(0,limit).join('');
const currency=value=>{const c=String(value||'').toUpperCase();return c==='TL'?'TRY':/^[A-Z]{3}$/.test(c)?c:'USD';};
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const same=(a,b)=>stable(a)===stable(b);
const invoiceFields=['invNo','companyId','companyName','buyerName','companyType','currency','items','subtotalUSD','discountUSD','depositUSD','grandTotal','kdvEnabled','kdvRate','kdvAmtUSD','regDate','loadDate','deliveryDate','delivered','deliveredAt','archived','archivedAt','plate','truck','notes','manufacturingTicket'];
const paymentFields=['invoiceId','companyId','amount','amountUSD','amountBasis','originalAmount','originalCurrency','currency','receiptType','date','note','deleted','isDeleted','voided'];
function invoiceMaterial(value){const out={};for(const field of invoiceFields)out[field]=value?.[field];
  if(Array.isArray(out.items))out.items=out.items.map(item=>{const next={...item};delete next.costSnapshot;delete next.costing;if(next.productSnapshot){next.productSnapshot={...next.productSnapshot};delete next.productSnapshot.costing;}return next;});return out;}
function material(store,value){if(store==='invoices')return invoiceMaterial(value);if(store==='payments')return Object.fromEntries(paymentFields.map(f=>[f,value?.[f]]));return {type:value?.type,date:value?.date,note:value?.note,legs:value?.legs};}
function paymentAmount(value){const original=numeric(value.originalAmount);if(original!==null&&value.originalCurrency)return {amount:original,currency:currency(value.originalCurrency)};
  return {amount:numeric(value.amountUSD)??numeric(value.amount),currency:value.amountBasis==='USD'||numeric(value.amountUSD)!==null?'USD':currency(value.currency)};}
export function derivePushEvents({operations=[],records=[],relatedInvoices=[],actorName=''}){
  const previous=new Map(records.map(row=>[key(row.store,row.id),row])),invoices=new Map();
  for(const row of [...records,...relatedInvoices])if(row.store==='invoices'&&!row.deleted)invoices.set(JSON.stringify(row.id),row.value);
  for(const op of operations)if(op.store==='invoices'&&op.kind!=='delete')invoices.set(JSON.stringify(op.id),op.value);
  const events=[];
  for(const op of operations){
    if(!['invoices','payments','settings'].includes(op.store))continue;
    if(op.store==='settings'&&!(typeof op.id==='string'&&op.id.startsWith('cashbox-entry/')))continue;
    const prior=previous.get(key(op.store,op.id)),before=prior&&!prior.deleted?prior.value:null,after=op.kind==='delete'?null:op.value;
    if(!before&&!after||before&&after&&same(material(op.store,before),material(op.store,after)))continue;
    const value=after||before,action=!after?'deleted':before?'updated':'created';
    let kind,details={actorName:cleanPushText(actorName,80),date:cleanPushText(value.regDate||value.date||'',40),note:cleanPushText(value.note||value.notes||'',180)};
    if(op.store==='invoices'){
      kind='proforma';Object.assign(details,{reference:cleanPushText(value.invNo,80),customer:cleanPushText(value.companyName||value.buyerName,120),amount:numeric(value.grandTotal),currency:'USD',paid:numeric(value.totalPaidUSD),remaining:numeric(value.remainingUSD),items:Array.isArray(value.items)?value.items.length:0});
      if(before&&after&&numeric(before.grandTotal)!==numeric(after.grandTotal))details.previousAmount=numeric(before.grandTotal);
    }else if(op.store==='payments'){
      kind='payment';const invoice=invoices.get(JSON.stringify(value.invoiceId));Object.assign(details,paymentAmount(value),{reference:cleanPushText(invoice?.invNo||value.invoiceId,80),customer:cleanPushText(invoice?.companyName||value.companyName,120),method:cleanPushText(value.receiptType,40)});
      if(before&&after){const old=paymentAmount(before);if(old.amount!==details.amount||old.currency!==details.currency){details.previousAmount=old.amount;details.previousCurrency=old.currency;}}
    }else{
      if(!['expense','receipt','transfer','opening'].includes(value.type))continue;
      kind=['expense','transfer'].includes(value.type)?'expense':'receipt';const first=value.legs?.[0],second=value.legs?.[1];
      Object.assign(details,{movement:value.type,amount:Number.isSafeInteger(first?.units)?Math.abs(first.units)/100:null,currency:currency(first?.currency)});
      if(second&&Number.isSafeInteger(second.units))Object.assign(details,{receivedAmount:Math.abs(second.units)/100,receivedCurrency:currency(second.currency)});
      if(before&&after&&Number.isSafeInteger(before.legs?.[0]?.units)&&before.legs[0].units!==first?.units){details.previousAmount=Math.abs(before.legs[0].units)/100;details.previousCurrency=currency(before.legs[0].currency);}
    }
    events.push({store:op.store,id:op.id,revision:op.baseRevision+1,kind,action,details});
  }
  return events;
}
const COPY={
 ar:{proforma:'فاتورة أولية',payment:'دفعة',expense:'صرف',receipt:'قبض',test:'اختبار إشعارات WOW',created:'جديد',updated:'تعديل',deleted:'حذف',customer:'العميل',amount:'المبلغ',total:'الإجمالي',paid:'المدفوع',remaining:'المتبقي',date:'التاريخ',actor:'المنفّذ',note:'البيان',previous:'السابق',received:'المستلم',cash:'نقدًا',transfer:'تحويل',bank:'تحويل بنكي',check:'شيك',other:'أخرى',opening:'رصيد افتتاحي',method:'الطريقة',testBody:'الإشعارات المشفّرة وصلت إلى هذا الجهاز. ستظهر العمليات الجديدة بعد حفظها على الخادم.'},
 en:{proforma:'Proforma',payment:'Payment',expense:'Expense',receipt:'Receipt',test:'WOW notification test',created:'New',updated:'Updated',deleted:'Deleted',customer:'Customer',amount:'Amount',total:'Total',paid:'Paid',remaining:'Remaining',date:'Date',actor:'By',note:'Note',previous:'Previous',received:'Received',cash:'Cash',transfer:'Transfer',bank:'Bank transfer',check:'Cheque',other:'Other',opening:'Opening balance',method:'Method',testBody:'Encrypted notifications reached this device. New operations will appear after the server saves them.'},
 tr:{proforma:'Proforma',payment:'Ödeme',expense:'Gider',receipt:'Tahsilat',test:'WOW bildirim testi',created:'Yeni',updated:'Güncellendi',deleted:'Silindi',customer:'Müşteri',amount:'Tutar',total:'Toplam',paid:'Ödenen',remaining:'Kalan',date:'Tarih',actor:'İşlemi yapan',note:'Açıklama',previous:'Önceki',received:'Alınan',cash:'Nakit',transfer:'Transfer',bank:'Banka havalesi',check:'Çek',other:'Diğer',opening:'Açılış bakiyesi',method:'Yöntem',testBody:'Şifreli bildirim bu cihaza ulaştı. Yeni işlemler sunucuda kaydedildikten sonra görünecek.'},
 fr:{proforma:'Proforma',payment:'Paiement',expense:'Décaissement',receipt:'Encaissement',test:'Test des notifications WOW',created:'Nouveau',updated:'Modification',deleted:'Suppression',customer:'Client',amount:'Montant',total:'Total',paid:'Payé',remaining:'Restant',date:'Date',actor:'Par',note:'Libellé',previous:'Précédent',received:'Reçu',cash:'Espèces',transfer:'Transfert',bank:'Virement',check:'Chèque',other:'Autre',opening:'Solde initial',method:'Mode',testBody:'La notification chiffrée est arrivée sur cet appareil. Les nouvelles opérations apparaîtront après leur enregistrement sur le serveur.'},
 ru:{proforma:'Проформа',payment:'Платёж',expense:'Расход',receipt:'Поступление',test:'Проверка уведомлений WOW',created:'Создано',updated:'Изменено',deleted:'Удалено',customer:'Клиент',amount:'Сумма',total:'Итого',paid:'Оплачено',remaining:'Остаток',date:'Дата',actor:'Исполнитель',note:'Примечание',previous:'Ранее',received:'Получено',cash:'Наличные',transfer:'Перевод',bank:'Банковский перевод',check:'Чек',other:'Другое',opening:'Начальный остаток',method:'Способ',testBody:'Зашифрованное уведомление доставлено на это устройство. Новые операции появятся после сохранения на сервере.'}
};
const sharedCopy={
 ar:{chat:['رسالة جديدة','افتح المحادثة لقراءة الرسالة.'],operations:['تنبيه الخادم','افتح إدارة الخادم للاطلاع على التنبيه.'],resolved:['عاد الخادم إلى حالته الطبيعية','افتح إدارة الخادم للاطلاع على التحديث.']},
 tr:{chat:['Yeni mesaj','Mesajı okumak için sohbeti açın.'],operations:['Sunucu uyarısı','Uyarıyı görmek için sunucu yönetimini açın.'],resolved:['Sunucu uyarısı çözüldü','Güncellemeyi görmek için sunucu yönetimini açın.']},
 en:{chat:['New message','Open the conversation to read the message.'],operations:['Server alert','Open server administration to review the alert.'],resolved:['Server alert resolved','Open server administration to review the update.']},
 fr:{chat:['Nouveau message','Ouvrez la conversation pour lire le message.'],operations:['Alerte du serveur','Ouvrez l’administration du serveur pour consulter l’alerte.'],resolved:['Alerte du serveur résolue','Ouvrez l’administration du serveur pour consulter la mise à jour.']},
 ru:{chat:['Новое сообщение','Откройте чат, чтобы прочитать сообщение.'],operations:['Предупреждение сервера','Откройте раздел управления сервером, чтобы посмотреть предупреждение.'],resolved:['Предупреждение сервера снято','Откройте раздел управления сервером, чтобы посмотреть обновление.']}
};
function invalidNotice(){throw Object.assign(Error('INVALID_NOTICE'),{code:'INVALID_NOTICE'});}
function sharedNotice(kind,d,language){
  if(['order.created','order.updated','stock.updated'].includes(kind)){
    if(d.kind!==kind)invalidNotice();
    try {
      const {title,body,route,params}=formatGalleryNotice(d,language);
      return {title,body,route,params};
    } catch {invalidNotice();}
  }
  if(kind==='chat'){
    if(typeof d.roomId!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(d.roomId)||
      typeof d.messageId!=='string'||!/^[1-9]\d{0,18}$/.test(d.messageId)||BigInt(d.messageId)>9223372036854775807n)invalidNotice();
    const [title,body]=sharedCopy[language].chat;
    return {title,body,route:'chat',params:{roomId:d.roomId,messageId:d.messageId}};
  }
  if(kind==='operations'){
    if(typeof d.active!=='boolean'||d.route!=='server-admin')invalidNotice();
    const [title,body]=sharedCopy[language][d.active?'operations':'resolved'];
    return {title,body,route:'server-admin',params:{}};
  }
  return null;
}
export function formatPushPayload(event,recipient){
  const language=normalizeLanguage(recipient.language),t=COPY[language],d=event.details||{},kind=event.kind;
  const envelope={eventId:cleanPushText(event.id,220),kind,workspaceId:recipient.workspaceId,userId:recipient.userId,deviceId:recipient.deviceId,
    bindingId:recipient.bindingId,sessionVersion:recipient.sessionVersion,validUntil:recipient.validUntil,language,timestamp:event.createdAt};
  const notice=sharedNotice(kind,d,language);
  if(notice)return {...envelope,...notice};
  if(!['test','proforma','payment','expense','receipt'].includes(kind))invalidNotice();
  const number=new Intl.NumberFormat(language==='ar'?'ar-u-nu-latn':language,{minimumFractionDigits:2,maximumFractionDigits:2});
  const money=(amount,code=d.currency)=>amount!==null&&Number.isFinite(Number(amount))?currency(code)+' '+number.format(Number(amount)):'';
  const lines=[];
  if(kind==='test')lines.push(t.testBody);
  else{
    if(d.customer)lines.push(t.customer+': '+d.customer);
    if(d.amount!==null&&d.amount!==undefined)lines.push((kind==='proforma'?t.total:t.amount)+': '+money(d.amount));
    if(d.previousAmount!==undefined&&d.previousAmount!==null)lines.push(t.previous+': '+money(d.previousAmount,d.previousCurrency||d.currency));
    if(kind==='proforma'){
      const balance=[];if(d.paid!==null&&d.paid!==undefined)balance.push(t.paid+': '+money(d.paid));if(d.remaining!==null&&d.remaining!==undefined)balance.push(t.remaining+': '+money(d.remaining));if(balance.length)lines.push(balance.join(' · '));
    }
    if(d.receivedAmount!==undefined)lines.push(t.received+': '+money(d.receivedAmount,d.receivedCurrency));
    if(d.method)lines.push(t.method+': '+(t[d.method]||d.method));
    if(d.date)lines.push(t.date+': '+d.date);
    if(d.actorName)lines.push(t.actor+': '+d.actorName);
    if(d.note)lines.push(t.note+': '+d.note);
  }
  const title=kind==='test'?t.test:[t[event.action]||t.updated,t[d.movement==='transfer'?'transfer':d.movement==='opening'?'opening':kind]||t.proforma,d.reference&&'· '+d.reference].filter(Boolean).join(' ');
  const payload={...envelope,title:cleanPushText(title,120),body:cleanPushText(lines.join('\n')||t[kind],450)};
  const bytes=new TextEncoder();while(bytes.encode(JSON.stringify(payload)).length>3072&&payload.body)payload.body=Array.from(payload.body).slice(0,-16).join('');
  return payload;
}
