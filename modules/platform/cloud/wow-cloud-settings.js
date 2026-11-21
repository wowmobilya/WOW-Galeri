/* WOW cloud connection lives inside the existing settings workspace. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory;else factory(root);})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const doc=root.document,page=doc?.getElementById('page-settings'),workspace=page?.querySelector('.wf-settings-workspace');
  const client=root.WFCloudClient?.getClient?.();if(!workspace||!client||root.WFCloudSettings)return root.WFCloudSettings||null;
  const locales=['ar','en','tr','fr','ru'];
  const words={
    title:['السحابة والوصول عن بُعد','Cloud and remote access','Bulut ve uzaktan erişim','Cloud et accès distant','Облако и удалённый доступ'],
    intro:['حسابات WOW ومزامنة العمل مع الحفاظ على مساحة جهازك.','WOW accounts and work sync, with your device workspace preserved.','Cihaz çalışma alanınızı koruyarak WOW hesapları ve iş eşitlemesi.','Comptes WOW et synchronisation, avec conservation de votre espace local.','Учётные записи WOW и синхронизация с сохранением локального пространства.'],
    localScope:['مساحة جهاز المالك','Owner device workspace','Sahibin cihaz çalışma alanı','Espace local du propriétaire','Локальное пространство владельца'],
    remoteScope:['مساحة الحساب السحابية','Cloud account workspace','Bulut hesabı çalışma alanı','Espace du compte cloud','Пространство облачной учётной записи'],
    scopeHint:['حسابات هذا الجهاز وحسابات السحابة منفصلة. أنشئ حسابات الموظفين عن بُعد من إدارة حسابات السحابة.','Device accounts and cloud accounts are separate. Create remote employees in Cloud accounts.','Cihaz hesapları ile bulut hesapları ayrıdır. Uzak çalışanları Bulut hesapları bölümünde oluşturun.','Les comptes locaux et cloud sont distincts. Créez les employés distants dans Comptes cloud.','Локальные и облачные учётные записи разделены. Создавайте удалённых сотрудников в разделе облачных учётных записей.'],
    ownerPair:['ربط حساب المالك','Connect owner account','Sahip hesabını bağla','Connecter le compte propriétaire','Подключить учётную запись владельца'],
    signIn:['تسجيل الدخول والربط','Sign in and connect','Giriş yap ve bağlan','Se connecter et associer','Войти и подключить'],
    enroll:['إعداد مالك WOW','Set up WOW owner','WOW sahibini oluştur','Configurer le propriétaire WOW','Настроить владельца WOW'],
    enrollHint:['استخدم رمز الإعداد الخاص بك لمرة واحدة، واختر اسم الدخول وكلمة المرور. لا تُنقل كلمات مرور الحسابات المحلية.','Use your private one-time setup code and choose a username and password. Local account passwords are not transferred.','Özel, tek kullanımlık kurulum kodunuzla kullanıcı adı ve parola seçin. Yerel hesap parolaları aktarılmaz.','Utilisez votre code privé à usage unique et choisissez un identifiant et un mot de passe. Les mots de passe locaux ne sont pas transférés.','Введите личный одноразовый код настройки и выберите имя пользователя и пароль. Локальные пароли не переносятся.'],
    setupToken:['رمز إعداد المالك','Owner setup code','Sahip kurulum kodu','Code de configuration propriétaire','Код настройки владельца'],
    name:['اسم المالك','Owner name','Sahibin adı','Nom du propriétaire','Имя владельца'],
    username:['اسم الدخول','Username','Kullanıcı adı','Identifiant','Имя пользователя'],
    password:['كلمة المرور','Password','Parola','Mot de passe','Пароль'],
    confirmPassword:['تأكيد كلمة المرور','Confirm password','Parolayı doğrula','Confirmer le mot de passe','Подтвердите пароль'],
    passwordHint:['12 حرفًا على الأقل. احتفظ ببيانات دخولك.','At least 12 characters. Keep your sign-in details.','En az 12 karakter. Giriş bilgilerinizi saklayın.','Au moins 12 caractères. Conservez vos identifiants.','Не менее 12 символов. Сохраните данные для входа.'],
    show:['إظهار','Show','Göster','Afficher','Показать'],hide:['إخفاء','Hide','Gizle','Masquer','Скрыть'],
    cancel:['إلغاء','Cancel','İptal','Annuler','Отмена'],signOut:['تسجيل الخروج من السحابة','Sign out of cloud','Buluttan çıkış yap','Se déconnecter du cloud','Выйти из облака'],
    refresh:['تحديث الحالة','Refresh status','Durumu yenile','Actualiser l’état','Обновить состояние'],
    sync:['مزامنة الآن','Sync now','Şimdi eşitle','Synchroniser','Синхронизировать'],
    manage:['إدارة حسابات السحابة','Manage cloud accounts','Bulut hesaplarını yönet','Gérer les comptes cloud','Управление облачными учётными записями'],
    local:['العودة إلى مساحة الجهاز','Return to device workspace','Cihaz çalışma alanına dön','Revenir à l’espace local','Вернуться в локальное пространство'],
    employeeLink:['رابط دخول الموظفين','Employee sign-in link','Çalışan giriş bağlantısı','Lien de connexion employés','Ссылка для входа сотрудников'],
    copyLink:['نسخ الرابط','Copy link','Bağlantıyı kopyala','Copier le lien','Скопировать ссылку'],
    copied:['نُسخ رابط الموظفين.','Employee link copied.','Çalışan bağlantısı kopyalandı.','Lien employés copié.','Ссылка для сотрудников скопирована.'],
    dashboard:['لوحة تحكم Supabase','Supabase dashboard','Supabase kontrol paneli','Tableau de bord Supabase','Панель управления Supabase'],
    connection:['الاتصال','Connection','Bağlantı','Connexion','Подключение'],workspace:['مساحة العمل','Workspace','Çalışma alanı','Espace de travail','Рабочее пространство'],
    account:['الحساب السحابي','Cloud account','Bulut hesabı','Compte cloud','Облачная учётная запись'],
    idle:['جاهز للربط','Ready to connect','Bağlanmaya hazır','Prêt à connecter','Готово к подключению'],
    online:['متصل ومتحقق منه','Connected and verified','Bağlı ve doğrulandı','Connecté et vérifié','Подключение проверено'],
    syncing:['جارٍ مزامنة التغييرات…','Syncing changes…','Değişiklikler eşitleniyor…','Synchronisation en cours…','Синхронизация изменений…'],
    syncError:['المزامنة تحتاج إلى مراجعة','Sync needs attention','Eşitleme kontrol gerektiriyor','Synchronisation à vérifier','Синхронизация требует проверки'],
    syncConflict:['توجد اختلافات للمراجعة','Conflicts need review','Çakışmalar incelenmeli','Conflits à examiner','Требуется проверка конфликтов'],
    syncPaused:['المزامنة متوقفة مؤقتًا','Sync paused','Eşitleme duraklatıldı','Synchronisation en pause','Синхронизация приостановлена'],
    syncAuth:['أعد الدخول لإكمال المزامنة','Sign in to resume sync','Eşitlemek için tekrar giriş yapın','Reconnectez-vous pour synchroniser','Войдите для продолжения синхронизации'],
    syncScope:['الحساب لا يطابق مساحة الجهاز','Account does not match this workspace','Hesap bu çalışma alanıyla eşleşmiyor','Le compte ne correspond pas à cet espace','Учётная запись не соответствует пространству'],
    syncFailed:['تعذّر إكمال المزامنة. تبقى التغييرات المحلية محفوظة بانتظار إعادة المحاولة.','Sync could not complete. Local changes remain saved for retry.','Eşitleme tamamlanamadı. Yerel değişiklikler yeniden denemek için kayıtlı tutulur.','La synchronisation a échoué. Les modifications locales restent enregistrées pour réessayer.','Не удалось завершить синхронизацию. Локальные изменения сохранены для повторной попытки.'],
    offline:['لا يوجد اتصال بالخادم','Server unreachable','Sunucuya erişilemiyor','Serveur inaccessible','Сервер недоступен'],
    checking:['جارٍ التحقق…','Verifying…','Doğrulanıyor…','Vérification…','Проверка…'],
    signedOut:['غير مسجل في السحابة','Signed out of cloud','Bulut oturumu kapalı','Déconnecté du cloud','Вход в облако не выполнен'],
    unconfigured:['الربط السحابي غير مهيأ','Cloud not configured','Bulut yapılandırılmadı','Cloud non configuré','Облако не настроено'],
    pending:['تغييرات بانتظار المزامنة','Pending changes','Bekleyen değişiklikler','Modifications en attente','Ожидающие изменения'],
    conflicts:['اختلافات محفوظة للمراجعة','Saved conflicts to review','İncelenecek kayıtlı çakışmalar','Conflits conservés à examiner','Сохранённые конфликты'],
    lastSync:['آخر مزامنة مكتملة','Last completed sync','Son tamamlanan eşitleme','Dernière synchronisation terminée','Последняя завершённая синхронизация'],
    never:['لم تكتمل مزامنة بعد','No completed sync yet','Henüz eşitleme tamamlanmadı','Aucune synchronisation terminée','Синхронизация ещё не завершена'],
    connected:['تم التحقق من الحساب وربط مساحة WOW.','Account verified and WOW workspace connected.','Hesap doğrulandı ve WOW çalışma alanı bağlandı.','Compte vérifié et espace WOW connecté.','Учётная запись проверена, пространство WOW подключено.'],
    savedOffline:['بيانات الجهاز محفوظة؛ ستُرسل التغييرات المعلقة بعد عودة الاتصال والتحقق من الحساب.','Device data is saved. Pending changes send after connectivity and account verification return.','Cihaz verileri kayıtlıdır. Bekleyen değişiklikler bağlantı ve hesap doğrulaması geri geldiğinde gönderilir.','Les données locales sont enregistrées. Les modifications seront envoyées après reconnexion et vérification.','Локальные данные сохранены. Изменения отправятся после восстановления связи и проверки учётной записи.'],
    syncUnavailable:['محرك المزامنة غير جاهز. أعد تحميل البرنامج.','Sync is not ready. Reload the app.','Eşitleme hazır değil. Uygulamayı yenileyin.','La synchronisation n’est pas prête. Rechargez l’application.','Синхронизация не готова. Обновите приложение.'],
    networkError:['تعذّر الاتصال بخادم WOW. تحقق من الإنترنت وأعد المحاولة.','Could not reach WOW. Check the connection and retry.','WOW sunucusuna ulaşılamadı. Bağlantıyı kontrol edip tekrar deneyin.','WOW est inaccessible. Vérifiez la connexion et réessayez.','Сервер WOW недоступен. Проверьте подключение и повторите попытку.'],
    batchLimit:['الحد الأقصى 100 سجل مختلف في عملية حفظ واحدة. لم يُحفظ أي جزء من هذه العملية. قسّمها إلى دفعات أصغر وأعد المحاولة.','Use at most 100 different records in one save. Nothing from this save was stored. Split it into smaller batches and retry.','Tek kaydetmede en fazla 100 farklı kayıt kullanın. Bu işlemden hiçbir kayıt kaydedilmedi. Daha küçük gruplara ayırıp yeniden deneyin.','Une sauvegarde peut contenir au plus 100 enregistrements distincts. Rien de cette opération n’a été enregistré. Divisez-la en groupes plus petits et réessayez.','Одно сохранение допускает не более 100 разных записей. Ничего из этой операции не сохранено. Разделите данные на меньшие группы и повторите.'],
    mediaLimit:['الحد الأقصى للصورة 8 MiB. صغّر الصورة ثم احفظ التعديل وأعد المزامنة. النسخة المحلية الأصلية محفوظة.','Images may be at most 8 MiB. Reduce the image, save the change, and sync again. The original local copy is retained.','Görseller en fazla 8 MiB olabilir. Görseli küçültün, değişikliği kaydedin ve tekrar eşitleyin. Özgün yerel kopya saklanır.','Les images sont limitées à 8 MiB. Réduisez l’image, enregistrez puis relancez la synchronisation. L’original local est conservé.','Размер изображения не должен превышать 8 MiB. Уменьшите его, сохраните изменение и повторите синхронизацию. Локальный оригинал сохранён.'],
    unsupportedMedia:['هذا السجل يحتوي ملفًا مضمنًا أو قيمة لا تدعمها المزامنة. صدّر النسخة المحلية للمراجعة، ثم أعد إرفاق الصورة من محررها واحفظها.','This record contains an embedded file or value that sync cannot send. Export the local copy to review, then attach the image again in its editor and save.','Bu kayıtta eşitlemenin gönderemediği gömülü dosya veya değer var. Yerel kopyayı incelemek için dışa aktarın, ardından görseli düzenleyicisinden yeniden ekleyip kaydedin.','Cet enregistrement contient un fichier intégré ou une valeur incompatible. Exportez la copie locale pour examen, puis joignez de nouveau l’image dans son éditeur et enregistrez.','Запись содержит вложенный файл или неподдерживаемое значение. Экспортируйте локальную копию для проверки, затем заново добавьте изображение в редакторе и сохраните.'],
    loginError:['راجع اسم الدخول وكلمة المرور وحالة الحساب.','Check your username, password and account status.','Kullanıcı adı, parola ve hesap durumunu kontrol edin.','Vérifiez l’identifiant, le mot de passe et l’état du compte.','Проверьте имя пользователя, пароль и состояние учётной записи.'],
    setupError:['راجع رمز الإعداد. يجب أن يكون صالحًا وغير مستخدم.','Check the setup code. It must be valid and unused.','Kurulum kodunu kontrol edin. Geçerli ve kullanılmamış olmalıdır.','Vérifiez le code : il doit être valide et non utilisé.','Проверьте код настройки: он должен быть действующим и неиспользованным.'],
    workerError:['هذا حساب موظف. استخدم رابط دخول الموظفين لفتح مساحته السحابية.','This is an employee account. Use the employee link to open its cloud workspace.','Bu bir çalışan hesabıdır. Bulut alanını çalışan giriş bağlantısından açın.','Il s’agit d’un compte employé. Utilisez le lien employés pour ouvrir son espace.','Это учётная запись сотрудника. Откройте её пространство по ссылке для сотрудников.'],
    mismatch:['كلمتا المرور غير متطابقتين.','Passwords do not match.','Parolalar eşleşmiyor.','Les mots de passe diffèrent.','Пароли не совпадают.'],
    failed:['تعذّر إكمال الإجراء. تبقى بيانات الجهاز محفوظة.','The action could not complete. Device data remains saved.','İşlem tamamlanamadı. Cihaz verileri kayıtlı kalır.','L’action n’a pas abouti. Les données locales restent enregistrées.','Не удалось завершить действие. Локальные данные сохранены.'],
    conflictReview:['مراجعة اختلافات المزامنة','Review sync conflicts','Eşitleme çakışmalarını incele','Examiner les conflits','Просмотр конфликтов синхронизации'],
    exportConflict:['تصدير النسخة المحلية للمراجعة','Export local changes to review','Yerel değişiklikleri incelemek için dışa aktar','Exporter les modifications locales','Экспортировать локальные изменения'],
    keepLocal:['اعتماد التغييرات المحلية','Use local changes','Yerel değişiklikleri kullan','Utiliser les modifications locales','Использовать локальные изменения'],
    keepServer:['اعتماد نسخة السحابة','Use cloud version','Bulut sürümünü kullan','Utiliser la version cloud','Использовать облачную версию'],
    localConfirm:['سيُعاد إرسال التغييرات المحلية بعد التحقق من أحدث نسخة وصلاحياتك. يشمل القرار العمليات المترابطة، وتُحفظ نسخة من التغييرات الأصلية.','Local changes will be resubmitted after checking the latest version and your permissions. This includes dependent operations; original changes are retained.','Son sürüm ve izinleriniz doğrulandıktan sonra yerel değişiklikler yeniden gönderilir. Bağlı işlemler de kapsanır; özgün değişiklikler saklanır.','Les changements locaux seront renvoyés après vérification de la version et des droits. Les opérations liées sont incluses ; les originaux sont conservés.','Локальные изменения будут отправлены повторно после проверки версии и прав. Решение включает связанные операции; оригиналы сохраняются.'],
    serverConfirm:['ستُعتمد نسخة السحابة بدل التغييرات المحلية المتعارضة والعمليات المرتبطة بها. تُحفظ النسخة المحلية الأصلية للمراجعة.','The cloud version will replace the conflicting local changes and their dependent operations. Original local changes are retained for review.','Bulut sürümü, çakışan yerel değişikliklerin ve bağlı işlemlerin yerini alır. Özgün yerel değişiklikler inceleme için saklanır.','La version cloud remplacera les changements locaux en conflit et les opérations liées. Les originaux locaux restent conservés.','Облачная версия заменит конфликтующие локальные изменения и связанные операции. Локальные оригиналы сохранятся для просмотра.'],
    confirm:['تأكيد هذا الاختيار','Confirm this choice','Bu seçimi onayla','Confirmer ce choix','Подтвердить выбор'],
    restoreHint:['عند ربط السحابة تبقى إمكانية التصدير متاحة. استبدال بيانات الجهاز كاملة بنسخة قديمة متوقف لحماية المزامنة.','Export remains available when cloud is linked. Replacing all device data with an old backup is paused to protect sync.','Bulut bağlıyken dışa aktarma kullanılabilir. Eşitlemeyi korumak için tüm cihaz verilerini eski yedekle değiştirme duraklatılır.','L’export reste disponible. Le remplacement complet des données par une ancienne sauvegarde est suspendu pour protéger la synchronisation.','Экспорт остаётся доступен. Полная замена данных старой резервной копией приостановлена для защиты синхронизации.'],
    scopeMismatch:['هذا الجهاز مرتبط بمساحة محفوظة أخرى. سجّل بحساب مالكها لإكمال مزامنة تغييراتها.','This device has a saved binding to another workspace. Sign in as its owner to sync its pending changes.','Bu cihaz başka bir çalışma alanına bağlıdır. Bekleyen değişiklikleri eşitlemek için o alanın sahibi olarak giriş yapın.','Cet appareil est lié à un autre espace. Connectez-vous avec son propriétaire pour synchroniser les modifications en attente.','Устройство связано с другим пространством. Войдите как его владелец для синхронизации ожидающих изменений.'],
    proofNote:['رمز الإعداد خاص بالمالك؛ لا ترسله للموظفين.','The setup code is private to the owner; do not share it with employees.','Kurulum kodu sahibine özeldir; çalışanlarla paylaşmayın.','Le code est réservé au propriétaire ; ne le partagez pas avec les employés.','Код настройки предназначен владельцу; не передавайте его сотрудникам.']
  };
  const lang=()=>locales.includes(doc.documentElement.lang)?doc.documentElement.lang:'ar',text=key=>(words[key]||words.failed)[locales.indexOf(lang())];
  const make=(tag,cls,caption)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(caption!=null)el.textContent=caption;return el;};
  const label=(tag,key,cls)=>{const el=make(tag,cls,text(key));el.dataset.wfCloudText=key;return el;};
  function symbol(){const el=make('span','wf-cloud-icon');el.setAttribute('aria-hidden','true');el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18H6a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.5-1A4.5 4.5 0 0 1 18 18h-1M12 13v9m-3-3 3 3 3-3"/></svg>';return el;}
  function button(key,action,primary=false){const el=make('button','btn '+(primary?'btn-p':'btn-s'));el.type='button';el.append(label('span',key));el.addEventListener('click',action);return el;}
  function linkButton(key,url){const el=make('a','btn btn-s');el.append(label('span',key));el.href=url;return el;}
  const panel=make('section','wf-cloud-settings');panel.id='stab-cloud';panel.style.display='none';panel.setAttribute('aria-labelledby','wf-settings-tab-cloud');
  const tab=make('button','tab-btn');tab.id='wf-settings-tab-cloud';tab.type='button';tab.setAttribute('onclick',"switchTab('cloud')");tab.setAttribute('aria-controls',panel.id);tab.dataset.wfPermission='settings.view';tab.append(symbol(),label('span','title'));
  workspace.querySelector('.tabs').append(tab);workspace.querySelector('.wf-settings-content').append(panel);
  let busy=false,formMode='signIn',form,saveButton,cancelButton,fields={},notice,error=false,actions,metrics,details,noticeText='',syncState=null;
  let conflictHost,conflictGeneration=0,engineRef=null,engineUnsubscribe=null,resolution=null;
  const isOpen=()=>page.classList.contains('active')&&panel.style.display!=='none';
  const dirty=()=>!!form&&!form.hidden&&Object.values(fields).some(field=>!!field.value);
  const notify=()=>{root.dispatchEvent?.(new root.CustomEvent('wf-settings-actions-change'));};
  function clearSecrets(){for(const key of ['password','confirmPassword','setupToken'])if(fields[key])fields[key].value='';}
  function showNotice(key,failed=false){noticeText=key;error=failed;updateStatus();notify();}
  function errorText(value){const code=typeof value==='string'?value:value?.code;
    if(code==='NETWORK')return 'networkError';if(code==='SYNC_BATCH_TOO_LARGE')return 'batchLimit';if(code==='MEDIA_TOO_LARGE')return 'mediaLimit';
    if(['UNSUPPORTED_MEDIA','UNSUPPORTED_SYNC_VALUE'].includes(code))return 'unsupportedMedia';if(code==='SYNC_UNAVAILABLE')return 'syncUnavailable';
    if(code==='WORKSPACE_RELINK_REQUIRED')return 'scopeMismatch';if(code==='CONFLICT'||code==='REMOTE_CHANGE')return 'syncConflict';
    if(/SETUP|PROOF|ENROLL/.test(code||''))return 'setupError';if(code==='REMOTE_MODE_REQUIRED')return 'workerError';if(/LOGIN|AUTH|REVOKED|SUSPENDED|UNAVAILABLE/.test(code||''))return 'loginError';return 'failed';}
  async function perform(action,success){if(busy)return;busy=true;error=false;noticeText='';updateStatus();notify();try{await action();if(success)noticeText=success;}catch(value){noticeText=errorText(value);error=true;}finally{busy=false;clearSecrets();updateStatus();notify();}}
  function addField(key,{password=false,required=true}={}){
    const wrap=make('label','wf-cloud-field');wrap.append(label('span',key));const input=make('input','fi');input.id='wfCloud-'+key;input.name=key;input.type=password?'password':'text';input.required=required;input.maxLength=key==='setupToken'?512:password?128:key==='name'?100:64;input.dir='auto';input.spellcheck=false;
    input.autocomplete=key==='setupToken'?'off':key==='username'?'username':key==='name'?'name':password?(formMode==='enroll'?'new-password':'current-password'):'off';
    if(password&&key!=='setupToken')input.minLength=12;fields[key]=input;
    input.addEventListener('input',()=>{input.setCustomValidity('');noticeText='';error=false;notify();});
    if(password){const row=make('span','wf-cloud-password'),toggle=button('show',()=>{input.type=input.type==='password'?'text':'password';toggle.firstElementChild.textContent=text(input.type==='password'?'show':'hide');toggle.setAttribute('aria-pressed',String(input.type==='text'));});toggle.setAttribute('aria-controls',input.id);toggle.setAttribute('aria-pressed','false');row.append(input,toggle);wrap.append(row);}else wrap.append(input);
    return wrap;
  }
  function drawForm(){
    clearSecrets();fields={};form?.remove();form=make('form','wf-cloud-form');form.id='wfCloudConnectionForm';
    const head=make('div','wf-cloud-form-head');head.append(label('h3',formMode==='enroll'?'enroll':'ownerPair'));
    head.append(button(formMode==='enroll'?'signIn':'enroll',()=>{if(!busy){formMode=formMode==='enroll'?'signIn':'enroll';drawForm();notify();}}));form.append(head);
    if(formMode==='enroll')form.append(label('p','enrollHint','wf-cloud-muted'));
    const grid=make('div','wf-cloud-fields');
    if(formMode==='enroll'){grid.append(addField('setupToken',{password:true}),addField('name'));}
    grid.append(addField('username'),addField('password',{password:true}));
    if(formMode==='enroll')grid.append(addField('confirmPassword',{password:true}));
    form.append(grid,label('p',formMode==='enroll'?'proofNote':'passwordHint','wf-cloud-muted'));
    const footer=make('div','wf-cloud-form-actions');cancelButton=button('cancel',()=>{if(!busy){for(const input of Object.values(fields))input.value='';noticeText='';error=false;updateStatus();notify();}});
    saveButton=button(formMode==='enroll'?'enroll':'signIn',submit,true);saveButton.id='wfCloudSave';footer.append(cancelButton,saveButton);form.append(footer);panel.append(form);
    form.addEventListener('submit',event=>{event.preventDefault();submit();});updateStatus();
  }
  async function submit(){
    if(busy||!form.reportValidity())return;
    if(formMode==='enroll'&&fields.password.value!==fields.confirmPassword.value){fields.confirmPassword.setCustomValidity(text('mismatch'));fields.confirmPassword.reportValidity();return;}
    const input={username:fields.username.value.trim(),password:fields.password.value};
    if(formMode==='enroll'){input.name=fields.name.value.trim();input.setupToken=fields.setupToken.value.trim();}
    await perform(async()=>{await(formMode==='enroll'?client.enrollOwner(input):client.signIn(input));await root.wfInitializeCloudSync?.();},'connected');
    if(client.getSnapshot().authenticated)for(const field of Object.values(fields))field.value='';
    input.password='';if(input.setupToken)input.setupToken='';
  }
  function formatted(value){if(!value)return text('never');const date=new Date(value);if(!Number.isFinite(date.getTime()))return text('never');try{return new Intl.DateTimeFormat(lang(),{dateStyle:'medium',timeStyle:'short'}).format(date);}catch(_){return date.toLocaleString();}}
  function bindEngine(){const engine=root.WFCloudSyncEngine;if(engine===engineRef)return;engineUnsubscribe?.();engineRef=engine;engineUnsubscribe=engine?.subscribe?.(()=>{updateStatus();notify();})||null;}
  async function exportConflict(batchId){
    if(!engineRef?.exportConflict)throw Object.assign(Error('SYNC_UNAVAILABLE'),{code:'SYNC_UNAVAILABLE'});
    const bundle=await engineRef.exportConflict(batchId),blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=doc.createElement('a');anchor.href=url;anchor.download='WOW-Cloud-Conflict-'+String(batchId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)+'.json';doc.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function drawConflicts(){
    if(!conflictHost)return;const epoch=++conflictGeneration,engine=engineRef;
    if(!isOpen()||!engine?.listConflicts||!(syncState?.conflictCount??syncState?.conflicts)){conflictHost.replaceChildren();return;}
    let rows;try{rows=await engine.listConflicts();}catch(_){return;}
    if(epoch!==conflictGeneration)return;conflictHost.replaceChildren();if(!rows.length)return;
    conflictHost.append(label('h3','conflictReview'));
    for(const row of rows){
      const batchId=row.batchId||row.batchIds?.[0],box=make('section','wf-cloud-conflict');
      const records=row.conflicts?.length?row.conflicts:row.store?[{store:row.store,id:row.recordId}]:[];
      box.append(label('strong',errorText(row.reason)==='failed'?'syncConflict':errorText(row.reason)));
      if(row.reason){const reason=make('small','wf-cloud-muted',row.reason);reason.dir='ltr';box.append(reason);}
      for(const record of records){const caption=make('p','wf-cloud-conflict-record',String(record.store||'')+' · '+String(record.id??record.recordId??''));caption.dir='auto';box.append(caption);}
      if(batchId){const id=make('small','wf-cloud-muted',batchId);id.dir='ltr';box.append(id);const rowActions=make('div','wf-cloud-actions');
        rowActions.append(button('exportConflict',()=>perform(()=>exportConflict(batchId))));
        if(client.getSnapshot().role==='owner'&&engine.resolveConflict){
          for(const [key,strategy]of [['keepLocal','local'],['keepServer','server']])rowActions.append(button(key,()=>{resolution={batchId,strategy};drawConflicts();}));
        }
        box.append(rowActions);
        if(resolution?.batchId===batchId){const confirm=make('div','wf-cloud-conflict-confirm');confirm.append(label('p',resolution.strategy==='local'?'localConfirm':'serverConfirm'));
          confirm.append(button('cancel',()=>{resolution=null;drawConflicts();}),button('confirm',()=>{const selected={...resolution};return perform(async()=>{await engine.resolveConflict(selected.batchId,{strategy:selected.strategy});resolution=null;if(selected.strategy==='local')await engine.syncNow();});},true));box.append(confirm);}
      }
      for(const control of box.querySelectorAll('button'))control.disabled=busy;conflictHost.append(box);
    }
  }
  function updateStatus(){
    if(!metrics)return;bindEngine();const state=client.getSnapshot();syncState=engineRef?.getSnapshot?.()||syncState;
    const engineConnection=syncState?.connection||syncState?.status,engineError=syncState?.lastError||syncState?.error;
    const syncKeys={syncing:'syncing',error:'syncError',conflict:'syncConflict',paused:'syncPaused','auth-required':'syncAuth','scope-mismatch':'syncScope',offline:'offline'};
    const connectionKey=syncKeys[engineConnection]||(state.connection==='signed-out'?'signedOut':['online','offline','checking','unconfigured'].includes(state.connection)?state.connection:'idle');
    const syncNeedsAttention=['error','conflict','auth-required','scope-mismatch','offline'].includes(engineConnection);
    metrics.connection.value.textContent=text(busy?'checking':connectionKey);metrics.connection.value.dataset.state=syncKeys[engineConnection]?engineConnection:state.connection;
    metrics.workspace.value.textContent=state.workspaceId||'—';metrics.account.value.textContent=state.currentAccount?.name||'—';
    metrics.pending.value.textContent=String(syncState?.pendingCount??syncState?.pending??0);metrics.conflicts.value.textContent=String(syncState?.conflictCount??syncState?.conflicts??0);
    metrics.lastSync.value.textContent=formatted(syncState?.lastSyncAt||syncState?.lastSuccessfulSyncAt);
    notice.hidden=!noticeText||noticeText==='connected'&&syncNeedsAttention;notice.dataset.error=String(error);notice.textContent=notice.hidden?'':text(noticeText);
    if(form)form.hidden=state.authenticated;
    for(const input of Object.values(fields))input.disabled=busy;
    if(saveButton)saveButton.disabled=busy||!client.isConfigured();if(cancelButton)cancelButton.disabled=busy;
    actions.replaceChildren();
    if(state.authenticated){
      actions.append(button('sync',()=>perform(async()=>{await root.wfInitializeCloudSync?.();if(!root.WFCloudSyncEngine?.syncNow)throw Object.assign(Error('SYNC_UNAVAILABLE'),{code:'SYNC_UNAVAILABLE'});await root.WFCloudSyncEngine.syncNow();})),button('refresh',()=>perform(()=>client.refresh())),button('signOut',()=>perform(()=>client.signOut())));
      if(state.role==='owner'){const url=new URL(client.entryUrl());url.searchParams.set('wf-accounts','cloud');url.hash='settings';actions.prepend(linkButton('manage',url.href));}
    }
    if(client.isRemote()){const url=new URL(root.location.href);url.searchParams.delete('wf-cloud');url.searchParams.delete('workspace');url.searchParams.delete('wf-accounts');url.hash='settings';actions.append(linkButton('local',url.href));}
    const dashboard=client.getConfig().dashboardUrl;if(/^https:\/\/supabase\.com\/dashboard\/project\//.test(dashboard)){const anchor=linkButton('dashboard',dashboard);anchor.target='_blank';anchor.rel='noopener noreferrer';actions.append(anchor);}
    for(const control of actions.querySelectorAll('button'))control.disabled=busy;
    details.replaceChildren();
    if(engineError&&syncNeedsAttention){
      const code=typeof engineError==='string'?engineError:engineError.code||'SYNC_FAILED',key=errorText(code),box=make('div','wf-cloud-notice wf-cloud-sync-error');box.dataset.error='true';box.setAttribute('role','status');
      box.append(label('p',key==='failed'?'syncFailed':key));const detail=make('small','wf-cloud-muted',String(code));detail.dir='ltr';box.append(detail);details.append(box);
    }
    if(state.workspaceId&&(state.authenticated||client.isLinkedOwner())){
      const heading=label('h3','employeeLink'),row=make('div','wf-cloud-share');const input=make('input','fi');input.readOnly=true;input.type='text';input.dir='ltr';input.value=client.entryUrl();input.setAttribute('aria-label',text('employeeLink'));
      row.append(input,button('copyLink',async()=>{try{await root.navigator.clipboard.writeText(input.value);showNotice('copied');}catch(_){input.focus();input.select();}}));details.append(heading,row);
    }
    if((state.connection==='offline'||engineConnection==='offline')&&!client.isRemote())details.append(label('p','savedOffline','wf-cloud-muted'));
    if(engineConnection==='scope-mismatch'&&!engineError)details.append(label('p','scopeMismatch','wf-cloud-muted'));
    if(syncState?.linked&&!client.isRemote())details.append(label('p','restoreHint','wf-cloud-muted'));
    drawConflicts();
  }
  function build(){
    const header=make('header','wf-cloud-header');header.append(symbol());const textBox=make('div');textBox.append(label('h2','title'),label('p','intro'));header.append(textBox);panel.append(header);
    const scope=make('div','wf-cloud-scope');scope.append(label('strong',client.isRemote()?'remoteScope':'localScope'),label('p','scopeHint'));panel.append(scope);
    const grid=make('div','wf-cloud-metrics');metrics={};for(const key of ['connection','workspace','account','pending','conflicts','lastSync']){const card=make('div','wf-cloud-metric'),value=make('strong');card.append(label('span',key),value);grid.append(card);metrics[key]={value};}panel.append(grid);
    notice=make('p','wf-cloud-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');panel.append(notice);
    actions=make('div','wf-cloud-actions');details=make('div','wf-cloud-details');conflictHost=make('section','wf-cloud-conflicts');panel.append(actions,details,conflictHost);drawForm();
  }
  build();
  const originalSwitch=root.switchTab;if(typeof originalSwitch==='function')root.switchTab=function(key){const result=originalSwitch.apply(this,arguments);panel.style.display=key==='cloud'?'block':'none';tab.classList.toggle('active',key==='cloud');if(key==='cloud')updateStatus();else clearSecrets();notify();return result;};
  const api={getSettingsActions(){return isOpen()&&form&&!form.hidden?{key:'cloud:'+formMode,scope:panel,save:saveButton,cancel:cancelButton,dirty:dirty(),busy,error,canSave:!busy&&dirty()&&client.isConfigured()}:null;},hasUnsavedChanges:()=>busy||isOpen()&&dirty(),open(){root.showPage?.('settings');tab.click();},refresh:updateStatus,describeError:value=>text(errorText(value))};
  root.WFCloudSettings=api;client.subscribe(()=>{updateStatus();notify();});
  root.addEventListener?.('wf-cloud-sync-change',()=>{updateStatus();notify();});
  new root.MutationObserver(()=>{for(const node of panel.querySelectorAll('[data-wf-cloud-text]'))node.textContent=text(node.dataset.wfCloudText);tab.querySelector('[data-wf-cloud-text]').textContent=text('title');updateStatus();}).observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
  doc.addEventListener('DOMContentLoaded',()=>{root.WFAppUpdates?.registerGuard?.('cloud-settings',()=>busy||isOpen()&&dirty());doc.getElementById('wfSettingsDialog')?.addEventListener('close',()=>{clearSecrets();notify();});updateStatus();},{once:true});
  return api;
});
