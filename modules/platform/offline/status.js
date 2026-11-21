/* The status panel is created only when someone opens it. */
(function(root) {
  'use strict';
  const langs=['en','ar','tr','fr','ru'];
  const words={
    saved:['Saved copies','النسخ المحفوظة','Kayıtlı kopyalar','Copies enregistrées','Сохранённые копии'],
    verified:['Owner verified','آخر تحقق من المالك','Sahip doğrulandı','Propriétaire vérifié','Владелец проверен'],
    expires:['Saved access expires','تنتهي صلاحية الوصول المحفوظ','Kayıtlı erişim bitişi','Fin de l’accès enregistré','Срок офлайн-доступа'],
    authenticate:['Verify online','التحقق عبر الإنترنت','Çevrimiçi doğrula','Vérifier en ligne','Проверить онлайн'],
    sync:['Sync','المزامنة','Eşitleme','Synchronisation','Синхронизация'],
    now:['Sync now','مزامنة الآن','Şimdi eşitle','Synchroniser','Синхронизировать'],
    online:['Online','متصل','Çevrimiçi','En ligne','В сети'],
    offline:['Offline','غير متصل','Çevrimdışı','Hors ligne','Нет сети'],
    syncing:['Syncing','جارٍ التزامن','Eşitleniyor','Synchronisation en cours','Синхронизация…'],
    pending:['Waiting for server confirmation','بانتظار تأكيد السيرفر','Sunucu onayı bekleniyor','En attente de confirmation du serveur','Ожидает подтверждения сервера'],
    review:['Needs review','يتطلب مراجعة','İnceleme gerekli','À vérifier','Требует проверки'],
    conflict:['Conflict','تعارض','Çakışma','Conflit','Конфликт'],
    failed:['Rejected','مرفوض','Reddedildi','Refusé','Отклонено'],
    quarantined:['Access changed','تغيّرت الصلاحيات','Erişim değişti','Droits modifiés','Доступ изменён'],
    persistence:['Protect pending work on this device','حماية العمل المعلّق على هذا الجهاز','Bu cihazdaki bekleyen işleri koru','Protéger le travail en attente sur cet appareil','Защитить ожидающие данные на устройстве'],
    protected:['Device storage protection is enabled.','حماية تخزين الجهاز مفعّلة.','Cihaz depolama koruması açık.','La protection du stockage est activée.','Защита хранилища включена.'],
    eviction:['The browser may clear device data under storage pressure. Clearing site data also removes pending work.','قد يمحو المتصفح بيانات الجهاز عند نقص المساحة. يؤدي محو بيانات الموقع أيضاً إلى حذف العمل المعلّق.','Alan daralırsa tarayıcı cihaz verilerini silebilir. Site verilerini temizlemek bekleyen işleri de siler.','Le navigateur peut effacer les données si l’espace manque. Effacer les données du site supprime aussi le travail en attente.','При нехватке места браузер может удалить данные. Очистка данных сайта удаляет и ожидающие записи.'],
    refused:['Storage protection was not granted by this browser.','لم يمنح المتصفح حماية التخزين.','Tarayıcı depolama korumasına izin vermedi.','Le navigateur n’a pas accordé la protection du stockage.','Браузер не предоставил защиту хранилища.'],
    full:['Device storage is full. New changes need space before they can be queued.','تخزين الجهاز ممتلئ. تحتاج التغييرات الجديدة إلى مساحة قبل حفظها في قائمة الانتظار.','Cihaz depolaması dolu. Yeni işlemleri sıraya almak için yer açın.','Le stockage est plein. Libérez de l’espace pour enregistrer de nouvelles opérations.','Хранилище заполнено. Освободите место для новых ожидающих операций.'],
    unavailable:['Device storage is unavailable.','تخزين الجهاز غير متاح.','Cihaz depolaması kullanılamıyor.','Le stockage local est indisponible.','Хранилище устройства недоступно.'],
    access:['Reconnect to verify access.','أعد الاتصال للتحقق من الصلاحيات.','Erişimi doğrulamak için yeniden bağlanın.','Reconnectez-vous pour vérifier vos droits.','Подключитесь для проверки доступа.'],
    drafts:['Review saved work','مراجعة العمل المحفوظ','Kayıtlı işleri incele','Vérifier le travail enregistré','Проверить сохранённые записи'],
    inspect:['View draft','عرض المسودة','Taslağı görüntüle','Voir le brouillon','Открыть черновик'],
    save:['Download draft','تنزيل المسودة','Taslağı indir','Télécharger le brouillon','Скачать черновик'],
    file:['Download attachment','تنزيل المرفق','Eki indir','Télécharger la pièce jointe','Скачать вложение'],
    remove:['Discard draft','حذف المسودة','Taslağı sil','Supprimer le brouillon','Удалить черновик'],
    confirm:['Permanently remove this draft from this device?','هل تريد حذف هذه المسودة نهائياً من الجهاز؟','Bu taslak cihazdan kalıcı olarak silinsin mi?','Supprimer définitivement ce brouillon de cet appareil ?','Удалить этот черновик с устройства навсегда?'],
    close:['Close','إغلاق','Kapat','Fermer','Закрыть']
  };
  function mount(host,api,locale) {
    if (!host) return;
    const doc=host.ownerDocument;
    const t=k=>words[k]?.[Math.max(0,langs.indexOf(locale()))]||k;
    const el=(name,value,cls)=>{const node=doc.createElement(name);if(value)node.textContent=value;if(cls)node.className=cls;return node;};
    const button=(label,fn)=>{const node=el('button',label,'btn');node.type='button';node.addEventListener('click',fn);return node;};
    const trigger=button('',open);trigger.classList.add('wf-module-sync-trigger');trigger.setAttribute('aria-haspopup','dialog');host.append(trigger);
    const urls=new Set();let panel,indicator,list,notice,details,protect,retry,storageText,alive=true,sequence=0;
    function download(blob,name) {
      const url=root.URL.createObjectURL(blob);urls.add(url);
      const a=el('a');a.href=url;a.download=String(name).replace(/[\\/\u0000-\u001f]/g,'_').slice(0,180);doc.body.append(a);a.click();a.remove();
      setTimeout(()=>{root.URL.revokeObjectURL(url);urls.delete(url);},1500);
    }
    function error(e) {
      if (!panel) return;
      notice.textContent=t(e?.code==='NETWORK'||e?.code==='OFFLINE_NOT_CACHED'?'offline':e?.status===403||e?.status===401||e?.code==='DRAFT_REVALIDATION_REQUIRED'?'access':e?.code==='DEVICE_STORAGE_FULL'?'full':'unavailable');
    }
    function draw() {
      if (!alive) return;
      let state;try{state=api.getConnection();}catch(_){return;}
      const count=state.pending+state.conflicts+state.failed+state.quarantined;
      const online=state.offlineVerified?'saved':state.syncing?'syncing':state.online?'online':'offline';
      trigger.textContent=t(state.offlineVerified?'saved':state.online?'sync':'offline')+(count?' · '+count:'');
      trigger.title=state.offlineVerified?t('verified')+' · '+new Date(state.verifiedAt).toLocaleString(locale()):t('sync');
      trigger.setAttribute('aria-label',t('sync')+' · '+t(online)+(count?' · '+count:''));
      if (!panel) return;
      const review=state.conflicts+state.failed+state.quarantined;
      retry.textContent=t(state.offlineVerified?'authenticate':'now');
      indicator.textContent=[t(online),state.offlineVerified?t('verified')+' · '+new Date(state.verifiedAt).toLocaleString(locale()):'',state.pending?t('pending')+' · '+state.pending:'',review?t('review')+' · '+review:''].filter(Boolean).join(' · ');
      retry.disabled=state.syncing||(state.offlineVerified?root.navigator?.onLine===false:!state.online);
      protect.hidden=state.persistent===true;
      storageText.textContent=t(state.storage==='full'?'full':state.storage==='unavailable'?'unavailable':state.persistent?'protected':'eviction');
      if(state.offlineVerified&&api.getSession()?.offlineExpiresAt)notice.textContent=t('expires')+' · '+new Date(api.getSession().offlineExpiresAt).toLocaleString(locale());
      if (['ACCESS_DENIED','AUTH_REQUIRED','SESSION_REVOKED'].includes(state.lastError)) notice.textContent=t('access');
    }
    async function inspect(row) {
      const selected=panel;
      try{
        const item=await api.getDraft(row.queueId);if(panel!==selected||!alive)return;
        const text=JSON.stringify(item.payload,null,2);details.replaceChildren(el('pre',text));
        details.append(button(t('save'),()=>download(new Blob([text],{type:'application/json'}),'mark-robot-'+row.queueId+'.json')));
        if(item.blob)details.append(button(t('file'),()=>download(item.blob,item.fileName||'attachment')));
        if(row.status!=='pending')details.append(button(t('remove'),async()=>{
          if(!root.confirm(t('confirm')))return;
          try{await api.discardDraft(row.queueId);if(panel===selected){details.replaceChildren();await rows();draw();}}catch(e){error(e);}
        }));
      }catch(e){error(e);}
    }
    async function rows() {
      const ticket=++sequence;
      try{
        const saved=await api.listOutbox();if(!alive||!panel||ticket!==sequence)return;
        list.replaceChildren();
        for (const row of saved) {
          const li=el('li'), tag=t(row.status), date=new Date(row.createdAt).toLocaleString(locale());
          li.append(el('span',row.action+' · '+tag+' · '+date),button(t('inspect'),()=>inspect(row)));
          list.append(li);
        }
      }catch(e){error(e);}
    }
    function close() {
      sequence++;if (panel) panel.remove();panel=null;
      for(const url of urls)root.URL.revokeObjectURL(url);urls.clear();
    }
    function open() {
      if(panel)return;
      panel=el('dialog',null,'wf-module-sync-dialog');panel.setAttribute('aria-label',t('sync'));
      const head=el('div',null,'wf-module-sync-heading');head.append(el('h2',t('sync')),button(t('close'),()=>panel.close()));
      indicator=el('p');indicator.setAttribute('role','status');notice=el('p');notice.setAttribute('role','status');
      storageText=el('p');list=el('ul');list.setAttribute('aria-label',t('drafts'));details=el('div');
      retry=button(t('now'),async()=>{retry.disabled=true;try{if(api.getConnection().offlineVerified){root.WFCloudSettings?.open?.();return;}await api.syncNow();await rows();}catch(e){error(e);}finally{draw();}});
      protect=button(t('persistence'),async()=>{
        protect.disabled=true;
        try{const granted=await api.requestPersistence();if(panel&&!granted)notice.textContent=t('refused');}
        catch(e){error(e);}finally{if(panel)protect.disabled=false;draw();}
      });
      panel.append(head,indicator,retry,list,details,storageText,protect,notice);
      doc.body.append(panel);panel.addEventListener('close',close,{once:true});panel.showModal();draw();rows();
    }
    const off=api.subscribeConnection(()=>{draw();if(panel)rows();});
    draw();
    return {dispose(){alive=false;off();close();trigger.remove();},updateLanguage(){close();draw();}};
  }
  root.WFModuleStatus=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);
