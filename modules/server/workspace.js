(function(root){
 'use strict';
 const modules=root.WFModules,core=root.WFServerCore;if(!modules||!core)return;
 const codes={
  PUSH_BACKLOG:['تأخر مهام الإشعارات','Notifications are delayed','Bildirimler gecikti','Notifications en retard','Задержка уведомлений'],
  PUSH_FAILURES:['بعض الإشعارات استنفدت المحاولات','Some notifications reached the retry limit','Bazı bildirimler deneme sınırına ulaştı','Limite de tentatives atteinte','Исчерпаны попытки доставки'],
  PUSH_NOT_CONFIGURED:['الإشعارات تحتاج إكمال الربط','Notifications need configuration','Bildirim kurulumu gerekli','Configurer les notifications','Настройте уведомления'],
  PUSH_SCHEDULE:['جدولة الإشعارات تحتاج مراجعة','Notification schedule needs attention','Bildirim zamanlamasını kontrol edin','Vérifier la planification','Проверьте расписание уведомлений'],
  RLS_DISABLED:['حماية صفوف البيانات تحتاج مراجعة','Row security needs attention','Satır güvenliğini kontrol edin','Vérifier la sécurité des lignes','Проверьте защиту строк']
 };
 const words={
  intro:['حالة مارك ربوت وتشغيله التلقائي، مع وقت آخر فحص وسجل الإجراءات.','Mark Robot availability and automated maintenance, with observed checks and actions.','Mark Robot durumu ve otomatik bakım, kontrol ve işlem geçmişiyle.','Disponibilité et entretien automatique, avec contrôles et actions observés.','Доступность и автоматическое обслуживание с журналом проверок.'],
  healthy:['الفحص سليم','Checks passed','Kontroller başarılı','Contrôles réussis','Проверки пройдены'],
  attention:['يحتاج متابعة','Needs attention','Kontrol gerekli','À vérifier','Требует внимания'],
  critical:['مشكلة مهمة','Critical issue','Kritik sorun','Problème critique','Критическая проблема'],
  failed:['تعذّر الفحص','Check failed','Kontrol başarısız','Contrôle échoué','Проверка не выполнена'],
  stale:['لم يصل فحص حديث','No recent check','Güncel kontrol yok','Aucun contrôle récent','Нет свежей проверки'],
  unknown:['لم يتم التحقق بعد','Not checked yet','Henüz kontrol edilmedi','Pas encore vérifié','Ещё не проверено'],
  disabled:['الصيانة التلقائية متوقفة','Automatic maintenance is disabled','Otomatik bakım kapalı','Entretien automatique désactivé','Автообслуживание отключено'],
  last:['آخر فحص','Last check','Son kontrol','Dernier contrôle','Последняя проверка'],
  check:['فحص وإصلاح المهام الآن','Check and recover tasks','Görevleri kontrol et ve kurtar','Vérifier et récupérer les tâches','Проверить и восстановить задачи'],
  refresh:['تحديث الحالة','Refresh status','Durumu yenile','Actualiser','Обновить статус'],
  pause:['إيقاف الصيانة التلقائية','Pause automatic maintenance','Otomatik bakımı duraklat','Suspendre l’entretien','Приостановить обслуживание'],
  resume:['تشغيل الصيانة التلقائية','Enable automatic maintenance','Otomatik bakımı aç','Activer l’entretien','Включить обслуживание'],
  pending:['مهام تنتظر الإرسال','Waiting tasks','Bekleyen görevler','Tâches en attente','Ожидающие задачи'],
  sent:['إشعارات أُرسلت خلال 24 ساعة','Notifications sent in 24 hours','24 saatte gönderilen bildirimler','Notifications envoyées en 24 h','Отправлено за 24 часа'],
  failures:['مهام تحتاج مراجعة','Tasks requiring review','Kontrol gerektiren görevler','Tâches à vérifier','Задачи для проверки'],
  recovered:['مهام استُعيدت في السجل المعروض','Tasks recovered in this history','Bu geçmişte kurtarılan görevler','Tâches récupérées dans cet historique','Восстановлено в этом журнале'],
  integrations:['جاهزية الخدمات','Integration readiness','Hizmet hazırlığı','Services connectés','Готовность сервисов'],
  storage:['تنظيف الملفات التلقائي','Automatic file cleanup','Otomatik dosya temizliği','Nettoyage automatique des fichiers','Автоматическая очистка файлов'],
  storagePending:['ملفات في طابور تنظيف السيرفر','Queued for server cleanup','Sunucu temizliği kuyruğundaki dosyalar','Fichiers en attente du nettoyage serveur','Файлы в очереди очистки сервера'],
  storageRemoved:['ملفات أزالها تنظيف السيرفر خلال 24 ساعة','Removed by server cleanup in 24 hours','Sunucu temizliğinin 24 saatte kaldırdığı dosyalar','Fichiers retirés par le nettoyage serveur en 24 h','Удалено очисткой сервера за 24 часа'],
  storagePolicy:['تبقى الملفات المستخدمة محفوظة. لا تتحرر المساحة المحجوزة إلا بعد تأكيد إزالة الملف المحذوف.','Referenced files are retained. Reserved space is released only after deletion is confirmed.','Kullanılan dosyalar korunur. Ayrılan alan yalnızca silme doğrulandıktan sonra boşalır.','Les fichiers utilisés sont conservés. L’espace réservé est libéré après confirmation de suppression.','Используемые файлы сохраняются. Место освобождается после подтверждения удаления.'],
  verified:['تم التحقق','Verified','Doğrulandı','Vérifié','Проверено'],
  unverified:['ينتظر التحقق الفعلي','Awaiting live verification','Canlı doğrulama bekleniyor','Vérification réelle en attente','Ожидает проверки'],
  planVerified:['الاشتراك المدفوع','Paid subscription','Ücretli abonelik','Abonnement payant','Платная подписка'],
  databaseBackupVerified:['نسخة قاعدة البيانات','Database backup','Veritabanı yedeği','Sauvegarde de la base','Копия базы данных'],
  objectBackupVerified:['نسخة الملفات والصور','File and image backup','Dosya ve görsel yedeği','Sauvegarde des fichiers','Копия файлов и изображений'],
  emailVerified:['بريد النطاق','Domain email','Alan adı e-postası','Courriel du domaine','Почта домена'],
  externalMonitorVerified:['مراقبة خارج السيرفر','Independent monitoring','Bağımsız izleme','Surveillance indépendante','Внешний мониторинг'],
  aiConfigured:['إعداد مزود الذكاء الاصطناعي','AI provider configuration','Yapay zekâ sağlayıcı ayarı','Configuration du fournisseur IA','Настройка провайдера ИИ'],
  configured:['الإعداد موجود؛ تُختبر الإجابات من المساعد','Configured; test responses in the assistant','Yapılandırıldı; asistan yanıtlarını test edin','Configuré ; testez les réponses dans l’assistant','Настроен; проверьте ответы помощника'],
  incidents:['التنبيهات التشغيلية','Operational alerts','İşletim uyarıları','Alertes opérationnelles','Операционные уведомления'],
  none:['لا توجد تنبيهات مسجلة.','No recorded alerts.','Kayıtlı uyarı yok.','Aucune alerte enregistrée.','Нет записанных уведомлений.'],
  acknowledge:['اطّلعت عليه','Acknowledge','Gördüm','Accuser réception','Ознакомлен'],
  resolved:['تمت المعالجة','Resolved','Çözüldü','Résolu','Решено'],
  history:['سجل الفحوص والإصلاحات','Checks and recovery history','Kontrol ve kurtarma geçmişi','Historique des contrôles','Журнал проверок и восстановления'],
  historyEmpty:['سيظهر السجل بعد تشغيل أول فحص على السيرفر.','History appears after the first server check.','İlk sunucu kontrolünden sonra geçmiş görünür.','Le journal apparaît après le premier contrôle.','Журнал появится после первой проверки.'],
  schedule:['الفحص الدوري كل خمس دقائق داخل السيرفر.','The scheduled check runs on the server every five minutes.','Sunucu kontrolü beş dakikada bir çalışır.','Le contrôle est exécuté sur le serveur toutes les cinq minutes.','Проверка запускается на сервере каждые пять минут.'],
  boundary:['الإصلاح التلقائي يعالج المهام المتوقفة ضمن حدود واضحة. تعديل السجلات المالية أو نشر كود جديد له مسار اختبار منفصل.','Automatic recovery handles stalled tasks within defined limits. Financial changes and source releases use their tested workflows.','Otomatik kurtarma, duran görevleri belirli sınırlar içinde işler. Mali değişiklikler ve kod sürümleri test edilmiş süreçlerini kullanır.','La récupération traite les tâches bloquées dans un cadre défini. Les changements financiers et de code suivent leur processus testé.','Восстановление обрабатывает зависшие задачи. Финансовые изменения и выпуск кода проходят отдельные проверки.'],
  project:['لوحة مشروع Supabase','Supabase project dashboard','Supabase proje paneli','Tableau de bord Supabase','Панель проекта Supabase'],
  offline:['تعذّر الاتصال. آخر حالة معروضة لا تؤكد الحالة الحالية للسيرفر.','Connection failed. The last displayed result does not establish current availability.','Bağlantı kurulamadı. Gösterilen sonuç güncel durumu doğrulamaz.','Connexion impossible. Le dernier résultat ne confirme pas l’état actuel.','Нет соединения. Последний результат не подтверждает текущую доступность.'],
  running:['جارٍ الفحص…','Checking…','Kontrol ediliyor…','Vérification…','Проверка…'],
  runLine:['استعادة {n} مهمة · {i} تنبيه','Recovered {n} tasks · {i} alerts','{n} görev kurtarıldı · {i} uyarı','{n} tâches récupérées · {i} alertes','Восстановлено {n} задач · уведомлений: {i}']
 };
 modules.register({id:'server-admin',permission:'server.view',icon:'settings',title:{ar:'إدارة مارك ربوت',en:'Mark Robot administration',tr:'Mark Robot yönetimi',fr:'Administration Mark Robot',ru:'Управление Mark Robot'},
  mount({container,api,locale}){
   let data=null,disposed=false,busy=false,timer=null,problem='',customerPanel=null,customerControls=null;
   const doc=container.ownerDocument||root.document;
   const t=key=>{const list=words[key]||codes[key];return list?.[Math.max(0,['ar','en','tr','fr','ru'].indexOf(locale()))]||key;};
   const el=(tag,cls,text)=>{const node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
   const date=value=>{const stamp=Date.parse(value||'');return Number.isFinite(stamp)?new Intl.DateTimeFormat(locale(),{dateStyle:'medium',timeStyle:'short'}).format(stamp):t('unknown');};
   const button=(caption,fn)=>{const n=el('button','btn',t(caption));n.type='button';n.disabled=busy;n.addEventListener('click',fn);return n;};
   async function load(action='operations.snapshot',payload={}){
    if(disposed||busy)return;busy=true;problem='';render();
    try{const next=await api.request(action,payload);if(!disposed)data=next;}
    catch(error){if(!disposed)problem=t('offline')+' '+String(error?.code||'SERVICE_UNAVAILABLE');}
    finally{if(!disposed){busy=false;render();schedule();}}
   }
   function schedule(){clearTimeout(timer);if(!disposed&&doc.visibilityState!=='hidden')timer=setTimeout(()=>load(),60000);}
   function render(){
    if(disposed)return;container.replaceChildren();
    const area=el('div','wf-server'),summary=el('section','wf-server-summary'),status=problem?'stale':core.status(data);
    const head=el('div','wf-server-heading');head.append(el('h2','',t(status)),el('span','wf-server-badge '+status,t(status)));summary.append(head,el('p','',t('intro')));
    const last=el('p','wf-server-muted',t('last')+': '+date(data?.settings?.lastTickAt));summary.append(last);
    const actions=el('div','wf-server-actions');actions.append(button('refresh',()=>load()),button('check',()=>load('operations.check')));
    if(data)actions.append(button(data.settings.enabled?'pause':'resume',()=>load('operations.configure',{enabled:!data.settings.enabled,revision:data.settings.revision})));
    if(busy)actions.append(el('span','',t('running')));summary.append(actions);
    if(problem){const warning=el('p','wf-server-warning',problem);warning.setAttribute('role','alert');summary.append(warning);}
    area.append(summary);
    if(data){
     const metrics=core.metrics(data),cards=el('div','wf-server-metrics');
     for(const [key,value] of [['pending',metrics.waiting],['sent',metrics.sent],['failures',metrics.failed],['recovered',metrics.recovered]]){
      const card=el('section','wf-server-card');card.append(el('strong','',new Intl.NumberFormat(locale()).format(value)),el('span','',t(key)));cards.append(card);
     }area.append(cards);
     const cleanup=el('section','wf-server-panel'),storage=data.storageMaintenance;
     cleanup.append(el('h3','',t('storage')),el('span','wf-server-badge '+core.storageStatus(data),t(core.storageStatus(data))),el('p','wf-server-muted',t('last')+': '+date(storage?.lastScanAt)));
     if(storage){
      const count=value=>Number.isSafeInteger(value)&&value>=0?new Intl.NumberFormat(locale()).format(value):t('unknown');
      for(const [label,value] of [['storagePending',[storage.pending,storage.leased,storage.retrying].every(Number.isSafeInteger)?storage.pending+storage.leased+storage.retrying:null],['storageRemoved',storage.removed24h]]){
       const row=el('div','wf-server-service');row.append(el('span','',t(label)),el('strong','',count(value)));cleanup.append(row);
      }
     }
     cleanup.append(el('p','wf-server-muted',t('storagePolicy')));area.append(cleanup);
     const integrations=el('section','wf-server-panel');integrations.append(el('h3','',t('integrations')));
     for(const key of ['planVerified','databaseBackupVerified','objectBackupVerified','emailVerified','externalMonitorVerified','aiConfigured']){
      const row=el('div','wf-server-service');row.append(el('span','',t(key)),el('span',data.deployment?.[key]?'wf-server-confirmed':'wf-server-muted',t(data.deployment?.[key]?key==='aiConfigured'?'configured':'verified':'unverified')));integrations.append(row);
     }
     const link=el('a','btn',t('project'));link.href='https://supabase.com/dashboard/project/sldthbnigivpsqixccah';link.target='_blank';link.rel='noopener noreferrer';integrations.append(link);area.append(integrations);
     if(root.WFCustomerAuth?.mountOwner){
      if(!customerPanel){customerPanel=el('section','wf-server-panel');customerControls=root.WFCustomerAuth.mountOwner({container:customerPanel,api,lang:locale()});}
      area.append(customerPanel);
     }
     const alerts=el('section','wf-server-panel');alerts.append(el('h3','',t('incidents')));
     if(!data.incidents?.length)alerts.append(el('p','wf-server-muted',t('none')));
     for(const incident of data.incidents||[]){const row=el('article','wf-server-incident '+(incident.active?incident.severity:'resolved'));
      row.append(el('strong','',t(incident.code)),el('span','wf-server-muted',date(incident.last_seen_at)));
      if(!incident.active)row.append(el('span','',t('resolved')));
      else if(!incident.acknowledged_at)row.append(button('acknowledge',()=>load('operations.acknowledge',{incidentId:incident.id})));
      alerts.append(row);
     }area.append(alerts);
     const history=el('section','wf-server-panel');history.append(el('h3','',t('history')));
     if(!data.runs?.length)history.append(el('p','wf-server-muted',t('historyEmpty')));
     for(const run of data.runs||[]){const row=el('article','wf-server-run');row.append(el('time','',date(run.finished_at||run.started_at)),el('span','',t(run.status)),el('span','wf-server-muted',t('runLine').replace('{n}',run.recovered_leases).replace('{i}',run.issues)));history.append(row);}
     area.append(history);
    }
    const foot=el('section','wf-server-note');foot.append(el('p','',t('schedule')),el('p','',t('boundary')));area.append(foot);container.append(area);
   }
   const visibility=()=>{if(doc.visibilityState==='hidden')clearTimeout(timer);else{load();schedule();}};
   doc.addEventListener('visibilitychange',visibility);load();
   return {dispose(){disposed=true;clearTimeout(timer);customerControls?.dispose();doc.removeEventListener('visibilitychange',visibility);container.replaceChildren();},updateLanguage(){customerControls?.updateLanguage(locale());render();},hasUnsavedChanges:()=>false};
  }
 });
})(typeof window==='object'?window:globalThis);
