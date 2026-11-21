const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{1,70}$/;
const STATUS = ['pending', 'manufacturing', 'ready', 'delivered', 'cancelled'];
const CURRENCIES = ['USD', 'TRY', 'EUR', 'SYP'];
const MAX_PRICE = 99999999999;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(code = 'INVALID_GALLERY_INPUT') {
  throw Object.assign(new Error(code), {code, status:422});
}
function string(value, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') invalid();
  const result = value.trim().normalize('NFC');
  if ((required && !result) || [...result].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) invalid();
  return result;
}
function choice(value, values) { if (!values.includes(value)) invalid(); return value; }
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) invalid(); return value; }
function bool(value) { if (typeof value !== 'boolean') invalid(); return value; }
function uuid(value) { if (typeof value !== 'string' || !ID.test(value)) invalid(); return value.toLowerCase(); }
function key(value) { if (typeof value !== 'string' || !KEY.test(value)) invalid(); return value; }
function productId(value) {
  if (typeof value === 'number') return integer(value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (typeof value !== 'string' || !value.trim() || value.length > 180 || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value;
}
function list(items, max, mapper, unique) {
  if (!Array.isArray(items) || items.length > max) invalid();
  const result = items.map(mapper);
  if (unique && new Set(result.map(item => JSON.stringify(item[unique]))).size !== result.length) invalid();
  return result;
}
const page = body => ({offset:integer(body.offset ?? 0,0,10000000), limit:integer(body.limit ?? 50,1,100)});
const rev = value => integer(value,0,Number.MAX_SAFE_INTEGER);
const amount = value => integer(value,0,MAX_PRICE);
const optionalAsset = value => value ? uuid(value) : null;
function specs(entry) {
  if (entry == null) return {};
  if (!plain(entry) || Object.keys(entry).length > 25) invalid();
  return Object.fromEntries(Object.entries(entry).map(([name,value]) => [key(name),string(value,160)]));
}
function listing(item) {
  if (!plain(item)) invalid();
  return {productId:productId(item.productId),version:rev(item.version),published:bool(item.published),stock:integer(item.stock,0,1000000),
    priceMinor:item.priceMinor == null ? null : amount(item.priceMinor),currency:choice(item.currency || 'USD',CURRENCIES),
    collection:string(item.collection,80),badge:string(item.badge,100),specs:specs(item.specs)};
}
function orderLine(line, quoted) {
  if (!plain(line)) invalid();
  const result = {productId:productId(line.productId),quantity:integer(line.quantity,1,1000000)};
  if (quoted || line.priceMinor != null) Object.assign(result,{priceMinor:amount(line.priceMinor),currency:choice(line.currency,CURRENCIES)});
  return result;
}
function presentation(value) {
  if (!plain(value)) invalid();
  const card = item => {
    if (!plain(item)) invalid();
    return {id:key(item.id),title:string(item.title,120,true),subtitle:string(item.subtitle,160),description:string(item.description,400),
      countLabel:string(item.countLabel,60),buttonText:string(item.buttonText,80),priceLabel:string(item.priceLabel,80),
      collection:string(item.collection,80),imageId:optionalAsset(item.imageId),visible:bool(item.visible ?? true)};
  };
  return {cards:list(value.cards ?? [],40,card,'id'),slides:list(value.slides ?? [],40,card,'id'),
    fields:list(value.fields ?? [],25,item => ({id:key(item.id),label:string(item.label,80,true),unit:string(item.unit,30),
      icon:choice(item.icon || 'ruler',['ruler','weight','box','length','width','height','tag']),visible:bool(item.visible ?? true)}),'id'),
    autoplay:bool(value.autoplay ?? true),interval:integer(value.interval ?? 6,2,60),tagline:string(value.tagline,160),footer:string(value.footer,240),
    ogTitle:string(value.ogTitle,140),ogDescription:string(value.ogDescription,300),ogImageId:optionalAsset(value.ogImageId),
    logoId:optionalAsset(value.logoId)};
}
const validators = {
  'gallery.command.review':body => ({priorAction:choice(body.priorAction,['gallery.stock','gallery.order.place','gallery.order.update','gallery.sale','gallery.sale.reverse','gallery.preferences','gallery.presentation']),priorId:uuid(body.priorId)}),
  'gallery.snapshot':body => ({...page(body),manage:bool(body.manage ?? false)}),
  'gallery.orders':body => ({...page(body),scope:choice(body.scope ?? 'own',['own','staff']),status:body.status ? choice(body.status,STATUS) : ''}),
  'gallery.personal':page,
  'gallery.sales':body => ({...page(body),orderId:uuid(body.orderId),productId:productId(body.productId)}),
  'gallery.stock':body => {
    const rows=list(body.rows,100,listing,'productId'); if (!rows.length) invalid(); return {rows};
  },
  'gallery.order.place':body => {
    if (body.accepted !== true) invalid();
    const items=list(body.items,100,line=>orderLine(line,true),'productId');
    if (!items.length) invalid();
    return {items,note:string(body.note,1200),accepted:true};
  },
  'gallery.order.update':body => {
    const update={orderId:uuid(body.orderId),version:rev(body.version),archive:bool(body.archive ?? false)};
    if (update.archive && ['status','adminNote','customerNote','items'].some(field=>body[field]!=null)) invalid();
    if (body.status != null) update.status=choice(body.status,STATUS);
    if (body.customerNote != null) update.customerNote=string(body.customerNote,1500);
    if (body.adminNote != null) update.adminNote=string(body.adminNote,1500);
    if (body.items != null) {
      update.items=list(body.items,100,line=>orderLine(line,false),'productId');
      if (!update.items.length) invalid();
    }
    if (!update.archive && !update.status && update.adminNote == null && update.customerNote == null && !update.items) invalid();
    return update;
  },
  'gallery.sale':body => ({orderId:uuid(body.orderId),productId:productId(body.productId),quantity:integer(body.quantity,1,1000000),
    priceMinor:amount(body.priceMinor),buyer:string(body.buyer,120),phone:string(body.phone,50),note:string(body.note,800)}),
  'gallery.sale.reverse':body => ({saleId:uuid(body.saleId)}),
  'gallery.preferences':body => {
    if (body.target === 'print') {
      return {target:'print',version:rev(body.version),name:string(body.name,150),phone:string(body.phone,60),footer:string(body.footer,360),logoId:optionalAsset(body.logoId)};
    }
    if (body.target !== 'line') invalid();
    return {target:'line',orderId:uuid(body.orderId),productId:productId(body.productId),version:rev(body.version),
      retailMinor:body.retailMinor == null ? null : amount(body.retailMinor),showBase:bool(body.showBase),showRetail:bool(body.showRetail),
      showInPrint:bool(body.showInPrint),hidden:bool(body.hidden)};
  },
  'gallery.presentation':body => ({version:rev(body.version),value:presentation(body.value)}),
  'gallery.image':body => {
    if (body.assetId) return {assetId:uuid(body.assetId)};
    return {productId:productId(body.productId),orderId:body.orderId ? uuid(body.orderId) : null};
  }
};
const reads = new Set(['gallery.snapshot','gallery.orders','gallery.personal','gallery.sales','gallery.image','gallery.command.review']);
export function validateGalleryAction(action,body) {
  if (!plain(body) || !Object.hasOwn(validators,action)) invalid();
  const result=validators[action](body);
  if (!reads.has(action)) result.commandId=uuid(body.commandId);
  return result;
}
function decodeImage(data) {
  if (typeof data !== 'string' || data.length > 5600000) invalid('INVALID_IMAGE');
  const match=/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(data);
  if (!match) invalid('INVALID_IMAGE');
  let bytes;
  try { bytes=Uint8Array.from(atob(match[2]), c=>c.charCodeAt(0)); } catch { invalid('INVALID_IMAGE'); }
  if (bytes.length < 12 || bytes.length > 4*1024*1024) invalid('INVALID_IMAGE');
  const has=(at,signature)=>signature.every((byte,index)=>bytes[at+index]===byte);
  const type=match[1];
  if (!(type==='jpeg' && has(0,[255,216,255]) || type==='png' && has(0,[137,80,78,71,13,10,26,10]) ||
    type==='webp' && has(0,[82,73,70,70]) && has(8,[87,69,66,80]))) invalid('INVALID_IMAGE');
  return {bytes,type};
}
export function createGalleryActions({moduleRpc,storage}) {
  function rpc(action,values,actor) {
    return moduleRpc('wow_gallery_service',action,{...values,userId:actor.userId,sessionId:actor.sessionId});
  }
  const actions=Object.fromEntries(Object.keys(validators).map(action=>[action,async({body,actor})=>{
    const result=await rpc(action,validateGalleryAction(action,body),actor);
    if (action!=='gallery.image') return result;
    return {url:result.path ? await storage.sign(result.path,90) : null};
  }]));
  actions['gallery.image.upload']=async({body,actor})=>{
    const purpose=choice(body.purpose,['presentation','print']),commandId=uuid(body.commandId);
    const {bytes,type}=decodeImage(body.data);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const metadata={purpose,commandId,type,digest,size:bytes.length};
    const prepared=await rpc('gallery.image.prepare',metadata,actor);
    if (!prepared.ready) await storage.put(prepared.path,bytes,'image/'+type);
    return rpc('gallery.image.commit',metadata,actor);
  };
  return actions;
}

// Copy for the shared Web Push worker. This is intentionally independent of
// business payload fields; prices, contact information and notes stay in-app.
const notificationCopy={
  'order.created':{ar:['طلب معرض جديد','افتح الطلبات لمراجعة الطلب.'],en:['New gallery order','Open orders to review the order.'],tr:['Yeni galeri siparişi','Siparişi incelemek için siparişleri açın.'],fr:['Nouvelle commande galerie','Ouvrez les commandes pour la consulter.'],ru:['Новый заказ в галерее','Откройте заказы для просмотра.']},
  'order.updated':{ar:['تحديث على طلبك','افتح طلباتك لعرض التحديث.'],en:['Order updated','Open your orders to see the update.'],tr:['Siparişiniz güncellendi','Güncellemeyi görmek için siparişlerinizi açın.'],fr:['Commande mise à jour','Ouvrez vos commandes pour consulter la mise à jour.'],ru:['Заказ обновлён','Откройте свои заказы для просмотра.']},
  'stock.updated':{ar:['تحديث المخزون','افتح المعرض للاطلاع على التوفر.'],en:['Gallery stock updated','Open the gallery to check availability.'],tr:['Galeri stoğu güncellendi','Stok durumunu görmek için galeriyi açın.'],fr:['Stock de la galerie mis à jour','Ouvrez la galerie pour consulter les disponibilités.'],ru:['Остатки в галерее обновлены','Откройте галерею, чтобы проверить наличие.']}
};
export function formatGalleryNotice(verified,language='ar'){
  const options=notificationCopy[verified?.kind];if(!options)return null;
  const [title,body]=options[language]||options.en;
  const route=verified.kind==='stock.updated'?'gallery':verified.kind==='order.created'?'gallery-orders':'my-orders';
  const params=route==='gallery'?{productId:productId(verified.productId)}:{orderId:uuid(verified.orderId)};
  return {title,body,route,params,tag:'gallery-'+uuid(verified.eventId)};
}
