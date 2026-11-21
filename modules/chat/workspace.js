(function(root){
  'use strict';
  const C=root.WFFileCore,H=root.WFChatCore;if(!C||!H)return;
  const {el,button,field,input,options}=C,title={en:'Chat',ar:'الدردشة',tr:'Sohbet',fr:'Discussion',ru:'Чат'};
  const words={...C.errors,
    fullscreen:['Full screen','ملء الشاشة','Tam ekran','Plein écran','На весь экран'],
    hide:['Delete for me','حذف لديّ','Benden sil','Supprimer pour moi','Удалить у меня'],
    removePhoto:['Remove photo','إزالة الصورة','Fotoğrafı kaldır','Supprimer la photo','Убрать фото'],previous:['Previous','السابق','Önceki','Précédent','Назад'],next:['Next','التالي','Sonraki','Suivant','Далее'],
    rooms:['Conversations','المحادثات','Sohbetler','Conversations','Беседы'],team:['Team','الفريق','Ekip','Équipe','Команда'],
    direct:['Direct message','محادثة خاصة','Özel mesaj','Message privé','Личное сообщение'],group:['New group','مجموعة جديدة','Yeni grup','Nouveau groupe','Новая группа'],
    profile:['Chat profile','ملف الدردشة','Sohbet profili','Profil de discussion','Профиль в чате'],name:['Display name','الاسم المعروض','Görünen ad','Nom affiché','Отображаемое имя'],
    status:['Status','الحالة','Durum','Statut','Статус'],photo:['Photo','الصورة','Fotoğraf','Photo','Фото'],save:['Save','حفظ','Kaydet','Enregistrer','Сохранить'],
    searchPeople:['Find a person','ابحث عن شخص','Kişi ara','Rechercher une personne','Найти участника'],members:['Members','الأعضاء','Üyeler','Membres','Участники'],
    description:['Description','الوصف','Açıklama','Description','Описание'],icon:['Group emoji','رمز المجموعة','Grup emojisi','Émoji du groupe','Эмодзи группы'],
    groupName:['Group name','اسم المجموعة','Grup adı','Nom du groupe','Название группы'],newGroup:['Create group','إنشاء مجموعة','Grup oluştur','Créer le groupe','Создать группу'],
    search:['Search messages','بحث في الرسائل','Mesajlarda ara','Rechercher des messages','Поиск сообщений'],messages:['Messages','الرسائل','Mesajlar','Messages','Сообщения'],
    image:['Images','الصور','Resimler','Images','Изображения'],video:['Videos','الفيديو','Videolar','Vidéos','Видео'],audio:['Audio','الصوت','Ses','Audio','Аудио'],
    files:['Files','الملفات','Dosyalar','Fichiers','Файлы'],links:['Links','الروابط','Bağlantılar','Liens','Ссылки'],starred:['Starred','المميزة','Yıldızlı','Favoris','Избранные'],
    mentioned:['Mentions','الإشارات','Bahsetmeler','Mentions','Упоминания'],settings:['Room settings','إعدادات المحادثة','Sohbet ayarları','Réglages de conversation','Настройки беседы'],
    archived:['Archived','المؤرشفة','Arşivlenen','Archivées','Архив'],muted:['Mute notifications','كتم الإشعارات','Bildirimleri sessize al','Couper les notifications','Отключить уведомления'],
    wallpaper:['Wallpaper','الخلفية','Duvar kâğıdı','Fond d’écran','Фон'],plain:['Default','الافتراضي','Varsayılan','Par défaut','Обычный'],warm:['Warm','دافئ','Sıcak','Chaud','Тёплый'],cool:['Cool','بارد','Soğuk','Froid','Холодный'],custom:['Custom image','صورة خاصة','Özel resim','Image personnelle','Своё изображение'],
    disappearing:['Delete my new messages after','حذف رسائلي الجديدة بعد','Yeni mesajlarımı silme süresi','Effacer mes nouveaux messages après','Удалять мои новые сообщения через'],
    off:['Keep messages','الاحتفاظ بالرسائل','Mesajları sakla','Conserver les messages','Хранить сообщения'],day:['24 hours','24 ساعة','24 saat','24 heures','24 часа'],
    week:['7 days','7 أيام','7 gün','7 jours','7 дней'],month:['30 days','30 يومًا','30 gün','30 jours','30 дней'],
    clear:['Clear for me','مسح لديّ','Benden temizle','Effacer pour moi','Очистить у меня'],clearAsk:['Clear your view of this conversation?','مسح هذه المحادثة من عرضك؟','Bu sohbet sizin için temizlensin mi?','Effacer cette conversation pour vous ?','Очистить эту беседу у себя?'],
    manage:['Manage group','إدارة المجموعة','Grubu yönet','Gérer le groupe','Управление группой'],deleteGroup:['Delete group','حذف المجموعة','Grubu sil','Supprimer le groupe','Удалить группу'],
    add:['Add member','إضافة عضو','Üye ekle','Ajouter un membre','Добавить участника'],remove:['Remove member','إزالة عضو','Üyeyi çıkar','Retirer le membre','Удалить участника'],
    ban:['Ban','حظر','Engelle','Bannir','Заблокировать'],unban:['Unban','إلغاء الحظر','Engeli kaldır','Débannir','Разблокировать'],promote:['Make moderator','تعيين مشرف','Moderatör yap','Nommer modérateur','Назначить модератором'],demote:['Remove moderator role','إلغاء الإشراف','Moderatörlüğü kaldır','Retirer le rôle','Снять роль модератора'],
    owner:['Owner','المالك','Sahip','Propriétaire','Владелец'],moderator:['Moderator','مشرف','Moderatör','Modérateur','Модератор'],member:['Member','عضو','Üye','Membre','Участник'],banned:['Banned','محظور','Engellendi','Banni','Заблокирован'],
    choose:['Choose a conversation','اختر محادثة','Bir sohbet seçin','Choisissez une conversation','Выберите беседу'],none:['No messages.','لا توجد رسائل.','Mesaj yok.','Aucun message.','Нет сообщений.'],
    older:['Older','الأقدم','Daha eski','Plus anciens','Старее'],newer:['Newer','الأحدث','Daha yeni','Plus récents','Новее'],latest:['Latest','الأخيرة','En son','Derniers','Последние'],top:['Top','الأعلى','En üst','Haut','Вверх'],
    write:['Write a message','اكتب رسالة','Mesaj yaz','Écrire un message','Написать сообщение'],send:['Send','إرسال','Gönder','Envoyer','Отправить'],attach:['Attach','إرفاق','Dosya ekle','Joindre','Прикрепить'],
    voice:['Voice note','رسالة صوتية','Sesli mesaj','Message vocal','Голосовое сообщение'],stop:['Finish recording','إنهاء التسجيل','Kaydı bitir','Terminer l’enregistrement','Завершить запись'],
    cancel:['Cancel','إلغاء','İptal','Annuler','Отмена'],recording:['Recording','جار التسجيل','Kaydediliyor','Enregistrement','Запись'],voiceFailed:['Microphone access is unavailable.','تعذر استخدام الميكروفون.','Mikrofon kullanılamıyor.','Le microphone est indisponible.','Микрофон недоступен.'],
    emoji:['Emoji','رمز تعبيري','Emoji','Émoji','Эмодзи'],reply:['Reply','رد','Yanıtla','Répondre','Ответить'],edit:['Edit','تعديل','Düzenle','Modifier','Изменить'],delete:['Delete','حذف','Sil','Supprimer','Удалить'],
    forward:['Forward','إعادة توجيه','İlet','Transférer','Переслать'],copy:['Copy','نسخ','Kopyala','Copier','Копировать'],copied:['Copied','تم النسخ','Kopyalandı','Copié','Скопировано'],
    share:['Share','مشاركة','Paylaş','Partager','Поделиться'],select:['Select','تحديد','Seç','Sélectionner','Выбрать'],info:['Message info','معلومات الرسالة','Mesaj bilgisi','Infos du message','Данные сообщения'],
    seen:['Read by','قرأها','Okuyanlar','Lu par','Прочитали'],reactions:['Reactions','التفاعلات','Tepkiler','Réactions','Реакции'],star:['Star','تمييز','Yıldızla','Ajouter aux favoris','В избранное'],unstar:['Unstar','إزالة التمييز','Yıldızı kaldır','Retirer des favoris','Убрать из избранного'],
    actions:['Message actions','إجراءات الرسالة','Mesaj işlemleri','Actions du message','Действия с сообщением'],attachment:['Attachment','مرفق','Ek','Pièce jointe','Вложение'],
    edited:['Edited','معدلة','Düzenlendi','Modifié','Изменено'],forwarded:['Forwarded','معاد توجيهها','İletildi','Transféré','Переслано'],
    typing:['Typing…','يكتب…','Yazıyor…','Écrit…','Печатает…'],download:['Download','تنزيل','İndir','Télécharger','Скачать'],play:['Open media','فتح الوسائط','Medyayı aç','Ouvrir le média','Открыть медиа'],
    speed:['Playback speed','سرعة التشغيل','Oynatma hızı','Vitesse de lecture','Скорость воспроизведения'],actionsConfirm:['Confirm this action?','هل تريد تأكيد الإجراء؟','İşlem onaylansın mı?','Confirmer cette action ?','Подтвердить действие?'],
    queue:['Waiting to send. Keep chat open to retry when connected.','بانتظار الإرسال. أبقِ الدردشة مفتوحة لإعادة المحاولة عند الاتصال.','Gönderim bekliyor. Bağlantı gelene kadar sohbeti açık tutun.','Envoi en attente. Gardez la discussion ouverte pour réessayer à la reconnexion.','Ожидание отправки. Оставьте чат открытым до подключения.'],
    retry:['Retry','إعادة المحاولة','Yeniden dene','Réessayer','Повторить'],selected:['Selected','محدد','Seçili','Sélection','Выбрано'],back:['Conversations','المحادثات','Sohbetler','Conversations','Беседы'],
    created:['Group created','تم إنشاء المجموعة','Grup oluşturuldu','Groupe créé','Группа создана'],renamed:['Group updated','تم تعديل المجموعة','Grup güncellendi','Groupe modifié','Группа изменена'],
    unread:['Unread','غير مقروءة','Okunmadı','Non lus','Не прочитано'],preview:['Preview','معاينة','Önizleme','Aperçu','Просмотр'],nextMatch:['Next match','النتيجة التالية','Sonraki sonuç','Résultat suivant','Следующее совпадение'],
    loading:['Loading…','جار التحميل…','Yükleniyor…','Chargement…','Загрузка…']
  };
  function mount({container,api,lang,params={}}){
    let language=lang||'en',me=null,rooms=[],room=null,feed=null,members=[],generation=0,feedSeq=0,roomSeq=0,alive=true,polling=false;
    let filter='',query='',before=null,stack=[],archived=false,screen='rooms',selected=new Map(),lastFeed='',roomsView='',matchAt=0;
    let reply=null,editing=null,attached=null,sending=false,recording=null,recordRequest=0,lastTyping=0,draftTimer,searchTimer,expiryTimer,written=false;
    const retrySends=new Map(),durable=new Map(),drafts=new Map(),thumbs=new Map(),inflightThumbs=new Set(),ui=C.surface(container,api,()=>language,words),{t,run,dialog}=ui;
    const req=(action,data={})=>api.request('chat.'+action,data),edit=()=>api.can('chat.edit'),del=()=>api.can('chat.delete');
    const act=(label,fn,cls)=>button(label,run(fn),cls);
    const app=el('section',null,'wf-chat'),side=el('aside',null,'wf-chat-side'),sideTools=el('div',null,'wf-chat-sidebar-tools'),roomList=el('div',null,'wf-chat-rooms'),
      main=el('section',null,'wf-chat-main'),head=el('header',null,'wf-chat-head'),browse=el('div',null,'wf-chat-browse'),selection=el('div',null,'wf-chat-selection'),
      feedBox=el('div',null,'wf-chat-feed'),paging=el('div',null,'wf-chat-paging'),indicators=el('div',null,'wf-chat-indicators'),composer=el('div',null,'wf-chat-composer'),
      status=el('div',null,'wf-chat-status'),draft=el('textarea'),draftInfo=el('div',null,'wf-chat-draft-info'),mentions=el('div',null,'wf-chat-mentions'),sendTools=el('div',null,'wf-chat-send-tools');
    status.setAttribute('role','status');indicators.setAttribute('role','status');feedBox.setAttribute('role','log');feedBox.setAttribute('aria-live','off');
    draft.maxLength=8000;draft.rows=2;app.append(side,main);side.append(sideTools,roomList);main.append(head,browse,selection,feedBox,paging,indicators,composer,status);composer.append(draftInfo,draft,mentions,sendTools);container.append(app);
    const picker=el('input');picker.type='file';picker.hidden=true;composer.append(picker);
    const roomName=r=>r?.kind==='team'&&!r.name?t('team'):(r?.name||t('direct'));
    const roomNow=id=>alive&&room?.id===id;
    function closeDialogs(){for(const d of container.querySelectorAll('dialog[open]'))d.close();}
    function showScreen(value){screen=value;app.dataset.screen=screen;}
    function actionStatus(error){
      if(!alive)return;
      if(error?.code==='ACCESS_DENIED'||error?.code==='PERMISSION_DENIED'||error?.status===401||error?.status===403){if(room){drafts.delete(room.id);rooms=rooms.filter(r=>r.id!==room.id);}leaveRoom(false);closeDialogs();status.textContent=t('denied');}
      else status.textContent=t(error?.code==='OFFLINE_NOT_CACHED'?'uncached':error?.code==='NETWORK'?'offline':'failed');
    }
    function checkConfirm(label,task){
      const {d,body}=dialog(label);body.append(el('p',t('actionsConfirm')),act(label,async()=>{await task();d.close();},'wf-collab-danger'));
    }
    function setPreviewImage(img,request,key){
      const cached=thumbs.get(key);if(cached&&cached.until>Date.now()+3000){img.src=cached.url;return;}
      if(inflightThumbs.has(key)||inflightThumbs.size>=6)return;
      inflightThumbs.add(key);
      req('asset',request).then(h=>{if(!alive)return;const url=C.authorizedUrl(h.url);thumbs.set(key,{url,until:Date.parse(h.expiresAt)});if(img.isConnected)img.src=url;}).catch(()=>{}).finally(()=>inflightThumbs.delete(key));
    }
    function addAvatar(where,r){
      const face=el('span',r.emoji||(r.kind==='team'?'◎':roomName(r).slice(0,1)),'wf-chat-avatar');where.append(face);
      if(r.avatar||r.peer?.avatar){const img=el('img');img.alt='';img.referrerPolicy='no-referrer';face.append(img);
        queueMicrotask(()=>{if(img.isConnected)setPreviewImage(img,r.avatar?{purpose:'room',roomId:r.id}:{purpose:'profile',targetId:r.peer.id},String(r.avatar||r.peer.avatar));});}
    }
    function sideHeader(){
      sideTools.replaceChildren(el('h3',t('rooms')));const controls=el('div',null,'wf-chat-chips');
      const toggle=act(t(archived?'rooms':'archived'),()=>{archived=!archived;roomsView='';sideHeader();drawRooms();});controls.append(toggle);
      if(edit()){
        controls.append(act(t('direct'),()=>peopleDialog('direct')));
        if(api.getSession?.()?.role!=='customer')controls.append(act(t('group'),groupDialog));
        controls.append(act(t('profile'),profileDialog));
      }
      sideTools.append(controls);
    }
    function drawRooms(){
      const signature=JSON.stringify([rooms,rooms.filter(r=>r.last?.expiresAt&&Date.parse(r.last.expiresAt)<=Date.now()).map(r=>r.id),room?.id,language,archived]);if(roomsView===signature)return;roomsView=signature;roomList.replaceChildren();
      for(const r of rooms.filter(x=>!!x.archived===archived)){
        const b=act('',()=>openRoom(r.id),'wf-chat-room'+(room?.id===r.id?' active':''));b.setAttribute('aria-current',room?.id===r.id?'page':'false');addAvatar(b,r);
        const description=el('span',null,'wf-chat-room-label'),last=r.last?.expiresAt&&Date.parse(r.last.expiresAt)<=Date.now()?null:r.last;
        description.append(el('strong',roomName(r)),el('small',last?.event?t(last.event):last?.text||(last?.attachment?t('attachment'):r.description||'')));b.append(description);
        if(r.unread){const count=el('span',String(r.unread),'wf-chat-badge');count.setAttribute('aria-label',r.unread+' '+t('unread'));b.append(count);}roomList.append(b);
      }
    }
    async function refreshRooms(){
      const seq=++roomSeq;let result;
      try{result=await req('rooms');}
      catch(error){if(alive&&seq===roomSeq&&(error.code==='ACCESS_DENIED'||error.status===401||error.status===403)){
        rooms=[];drafts.clear();thumbs.clear();durable.clear();retrySends.clear();leaveRoom(false);closeDialogs();}throw error;}
      if(!alive||seq!==roomSeq)return;
      rooms=result.rooms||[];if(room){const latest=rooms.find(r=>r.id===room.id);if(!latest){leaveRoom(false);closeDialogs();}else room=latest;}
      drawRooms();
    }
    function clearTimer(){clearTimeout(draftTimer);clearTimeout(searchTimer);clearTimeout(expiryTimer);}
    function stopRecord(accept=false){
      recordRequest++;if(!recording)return;const rec=recording;rec.accept=accept;clearInterval(rec.clock);clearTimeout(rec.timeout);
      if(rec.device.state!=='inactive')rec.device.stop();for(const track of rec.stream.getTracks())track.stop();recording=null;
    }
    function leaveRoom(flush=true){
      if(flush&&room&&written&&!editing)saveDraft(room.id,draft.value);
      clearTimer();stopRecord();generation++;feedSeq++;room=null;feed=null;members=[];before=null;stack=[];filter='';query='';lastFeed='';written=false;
      selected.clear();reply=null;editing=null;attached=null;draft.value='';mentions.replaceChildren();head.replaceChildren();browse.replaceChildren();selection.replaceChildren();feedBox.replaceChildren(el('p',t('choose'),'wf-collab-empty'));
      feedBox.style.removeProperty('background-image');feedBox.dataset.wallpaper='plain';paging.replaceChildren();indicators.replaceChildren();composer.hidden=true;status.textContent='';showScreen('rooms');drawRooms();
    }
    function openRoom(id){
      const next=rooms.find(r=>r.id===id);if(!next){status.textContent=t('denied');return;}
      leaveRoom();room=next;const current=++generation;showScreen('room');draft.value=drafts.get(id)||'';drawRoomHead();drawComposer();drawRooms();status.textContent=t('loading');
      req('members',{roomId:id}).then(r=>{if(alive&&current===generation)members=r.members||[];}).catch(e=>{if(current===generation)actionStatus(e);});
      return loadFeed(true).catch(e=>{if(current===generation)actionStatus(e);});
    }
    function drawRoomHead(){
      if(!room)return;head.replaceChildren();head.append(act(t('back'),()=>{leaveRoom();},'wf-chat-back'));const titleBox=el('div',null,'wf-chat-room-title');addAvatar(titleBox,room);titleBox.append(el('h3',roomName(room)));head.append(titleBox);
      head.append(act(t('members'),membersDialog),act(t('settings'),settingsDialog));browse.replaceChildren();
      const search=input(query,160);search.type='search';search.placeholder=t('search');search.setAttribute('aria-label',t('search'));
      search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFilter(filter,search.value),240);};
      const f=options(['','starred','mentioned','image','video','audio','files','links'].map(k=>[k,t(k||'messages')]),filter);f.setAttribute('aria-label',t('messages'));f.onchange=()=>applyFilter(f.value,search.value);
      browse.append(search,f,act(t('nextMatch'),()=>{const matches=Array.from(feedBox.querySelectorAll('mark'));if(matches.length)matches[(matchAt++)%matches.length].scrollIntoView({block:'center'});}));
      composer.hidden=!edit();
    }
    async function applyFilter(value,search){
      filter=value;query=search;before=null;stack=[];selected.clear();lastFeed='';matchAt=0;
      try{await loadFeed();}catch(e){actionStatus(e);}
    }
    async function wallpaper(id,prefs){
      const key=prefs.wallpaperAsset;feedBox.dataset.wallpaper=prefs.wallpaper||'plain';
      if(prefs.wallpaper!=='custom'||!key){feedBox.style.removeProperty('background-image');return;}
      const cached=thumbs.get(key);
      if(cached&&cached.until>Date.now()+3000){feedBox.style.backgroundImage='url("'+cached.url+'")';return;}
      const h=await req('asset',{roomId:id,purpose:'wallpaper'});if(!roomNow(id)||feed?.prefs?.wallpaperAsset!==key)return;
      const url=C.authorizedUrl(h.url);thumbs.set(key,{url,until:Date.parse(h.expiresAt)});feedBox.style.backgroundImage='url("'+url+'")';
    }
    async function loadFeed(first=false){
      if(!room)return;const id=room.id,seq=++feedSeq;
      const result=await req('feed',{roomId:id,before,query,starred:filter==='starred',mentioned:filter==='mentioned',kind:['image','video','audio','files','links'].includes(filter)?filter:null});
      if(!roomNow(id)||seq!==feedSeq)return;feed=result;
      if(!result._sync?.stale)for(const m of result.messages)if(m.requestId)durable.delete(m.requestId);
      if(first&&!written&&!drafts.has(id))draft.value=result.prefs.draft||'';
      const signature=JSON.stringify([result.messages,result.readByPeer,before,query,language]);
      if(lastFeed!==signature){const bottom=feedBox.scrollHeight-feedBox.scrollTop-feedBox.clientHeight<80;lastFeed=signature;
        const live=new Set(result.messages.map(m=>m.id));for(const key of selected.keys())if(!live.has(key))selected.delete(key);
        drawMessages();if((first||bottom)&&!before&&!query&&!filter)feedBox.scrollTop=feedBox.scrollHeight;}
      for(const d of container.querySelectorAll('dialog[data-message-id][open]'))if(!result.messages.some(m=>m.id===d.dataset.messageId&&(!m.expiresAt||Date.parse(m.expiresAt)>Date.now())))d.close();
      clearTimeout(expiryTimer);
      const upcoming=result.messages.flatMap(m=>[Date.parse(m.expiresAt),Date.parse(m.reply?.expiresAt)]).filter(time=>time>Date.now()).sort((a,b)=>a-b)[0];
      if(upcoming&&upcoming-Date.now()<2147483647)expiryTimer=setTimeout(()=>{if(roomNow(id)){lastFeed='';drawMessages();drawRooms();}},Math.max(0,upcoming-Date.now())+1);
      drawPaging();indicators.textContent=!result._sync?.stale&&result.typing?.length?result.typing.map(p=>p.name).join('، ')+' · '+t('typing'):'';
      if(!durable.size)status.textContent=result._sync?.source==='device'?[t('device'),new Date(result._sync.cachedAt).toLocaleString(language)].filter(Boolean).join(' · '):'';wallpaper(id,result.prefs).catch(()=>{});
      const latest=result.messages.at(-1)?.id;
      if(latest&&!before&&!filter&&!query&&H.after(latest,result.prefs.readId)&&!root.document.hidden&&!result._sync?.stale)req('read',{roomId:id,messageId:latest}).catch(()=>{});
    }
    function drawPaging(){
      paging.replaceChildren();const history=act(t('older'),async()=>{stack.push(before);before=feed.messages[0].id;lastFeed='';await loadFeed();feedBox.scrollTop=feedBox.scrollHeight;});
      history.disabled=!feed?.more;
      paging.append(history);if(before)paging.append(act(t('newer'),async()=>{before=stack.pop()||null;lastFeed='';await loadFeed();}));
      paging.append(act(t('top'),()=>{feedBox.scrollTop=0;}),act(t('latest'),async()=>{before=null;stack=[];await loadFeed();feedBox.scrollTop=feedBox.scrollHeight;}));
    }
    function quote(m){return m.text||m.asset?.name||t('attachment');}
    function setReply(m){if(!edit())return;editing=null;reply=m;drawComposer();draft.focus();}
    function setEdit(m){if(!edit())return;drafts.set(room.id,draft.value);editing=m;reply=null;attached=null;draft.value=m.text;drawComposer();draft.focus();}
    function clearComposeAction(){
      if(editing)draft.value=drafts.get(room.id)||'';editing=null;reply=null;attached=null;drawComposer();
    }
    function drawSelection(){
      selection.replaceChildren();if(!selected.size)return;
      const list=Array.from(selected.values());selection.append(el('b',t('selected')+' '+list.length),act(t('cancel'),()=>{selected.clear();drawMessages();}),act(t('copy'),()=>copy(list)),act(t('star'),async()=>{
        for(const m of list)await req('star',{roomId:m.roomId,messageId:m.id,active:true});selected.clear();await loadFeed();}));
      if(edit())selection.append(act(t('forward'),()=>forwardDialog(list)));
      if(list.every(canDeleteMessage))selection.append(act(t('delete'),()=>checkConfirm(t('delete'),async()=>{for(const m of list)await req('delete',{roomId:m.roomId,messageId:m.id});selected.clear();await loadFeed();})));
    }
    function toggleSelect(m){if(selected.has(m.id))selected.delete(m.id);else selected.set(m.id,m);drawMessages();}
    async function copy(list){
      const text=list.map(m=>m.author+' — '+quote(m)).join('\n');
      if(root.navigator.clipboard){await root.navigator.clipboard.writeText(text);api.notify?.(t('copied'),'success');}
      else {const {body}=dialog(t('copy')),a=el('textarea');a.readOnly=true;a.value=text;body.append(a);a.select();}
    }
    async function react(m,value){await req('react',{roomId:m.roomId,messageId:m.id,emoji:m.myReaction===value?'':value});await loadFeed();}
    function drawMessages(){
      feedBox.replaceChildren();drawSelection();if(!feed)return;
      if(!feed.messages.length)feedBox.append(el('p',t('none'),'wf-collab-empty'));
      for(const m of feed.messages){
        if(m.expiresAt&&Date.parse(m.expiresAt)<=Date.now())continue;
        const row=el('article',null,'wf-chat-line'+(m.authorId===me.id?' own':'')+(selected.has(m.id)?' chosen':''));row.dataset.msg=m.id;
        if(m.event){row.classList.add('system');row.append(el('small',[m.author,t(m.event),m.text].filter(Boolean).join(' · ')));feedBox.append(row);continue;}
        const bubble=el('div',null,'wf-chat-bubble'),by=el('div',null,'wf-chat-by');by.append(el('b',m.author));
        if(m.forwarded)by.append(el('small',t('forwarded')));by.append(act('⋯',()=>messageMenu(m),'wf-chat-menu'));by.lastChild.setAttribute('aria-label',t('actions'));bubble.append(by);
        if(m.reply&&(!m.reply.expiresAt||Date.parse(m.reply.expiresAt)>Date.now())){const q=act(m.reply.author+' · '+(m.reply.text||t('attachment')),async()=>{
          const here=Array.from(feedBox.querySelectorAll('[data-msg]')).find(n=>n.dataset.msg===m.reply.id);
          if(here){here.scrollIntoView({block:'center'});return;}stack.push(before);before=String(BigInt(m.reply.id)+1n);lastFeed='';await loadFeed();},'wf-chat-quote');bubble.append(q);}
        if(m.text){const p=el('p');for(const part of H.parts(m.text,query))p.append(part.match?el('mark',part.value):root.document.createTextNode(part.value));bubble.append(p);}
        if(filter==='links'){for(const href of H.links(m.text)){const a=el('a',href);a.href=href;a.target='_blank';a.rel='noopener noreferrer nofollow';bubble.append(a);}}
        if(m.asset)bubble.append(act(m.asset.name+' · '+C.humanBytes(m.asset.bytes,language),()=>openAsset(m),'wf-chat-file'));
        const meta=el('footer');const when=new Date(m.createdAt);meta.append(el('small',when.toLocaleString(language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})));
        if(m.editedAt)meta.append(el('small',t('edited')));if(m.starred)meta.append(el('small','★'));
        if(m.authorId===me.id)meta.append(el('small',H.after(m.id,feed.readByPeer)?'✓':'✓✓'));
        for(const [e,n] of Object.entries(m.reactions||{}))meta.append(act(e+' '+n,()=>edit()?react(m,e):infoDialog(m)));bubble.append(meta);row.append(bubble);feedBox.append(row);
        let start=null,lastTap=0;
        bubble.onpointerdown=e=>{if(!e.target.closest('button,a'))start={x:e.clientX,y:e.clientY};};
        bubble.onpointerup=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;
          if(Math.abs(dx)>65&&Math.abs(dy)<36){setReply(m);return;}
          if(Math.abs(dx)<8&&Math.abs(dy)<8){if(selected.size)toggleSelect(m);else if(Date.now()-lastTap<320&&edit()){run(()=>react(m,'❤️'))();lastTap=0;return;}lastTap=Date.now();}};
      }
    }
    function canEditMessage(m){return edit()&&m.authorId===me.id&&!m.forwarded&&(room.role!=='member'||Date.now()-Date.parse(m.createdAt)<=1800000);}
    function canDeleteMessage(m){return del()&&!m.event&&(room.role!=='member'||(m.authorId===me.id&&Date.now()-Date.parse(m.createdAt)<=3600000));}
    function messageMenu(m){
      const {d,body}=dialog(t('actions')),actions=el('div',null,'wf-chat-menu-actions');
      const item=(label,fn)=>actions.append(act(t(label),async()=>{d.close();await fn();}));
      if(edit()){const box=el('div',null,'wf-chat-chips');for(const emoji of H.reactions)box.append(act(emoji,async()=>{await react(m,emoji);d.close();}));body.append(box);
        item('reply',()=>setReply(m));item('forward',()=>forwardDialog([m]));}
      item('copy',()=>copy([m]));item(m.starred?'unstar':'star',async()=>{await req('star',{roomId:m.roomId,messageId:m.id,active:!m.starred});await loadFeed();});
      item('info',()=>infoDialog(m));item('select',()=>toggleSelect(m));
      if(root.navigator.share)item('share',()=>m.asset?openAsset(m):root.navigator.share({text:m.text}));
      if(canEditMessage(m))item('edit',()=>setEdit(m));
      item('hide',()=>checkConfirm(t('hide'),async()=>{await req('hide',{roomId:m.roomId,messageId:m.id});await loadFeed();}));
      if(canDeleteMessage(m))item('delete',()=>checkConfirm(t('delete'),async()=>{await req('delete',{roomId:m.roomId,messageId:m.id});await loadFeed();}));
      body.append(actions);
    }
    async function infoDialog(m){
      const {d,body}=dialog(t('info')),r=await req('info',{roomId:m.roomId,messageId:m.id});if(!d.open||!roomNow(m.roomId))return;
      body.append(el('h3',t('seen')));for(const p of r.readers)body.append(el('p',p.name+' · '+new Date(p.at).toLocaleString(language)));
      if(!r.readers.length)body.append(el('p','—'));body.append(el('h3',t('reactions')));for(const p of r.reactions)body.append(el('p',p.emoji+' '+p.name));if(!r.reactions.length)body.append(el('p','—'));
    }
    function forwardDialog(messages){
      const {d,body}=dialog(t('forward')),roomChoice=options(rooms.map(r=>[r.id,roomName(r)]),rooms.find(r=>r.id!==room?.id)?.id||room?.id);
      const jobs=messages.map(m=>({m,key:root.crypto.randomUUID(),sent:false}));let destination;
      const send=act(t('forward'),async()=>{send.disabled=true;destination=destination||roomChoice.value;roomChoice.disabled=true;
        try{for(const job of jobs){if(job.sent)continue;const ack=await req('forward',{roomId:destination,sourceRoomId:job.m.roomId,messageId:job.m.id,requestId:job.key});if(ack.queued)durable.set(job.key,{roomId:destination,text:quote(job.m)});job.sent=true;}
          d.close();selected.clear();await refreshRooms();await loadFeed();
        }finally{send.disabled=false;}},'wf-collab-primary');body.append(field(t('rooms'),roomChoice),send);
    }
    async function openAsset(m){
      const {d,body}=dialog(m.asset.name),id=m.roomId;
      d.dataset.messageId=m.id;
      const h=await req('asset',{roomId:id,messageId:m.id}),blob=await C.downloadBlob(h,ui.signal);
      if(!roomNow(id)||!d.open)return;const url=URL.createObjectURL(blob);let media;
      d.addEventListener('close',()=>{if(media){media.removeAttribute('src');if(typeof media.load==='function')media.load();}URL.revokeObjectURL(url);},{once:true});
      if(m.expiresAt){const ms=Date.parse(m.expiresAt)-Date.now();if(ms<=0){d.close();return;}if(ms<2147483647){const timer=setTimeout(()=>d.close(),ms);d.addEventListener('close',()=>clearTimeout(timer),{once:true});}}
      const tag=({image:'img',video:'video',audio:'audio',pdf:'iframe'})[m.asset.kind];
      if(tag){media=el(tag,null,'wf-chat-media');media.referrerPolicy='no-referrer';
        if(tag==='img')media.alt=m.asset.name;else if(tag==='iframe'){media.setAttribute('sandbox','');media.title=m.asset.name;}else {media.controls=true;media.preload='metadata';}
        media.src=url;body.append(media);
        if(tag==='img'||tag==='video')body.append(act(t('fullscreen'),async()=>{if(media.requestFullscreen)await media.requestFullscreen();else d.classList.toggle('expanded');}));
        if(tag==='audio'||tag==='video'){const speed=options(['0.75','1','1.25','1.5','2'].map(x=>[x,x+'×']),'1');speed.onchange=()=>{media.playbackRate=Number(speed.value);};body.append(field(t('speed'),speed));}
      }
      body.append(act(t('download'),()=>C.save(blob,m.asset.name)));
      const file=new File([blob],m.asset.name,{type:h.mime});if(root.navigator.canShare?.({files:[file]}))body.append(act(t('share'),()=>root.navigator.share({files:[file]})));
    }
    async function uploadFile(purpose,file,roomId,requestId=root.crypto.randomUUID()){
      if(!file?.size||file.size>C.maxBytes)throw Error('MEDIA_TOO_LARGE');
      const data=await C.base64(file);if(!alive)throw Error('ACCESS_DENIED');
      const value=await req('upload',{purpose,roomId,requestId,name:C.baseName(file.name),mime:file.type,data});return value.asset;
    }
    function avatarInput(label,current){
      const control=el('input');control.type='file';control.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';
      const box=el('div',null,'wf-chat-avatar-control'),reset=el('input');reset.type='checkbox';box.append(field(label,control));
      if(current)box.append(field(t('removePhoto'),reset));
      return {box,id:async(purpose,id)=>control.files?.[0]?(await uploadFile(purpose,control.files[0],id)).id:reset.checked?null:current};
    }
    function profileDialog(){
      const {d,body}=dialog(t('profile')),n=input(me.name,100),s=input(me.status,160),photo=avatarInput(t('photo'),me.avatar);
      if(me.avatar){const img=el('img',null,'wf-chat-profile-image');img.alt=me.name;body.append(img);setPreviewImage(img,{purpose:'profile',targetId:me.id},me.avatar);}
      const save=act(t('save'),async()=>{save.disabled=true;try{const r=await req('profile',{name:n.value,status:s.value,assetId:await photo.id('profile')});me=r.me;d.close();await refreshRooms();await loadFeed();}finally{save.disabled=false;}},'wf-collab-primary');
      body.append(field(t('name'),n),field(t('status'),s),photo.box,save);
    }
    function personSearch(body,choose,skip=new Set(),tick=false,staffOnly=false){
      const search=input('',100),results=el('div',null,'wf-chat-people'),pagingBar=el('div',null,'wf-chat-chips');let number=0,timer,offset=0;
      search.type='search';search.placeholder=t('searchPeople');search.setAttribute('aria-label',t('searchPeople'));body.append(search,results,pagingBar);
      async function find(){
        const k=++number,r=await req('people',{query:search.value,offset,staffOnly});if(!body.isConnected||number!==k)return;
        results.replaceChildren();for(const p of r.people.filter(x=>!skip.has(x.id))){const row=el('div',null,'wf-chat-person');const label=el('span');label.append(el('b',p.name),el('small','@'+p.username+(p.status?' · '+p.status:'')));
          if(tick){const ck=el('input');ck.type='checkbox';ck.checked=tick.has(p.id);ck.setAttribute('aria-label',p.name);ck.onchange=()=>ck.checked?tick.add(p.id):tick.delete(p.id);row.append(ck,label);}
          else row.append(label,act(t('select'),()=>choose(p)));results.append(row);}
        pagingBar.replaceChildren();if(offset) pagingBar.append(act(t('previous'),()=>{offset-=100;return find();}));
        if(r.people.length===100)pagingBar.append(act(t('next'),()=>{offset+=100;return find();}));
      }
      search.oninput=()=>{clearTimeout(timer);offset=0;timer=setTimeout(run(find),200);};run(find)();
    }
    function peopleDialog(mode){
      const {d,body}=dialog(t(mode==='direct'?'direct':'add')),rid=room?.id;
      const skip=mode==='direct'?new Set([me.id]):new Set(members.filter(m=>m.state==='active'||m.state==='banned').map(m=>m.id));
      personSearch(body,async p=>{
        if(mode==='direct'){const r=await req('direct',{targetId:p.id});d.close();await refreshRooms();await openRoom(r.roomId);}
        else {await req('member',{roomId:rid,targetId:p.id,operation:'add'});d.close();await loadFeed();await membersDialog();}
      },skip,false,mode!=='direct');
    }
    function groupDialog(){
      const {d,body}=dialog(t('group')),n=input('',100),description=input('',500),emoji=input('',16),picked=new Set();
      body.append(field(t('groupName'),n),field(t('description'),description),field(t('icon'),emoji));personSearch(body,null,new Set([me.id]),picked,true);
      const go=act(t('newGroup'),async()=>{if(!n.value.trim()){n.focus();return;}go.disabled=true;
        try{const r=await req('group',{name:n.value,description:description.value,emoji:emoji.value,members:[...picked]});d.close();await refreshRooms();await openRoom(r.roomId);}finally{go.disabled=false;}},'wf-collab-primary');
      body.append(go);
    }
    async function membersDialog(){
      if(!room)return;const id=room.id,{d,body}=dialog(t('members')),r=await req('members',{roomId:id});if(!roomNow(id)||!d.open)return;
      members=r.members||[];const manager=edit()&&room.kind!=='direct'&&['moderator','owner'].includes(room.role);
      if(manager)body.append(act(t('add'),()=>{d.close();peopleDialog('add');}));
      for(const p of members){const row=el('div',null,'wf-chat-person'),label=el('span');label.append(el('b',p.name),el('small','@'+p.username+' · '+t(p.state==='banned'?'banned':p.role)+(p.status?' · '+p.status:'')));
        if(p.avatar){const img=el('img',null,'wf-chat-person-avatar');img.alt='';row.append(img);queueMicrotask(()=>setPreviewImage(img,{purpose:'profile',targetId:p.id},p.avatar));}
        row.append(label);body.append(row);
        if(manager&&p.id!==me.id&&p.role!=='owner'&&(room.role==='owner'||p.role!=='moderator')){
          const actions=p.state==='banned'?['unban']:['remove','ban',...(room.role==='owner'?[p.role==='moderator'?'demote':'promote']:[])];
          const op=options([['','⋯'],...actions.map(v=>[v,t(v)])],'');op.setAttribute('aria-label',t('manage')+' '+p.name);
          op.onchange=()=>{const value=op.value;op.value='';if(value)checkConfirm(t(value)+' · '+p.name,async()=>{await req('member',{roomId:id,targetId:p.id,operation:value});d.close();await membersDialog();await loadFeed();});};row.append(op);
        }}
    }
    function manageDialog(){
      const r=room,{d,body}=dialog(t('manage')),n=input(roomName(r),100),desc=input(r.description||'',500),emoji=input(r.emoji||'',16),photo=avatarInput(t('photo'),r.avatar);
      const save=act(t('save'),async()=>{if(!n.value.trim()){n.focus();return;}save.disabled=true;
        try{await req('room.update',{roomId:r.id,name:n.value,description:desc.value,emoji:emoji.value,assetId:await photo.id('room',r.id)});d.close();await refreshRooms();drawRoomHead();await loadFeed();}finally{save.disabled=false;}},'wf-collab-primary');
      body.append(field(t('groupName'),n),field(t('description'),desc),field(t('icon'),emoji),photo.box,save);
      if(r.kind==='group'&&r.role==='owner'&&del())body.append(act(t('deleteGroup'),()=>checkConfirm(t('deleteGroup'),async()=>{await req('room.delete',{roomId:r.id});closeDialogs();leaveRoom(false);await refreshRooms();}),'wf-collab-danger'));
    }
    function settingsDialog(){
      if(!room||!feed)return;const id=room.id,{d,body}=dialog(t('settings')),prefs=feed.prefs;
      const mute=el('input'),archive=el('input');mute.type=archive.type='checkbox';mute.checked=prefs.muted;archive.checked=prefs.archived;
      const wp=options(['plain','warm','cool','custom'].map(k=>[k,t(k)]),prefs.wallpaper),picture=el('input');picture.type='file';picture.accept='image/png,image/jpeg,image/gif,image/webp,image/avif';
      wp.onchange=()=>picture.hidden=wp.value!=='custom';picture.hidden=wp.value!=='custom';
      const expire=options([['off',t('off')],['24h',t('day')],['7d',t('week')],['30d',t('month')]],prefs.disappearing);
      body.append(field(t('muted'),mute),field(t('archived'),archive),field(t('disappearing'),expire),field(t('wallpaper'),wp),picture);
      const save=act(t('save'),async()=>{save.disabled=true;try{
        const data={roomId:id,muted:mute.checked,archived:archive.checked,disappearing:expire.value,wallpaper:wp.value};
        if(wp.value==='custom'){data.assetId=picture.files?.[0]?(await uploadFile('wallpaper',picture.files[0],id)).id:prefs.wallpaperAsset;if(!data.assetId){picture.focus();return;}}
        await req('prefs',data);d.close();await refreshRooms();await loadFeed();}finally{save.disabled=false;}},'wf-collab-primary');body.append(save);
      if(edit()&&room.kind!=='direct'&&['owner','moderator'].includes(room.role))body.append(act(t('manage'),()=>{d.close();manageDialog();}));
      body.append(act(t('clear'),()=>checkConfirm(t('clearAsk'),async()=>{await req('clear',{roomId:id});drafts.delete(id);draft.value='';reply=null;editing=null;attached=null;d.close();await loadFeed();await refreshRooms();drawComposer();}),'wf-collab-danger'));
    }
    const draftWrites=new Map();
    function saveDraft(id,text){
      if(!edit()||!alive)return Promise.resolve();drafts.set(id,text);
      const pending=(draftWrites.get(id)||Promise.resolve()).catch(()=>{}).then(()=>alive?req('draft',{roomId:id,text}):undefined);
      draftWrites.set(id,pending);pending.catch(()=>{}).finally(()=>{if(draftWrites.get(id)===pending)draftWrites.delete(id);});return pending;
    }
    function pendingStatus(){if(durable.size)status.textContent=t('queued')+' ('+durable.size+')';}
    function attach(file){
      if(!file)return;if(!file.size||file.size>C.maxBytes){ui.notice(Error('MEDIA_TOO_LARGE'));return;}
      attached={file,requestId:root.crypto.randomUUID(),serverId:null};editing=null;drawComposer();
    }
    function drawComposer(){
      composer.hidden=!room||!edit();if(composer.hidden)return;draft.placeholder=t('write');draft.setAttribute('aria-label',t('write'));draft.disabled=sending;
      draftInfo.replaceChildren();if(editing||reply||attached){
        if(editing||reply)draftInfo.append(el('span',t(editing?'edit':'reply')+' · '+quote(editing||reply).slice(0,130)));
        if(attached){draftInfo.append(el('span',attached.file.name+' · '+C.humanBytes(attached.file.size,language)));
          const kind=attached.file.type.split('/')[0],tag={audio:'audio',video:'video',image:'img'}[kind];
          if(tag)draftInfo.append(act(t('preview'),()=>{const {d,body}=dialog(attached.file.name),media=el(tag,null,'wf-chat-media'),url=URL.createObjectURL(attached.file);
            if(tag==='img')media.alt=attached.file.name;else media.controls=true;media.src=url;body.append(media);
            d.addEventListener('close',()=>{media.removeAttribute('src');if(typeof media.load==='function')media.load();URL.revokeObjectURL(url);},{once:true});}));}
        draftInfo.append(act(t('cancel'),clearComposeAction));
      }
      sendTools.replaceChildren();const emoji=options([['',t('emoji')],...H.reactions.map(e=>[e,e])],'');emoji.setAttribute('aria-label',t('emoji'));
      emoji.onchange=()=>{if(emoji.value){draft.setRangeText(emoji.value,draft.selectionStart,draft.selectionEnd,'end');emoji.value='';draft.dispatchEvent(new Event('input'));draft.focus();}};
      sendTools.append(emoji,act(t('attach'),()=>picker.click()));
      if(recording){const time=el('span',t('recording'),'wf-chat-record-time');sendTools.append(time,act(t('stop'),()=>{stopRecord(true);drawComposer();}),act(t('cancel'),()=>{stopRecord();drawComposer();}));}
      else if(root.navigator.mediaDevices?.getUserMedia&&root.MediaRecorder)sendTools.append(act(t('voice'),startRecord));
      const sendBtn=act(t(editing?'save':'send'),send,'wf-collab-primary');sendBtn.disabled=sending||!!recording;sendTools.append(sendBtn);
      if(durable.size&&api.syncNow)sendTools.append(act(t('retry'),async()=>{await api.syncNow();await loadFeed();}));
    }
    async function startRecord(){
      if(recording||!room)return;const id=room.id,capture=++recordRequest;let stream;
      try{stream=await root.navigator.mediaDevices.getUserMedia({audio:true});
        if(!roomNow(id)||capture!==recordRequest){for(const tr of stream.getTracks())tr.stop();return;}
        const mime=H.recorderType(root.MediaRecorder),device=new root.MediaRecorder(stream,mime?{mimeType:mime}:undefined);
        const rec={device,stream,started:Date.now(),accept:false,parts:[],bytes:0};recording=rec;
        device.ondataavailable=e=>{if(!e.data?.size)return;rec.bytes+=e.data.size;if(rec.bytes>C.maxBytes){rec.parts=[];stopRecord();drawComposer();ui.notice(Error('MEDIA_TOO_LARGE'));}else rec.parts.push(e.data);};
        device.onstop=()=>{for(const track of stream.getTracks())track.stop();if(!rec.accept||!roomNow(id)||!rec.parts.length)return;
          const type=device.mimeType||mime||'audio/webm',extension=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
          attach(new File(rec.parts,['voice',Date.now()].join('-')+'.'+extension,{type}));};
        device.onerror=()=>{stopRecord();drawComposer();status.textContent=t('voiceFailed');};
        device.start(1000);drawComposer();
        rec.clock=setInterval(()=>{const d=sendTools.querySelector('.wf-chat-record-time');if(d)d.textContent=t('recording')+' '+Math.floor((Date.now()-rec.started)/1000)+' s';},500);
        rec.timeout=setTimeout(()=>{if(recording===rec){stopRecord(true);drawComposer();}},180000);
      }catch{if(stream)for(const track of stream.getTracks())track.stop();if(alive)status.textContent=t('voiceFailed');}
    }
    async function send(){
      if(sending||!room||!edit()||recording)return;const id=room.id,text=draft.value.trim(),editMessage=editing,attachment=attached;
      if(!text&&!attachment&&!editMessage?.asset)return;clearTimeout(draftTimer);sending=true;drawComposer();
      try{
        await draftWrites.get(id)?.catch(()=>{});
        if(editMessage){await req('edit',{roomId:id,messageId:editMessage.id,text});}
        else {
          const signature=JSON.stringify([text,reply?.id,attachment?.requestId]),prior=retrySends.get(id);
          const requestId=attachment?.requestId||(prior?.signature===signature?prior.requestId:root.crypto.randomUUID());
          retrySends.set(id,{signature,requestId});
          const payload={roomId:id,text,requestId,replyId:reply?.id||null};
          if(attachment)Object.assign(payload,{name:C.baseName(attachment.file.name),mime:attachment.file.type,data:await C.base64(attachment.file)});
          const receipt=await req(attachment?'sendFile':'send',payload);retrySends.delete(id);
          if(receipt.queued)durable.set(payload.requestId,{roomId:id,text:text||attachment?.file.name});
        }
        if(roomNow(id)){draft.value=editMessage?(drafts.get(id)||''):'';if(!editMessage)drafts.delete(id);reply=null;editing=null;attached=null;written=false;mentions.replaceChildren();}
        await refreshRooms();if(roomNow(id)){before=null;stack=[];await loadFeed();feedBox.scrollTop=feedBox.scrollHeight;}
      }finally{sending=false;if(alive){drawComposer();pendingStatus();}}
    }
    draft.oninput=()=>{
      if(!room||sending)return;written=true;const id=room.id;
      if(!editing){drafts.set(id,draft.value);clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraft(id,draft.value),550);}
      if(Date.now()-lastTyping>3200){lastTyping=Date.now();req('typing',{roomId:id,typing:!!draft.value}).catch(()=>{});}
      mentions.replaceChildren();const prefix=draft.value.slice(0,draft.selectionStart),tag=/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u.exec(prefix);if(!tag)return;
      for(const m of members.filter(p=>p.id!==me.id&&p.state==='active'&&(p.username.toLowerCase().startsWith(tag[1].toLowerCase())||p.name.toLowerCase().includes(tag[1].toLowerCase()))).slice(0,6)){
        mentions.append(act('@'+m.username+' · '+m.name,()=>{const end=draft.selectionStart;draft.setRangeText('@'+m.username+' ',end-tag[1].length-1,end,'end');draft.dispatchEvent(new Event('input'));draft.focus();}));}
    };
    draft.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();run(send)();}};
    picker.onchange=()=>{attach(picker.files?.[0]);picker.value='';};
    async function poll(){
      if(polling||!alive||root.document.hidden||!me)return;polling=true;
      try{await refreshRooms();await loadFeed();pendingStatus();}
      catch(e){actionStatus(e);}finally{polling=false;}
    }
    async function init(){
      try{const r=await req('init');if(!alive)return;me=r.me;}
      catch(e){if(!['NETWORK','OFFLINE_NOT_CACHED'].includes(e?.code))throw e;me=api.getSession?.()?.currentAccount;if(!me)throw e;}
      await refreshRooms();if(!alive)return;
      if(params.roomId&&H.validRoom(params.roomId)){
        await openRoom(params.roomId);
        const target=params.messageId;
        if(roomNow(params.roomId)&&typeof target==='string'&&/^[1-9]\d{0,18}$/.test(target)&&BigInt(target)<=9223372036854775807n){
          const find=()=>Array.from(feedBox.querySelectorAll('[data-msg]')).find(row=>row.dataset.msg===target);
          let row=find();
          if(!row&&BigInt(target)<9223372036854775807n){
            stack.push(before);before=String(BigInt(target)+1n);lastFeed='';await loadFeed();
            if(roomNow(params.roomId))row=find();
          }
          row?.scrollIntoView({block:'center'});
        }
        return;
      }
      if(root.matchMedia?.('(min-width: 780px)').matches&&rooms.length)await openRoom(rooms.find(x=>!x.archived)?.id||rooms[0].id);
    }
    const resume=()=>{if(!root.document.hidden)poll();};
    api.listOutbox?.().then(rows=>{if(!alive)return;for(const item of rows)if(item.requestId&&['chat.send','chat.sendFile','chat.forward'].includes(item.action)&&item.status==='pending')durable.set(item.requestId,{roomId:item.roomId});pendingStatus();}).catch(()=>{});
    const offReceipts=api.subscribeReceipts?.(receipt=>{
      if(!alive||!receipt?.requestId||!['chat.send','chat.sendFile','chat.forward'].includes(receipt.action))return;
      durable.delete(receipt.requestId);if(receipt.status==='posted'){poll();}else ui.notice({code:receipt.errorCode||'CONFLICT'});
    });
    sideHeader();leaveRoom(false);init().catch(actionStatus);
    let lastConnection=String(root.navigator.onLine);
    const unsubscribe=api.subscribeConnection?.(state=>{const marker=String(state?.online??state?.connection??state?.status??root.navigator.onLine);
      if(marker!==lastConnection){lastConnection=marker;if(alive&&me)poll();}});
    const clock=setInterval(poll,4400);root.addEventListener('online',resume);root.document.addEventListener('visibilitychange',resume);
    return {dispose(){alive=false;unsubscribe?.();offReceipts?.();generation++;clearInterval(clock);clearTimer();stopRecord();root.removeEventListener('online',resume);root.document.removeEventListener('visibilitychange',resume);
      retrySends.clear();durable.clear();drafts.clear();thumbs.clear();members=[];rooms=[];feed=null;me=null;selected.clear();ui.dispose();app.remove();},
      updateLanguage(value){language=value;lastFeed='';roomsView='';sideHeader();drawRooms();if(room){drawRoomHead();drawMessages();drawPaging();drawComposer();}else leaveRoom(false);},
      hasUnsavedChanges:()=>!!(recording||attached||sending||written)};
  }
  const definition={id:'chat',title,permission:'chat.view',icon:'message-circle',mount,openRoom:id=>H.validRoom(id)&&root.WFModules?.open('chat',{roomId:id})};
  root.WFChat=definition;root.WFModules?.register(definition);
})(globalThis);
