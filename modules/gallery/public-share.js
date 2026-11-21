(function(root){
 'use strict';
 const languages=['ar','en','tr','fr','ru'],words={
  heading:['معاينة المشاركة العامة','Public link preview','Herkese açık bağlantı önizlemesi','Aperçu du lien public','Предпросмотр публичной ссылки'],
  info:['انشر نسخة من عنوان المعاينة ووصفها وصورتها المحفوظة. تبقى بيانات الشركة والطلبات والحسابات داخل التطبيق.','Publish a copy of the saved preview title, description and image. Company records, orders and accounts stay inside the app.','Kayıtlı önizleme başlığı, açıklaması ve görselinin kopyasını yayımlayın. Şirket kayıtları, siparişler ve hesaplar uygulamada kalır.','Publiez une copie du titre, de la description et de l’image enregistrés. Les dossiers, commandes et comptes restent dans l’application.','Опубликуйте копию сохранённого заголовка, описания и изображения. Записи компании, заказы и аккаунты остаются в приложении.'],
  consent:['أوافق على جعل هذا العنوان والوصف والصورة متاحة للعموم.','I approve making this title, description and image public.','Bu başlık, açıklama ve görselin herkese açık olmasını onaylıyorum.','J’autorise la publication de ce titre, de cette description et de cette image.','Я разрешаю сделать этот заголовок, описание и изображение общедоступными.'],
  publish:['نشر النسخة المحفوظة','Publish saved preview','Kayıtlı önizlemeyi yayımla','Publier l’aperçu enregistré','Опубликовать сохранённый вариант'],
  unpublish:['إيقاف المعاينة العامة','Unpublish preview','Önizlemeyi yayından kaldır','Retirer l’aperçu public','Снять с публикации'],
  active:['المعاينة منشورة','Preview is published','Önizleme yayında','L’aperçu est publié','Предпросмотр опубликован'],
  inactive:['المعاينة غير منشورة','Preview is not published','Önizleme yayında değil','L’aperçu n’est pas publié','Предпросмотр не опубликован'],
  changed:['تغيّرت الهوية المحفوظة منذ النشر. راجعها ثم انشر نسخة جديدة.','Saved identity changed since publication. Review it and publish a new copy.','Kayıtlı kimlik yayımdan sonra değişti. Kontrol edip yeni kopyayı yayımlayın.','L’identité a changé depuis la publication. Vérifiez et publiez une nouvelle copie.','Сохранённое оформление изменилось. Проверьте его и опубликуйте новую копию.'],
  needSave:['احفظ العنوان والصورة والتعديلات أولًا.','Save the title, image and edits first.','Önce başlığı, görseli ve değişiklikleri kaydedin.','Enregistrez d’abord le titre, l’image et les modifications.','Сначала сохраните заголовок, изображение и изменения.'],
  unavailable:['ينتظر ربط مسار المشاركة بنطاق التطبيق.','Waiting for the share route on the app domain.','Uygulama alanında paylaşım yolu kurulumu bekleniyor.','Le chemin de partage attend son raccordement au domaine.','Ожидается подключение страницы к домену приложения.'],
  retained:['إيقاف النشر يمنع الطلبات الجديدة. قد تحتفظ تطبيقات المشاركة بنسخ سبق جلبها.','Unpublishing blocks new requests. Sharing services may retain copies already fetched.','Yayından kaldırma yeni istekleri durdurur. Paylaşım hizmetleri önceki kopyaları tutabilir.','Le retrait bloque les nouvelles requêtes. Les services de partage peuvent conserver des copies déjà reçues.','Снятие с публикации блокирует новые запросы. Сервисы обмена могут хранить ранее полученные копии.'],
  refresh:['تحديث الحالة','Refresh status','Durumu yenile','Actualiser l’état','Обновить состояние'],
  check:['فحص الرابط المنشور','Check published link','Yayımlanan bağlantıyı kontrol et','Vérifier le lien publié','Проверить опубликованную ссылку'],
  checked:['استجاب مسار النطاق بمعاينة HTML مطابقة.','The domain route returned the matching HTML preview.','Alan yolu eşleşen HTML önizlemesini döndürdü.','Le domaine a renvoyé l’aperçu HTML attendu.','Домен вернул соответствующий HTML-предпросмотр.'],
  failed:['تعذّر إكمال العملية. حدّث الحالة قبل إعادة المحاولة.','The operation failed. Refresh status before retrying.','İşlem tamamlanamadı. Yeniden denemeden önce durumu yenileyin.','L’opération a échoué. Actualisez l’état avant de réessayer.','Операция не выполнена. Обновите состояние перед повтором.'],
  open:['فتح المعاينة العامة','Open public preview','Herkese açık önizlemeyi aç','Ouvrir l’aperçu public','Открыть публичный предпросмотр'],
  pending:['جارٍ تنفيذ العملية…','Working…','İşleniyor…','Traitement…','Выполняется…']
 };
 function mount({container,api,locale=()=> 'ar',isDirty=()=>false}){
  if(api.getSession?.()?.currentAccount?.role!=='owner')return {dispose(){},draftChanged(){}};
  const doc=container.ownerDocument||root.document;let disposed=false,state=null,busy=false,note='',approved=false,attempt=null;
  const t=key=>words[key][Math.max(0,languages.indexOf(locale()))];
  const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const alive=()=>!disposed&&api.getSession?.()?.currentAccount?.role==='owner';
  const request=async(action,body={})=>{if(!alive())throw Error('AUTH_REQUIRED');const value=await api.request(action,body);if(!alive())throw Error('AUTH_REQUIRED');return value;};
  async function run(fn){if(busy||!alive())return;busy=true;note='';render();try{await fn();}
   catch(error){if(alive())note=t(error?.code==='SHARE_NOT_CONFIGURED'?'unavailable':'failed');}
   finally{if(alive()){busy=false;render();}}}
  const load=()=>run(async()=>{state=await request('gallery.share.status');});
  async function change(publish){
   if(!state||publish&&(!approved||isDirty()||!state.title||!state.hasImage))return;
   const body={revision:state.revision,...(publish?{presentationVersion:state.presentationVersion,language:locale(),confirmed:true}:{})};
   const action=publish?'gallery.share.publish':'gallery.share.unpublish',fingerprint=JSON.stringify([action,body]);
   if(!attempt||attempt.fingerprint!==fingerprint)attempt={fingerprint,commandId:root.crypto.randomUUID()};
   await request(action,{...body,commandId:attempt.commandId});attempt=null;approved=false;
   state=await request('gallery.share.status');
  }
  async function check(){
   if(!state?.published||!state.url)return;
   const target=new URL(state.url);if(target.origin!==root.location?.origin||target.pathname!=='/share/'+state.publicId+'/')throw Error('UNREADY');
   const controller=new AbortController(),timer=root.setTimeout(()=>controller.abort(),8000);
   try{
    const response=await root.fetch(target.href,{cache:'no-store',redirect:'error',credentials:'omit',signal:controller.signal});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('text/html')||Number(response.headers.get('content-length')||0)>16384)throw Error('UNREADY');
    if(!response.body)throw Error('UNREADY');const reader=response.body.getReader(),chunks=[];let length=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel().catch(()=>{});throw Error('UNREADY');}chunks.push(value);}}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const text=new TextDecoder().decode(bytes);if(!text.includes('<meta property="og:url" content="'+target.href+'">'))throw Error('UNREADY');
    if(alive())note=t('checked');
   }finally{root.clearTimeout(timer);}
  }
  function render(){
   if(!alive())return;container.replaceChildren();const area=el('section','card wfg-form wfg-brand-form');
   area.append(el('h3','',t('heading')),el('p','',t('info')));
   const status=el('p','wfg-status',busy?t('pending'):state?t(state.published?'active':'inactive'):'');status.setAttribute('role','status');area.append(status);
   if(state){
    if(!state.configured)area.append(el('p','wfg-warning',t('unavailable')));
    if(state.published&&state.publishedVersion!==state.presentationVersion)area.append(el('p','wfg-warning',t('changed')));
    if(state.title)area.append(el('strong','',state.title));if(state.description)area.append(el('p','',state.description));
    if(isDirty()||!state.title||!state.hasImage)area.append(el('p','wfg-warning',t('needSave')));
    const label=el('label','wfg-check'),check=el('input');check.type='checkbox';check.checked=approved;check.disabled=busy;label.append(check,el('span','',t('consent')));
    check.addEventListener('change',()=>{approved=check.checked;render();});area.append(label);
   }
   const buttons=el('div','wfg-actions');
   const button=(key,fn,disabled=false)=>{const n=el('button','btn wfg-button',t(key));n.type='button';n.disabled=busy||disabled;n.addEventListener('click',()=>run(fn));buttons.append(n);};
   button('refresh',async()=>{state=await request('gallery.share.status');});
   button('publish',()=>change(true),!state?.configured||!approved||isDirty()||!state?.title||!state?.hasImage);
   if(state?.published){
    button('unpublish',()=>change(false));
    if(state.url){const link=el('a','btn wfg-button',t('open'));try{const url=new URL(state.url);
      if(['https://galeri.wowfurniture.com.tr','https://markrobot.wowfurniture.com.tr'].includes(url.origin)&&url.pathname==='/share/'+state.publicId+'/'&&!url.search&&!url.hash){link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';buttons.append(link);}}
     catch{}button('check',check);}
   }
   area.append(buttons,el('p','wfg-status',t('retained')));
   if(note){const n=el('p','wfg-status',note);n.setAttribute('role','status');area.append(n);}container.append(area);
  }
  load();return {dispose(){disposed=true;container.replaceChildren();},draftChanged:render,updateLanguage:render};
 }
 root.WFGalleryPublicShare=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);
