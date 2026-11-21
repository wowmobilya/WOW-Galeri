/* Local owner access and explicitly selected cloud employee workspaces. */
(function(root){
  'use strict';
  const doc=root.document,policy=root.WFAccountPolicy,dataPolicy=root.WFAccountDataPolicy;
  if(!doc||root.WFAccountAccess)return;
  const remoteMode=!!root.WFCloudClient?.isRemoteMode?.()||/(?:^|[?&])wf-cloud=employee(?:&|$)/.test(root.location?.search||'');
  const locales=['ar','en','tr','fr','ru'];
  const words={
    title:['تسجيل الدخول','Sign in','Giriş yap','Connexion','Вход'],
    intro:['ادخل بحسابك لفتح مساحة العمل المسموحة لك.','Use your account to open your permitted workspace.','İzin verilen çalışma alanını açmak için hesabınızla giriş yapın.','Connectez-vous pour ouvrir votre espace autorisé.','Войдите, чтобы открыть разрешённые разделы.'],
    username:['اسم الدخول','Username','Kullanıcı adı','Identifiant','Имя пользователя'],
    password:['كلمة المرور','Password','Parola','Mot de passe','Пароль'],
    show:['إظهار','Show','Göster','Afficher','Показать'],hide:['إخفاء','Hide','Gizle','Masquer','Скрыть'],
    entering:['جارٍ التحقق…','Checking…','Kontrol ediliyor…','Vérification…','Проверка…'],
    local:['حسابات هذا الجهاز. إدارة الربط السحابي متاحة في الإعدادات.','Accounts on this device. Manage the cloud connection in Settings.','Bu cihazdaki hesaplar. Bulut bağlantısını Ayarlar bölümünde yönetin.','Comptes de cet appareil. Gérez la connexion cloud dans les paramètres.','Учётные записи этого устройства. Облачное подключение настраивается в параметрах.'],
    cloud:['هذه مساحة حساب سحابي. يُتحقق من حسابك وصلاحياتك على خادم WOW.','This is a cloud account workspace. WOW verifies your account and permissions on the server.','Bu bir bulut hesabı çalışma alanıdır. WOW, hesabınızı ve izinlerinizi sunucuda doğrular.','Cet espace utilise un compte cloud. WOW vérifie le compte et ses droits sur le serveur.','Это рабочее пространство облачной учётной записи. WOW проверяет учётную запись и права на сервере.'],
    network:['تعذّر الاتصال بخادم WOW. تحقق من الإنترنت ثم أعد المحاولة.','Could not connect to WOW. Check your connection and retry.','WOW sunucusuna bağlanılamadı. Bağlantınızı kontrol edip yeniden deneyin.','Connexion à WOW impossible. Vérifiez Internet et réessayez.','Не удалось подключиться к WOW. Проверьте Интернет и повторите попытку.'],
    cloudUnavailable:['الربط السحابي غير جاهز على هذه النسخة. أعد تحميل البرنامج أو راجع المالك.','Cloud access is not ready in this version. Reload the app or contact the owner.','Bu sürümde bulut erişimi hazır değil. Uygulamayı yenileyin veya işletme sahibine başvurun.','L’accès cloud n’est pas prêt dans cette version. Rechargez l’application ou contactez le propriétaire.','Облачный доступ в этой версии не готов. Обновите приложение или обратитесь к владельцу.'],
    session:['جلسة الأدمن تبقى مفتوحة أثناء الخمول وتحديث الصفحة في هذه النافذة. حساب العامل يُقفل بعد 30 دقيقة دون استخدام وعند تحديث الصفحة.','The owner stays signed in during inactivity and page reloads in this tab. Employee accounts lock after 30 idle minutes and on reload.','Sahip bu sekmede işlem yapmadığında ve sayfa yenilendiğinde oturumunu korur. Çalışan hesapları 30 dakika kullanılmadığında ve sayfa yenilendiğinde kilitlenir.','Le propriétaire reste connecté dans cet onglet pendant l’inactivité et au rechargement. Les comptes employés se verrouillent après 30 minutes d’inactivité et au rechargement.','Владелец остаётся в системе при бездействии и перезагрузке этой вкладки. Учётные записи сотрудников блокируются после 30 минут бездействия и при перезагрузке.'],
    failed:['اسم الدخول أو كلمة المرور غير صحيحين، أو الحساب غير متاح.','The username or password is incorrect, or the account is unavailable.','Kullanıcı adı veya parola yanlış ya da hesap kullanılamıyor.','Identifiant ou mot de passe incorrect, ou compte indisponible.','Неверное имя или пароль, либо учётная запись недоступна.'],
    storage:['تعذّر قراءة حسابات الجهاز. أعد المحاولة؛ لم تُفتح البيانات.','Device accounts could not be read. Retry; business data remains locked.','Cihaz hesapları okunamadı. Yeniden deneyin; veriler kilitli kalır.','Impossible de lire les comptes. Réessayez ; les données restent verrouillées.','Не удалось прочитать учётные записи. Данные остаются заблокированы.'],
    retry:['إعادة المحاولة','Retry','Yeniden dene','Réessayer','Повторить'],
    denied:['هذا الإجراء غير متاح لصلاحيات حسابك.','Your account does not have permission for this action.','Hesabınız bu işlem için yetkili değil.','Votre compte n’autorise pas cette action.','У вашей учётной записи нет прав на это действие.'],
    lock:['قفل وتبديل الحساب','Lock and switch account','Kilitle ve hesap değiştir','Verrouiller et changer de compte','Заблокировать и сменить пользователя'],
    switch:['تبديل الحساب','Switch account','Hesap değiştir','Changer de compte','Сменить пользователя'],
    lockConfirm:['سيُقفل البرنامج وتُغلق النماذج المفتوحة. احفظ تعديلاتك أولًا. هل تريد المتابعة؟','The app will lock and close open forms. Save your changes first. Continue?','Uygulama kilitlenecek ve açık formlar kapanacak. Önce değişikliklerinizi kaydedin. Devam edilsin mi?','L’application se verrouillera et fermera les formulaires. Enregistrez vos modifications. Continuer ?','Приложение заблокируется, открытые формы закроются. Сначала сохраните изменения. Продолжить?'],
    noAccess:['لم تُحدد أقسام متاحة لهذا الحساب. اطلب من المالك تعديل صلاحياته.','No sections are assigned to this account. Ask the owner to update its permissions.','Bu hesaba bölüm atanmadı. İşletme sahibinden izinleri güncellemesini isteyin.','Aucune rubrique n’est autorisée. Demandez au propriétaire de modifier les droits.','Для этой учётной записи не разрешено ни одного раздела. Обратитесь к владельцу.'],
    language:['اللغة','Language','Dil','Langue','Язык'],
    auditFailed:['حُفظ التغيير، لكن تعذّر تسجيل نشاط الحساب.','The change was saved, but account activity could not be recorded.','Değişiklik kaydedildi ancak hesap etkinliği kaydedilemedi.','La modification est enregistrée, mais pas l’activité du compte.','Изменение сохранено, но записать активность не удалось.']
  };
  const locale=()=>locales.includes(doc.documentElement.lang)?doc.documentElement.lang:'ar';
  const text=key=>words[key][locales.indexOf(locale())];
  const make=(tag,cls,caption)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(caption!==undefined)el.textContent=caption;return el;};
  const lockIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
  const ownerIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6"/></svg>';
  let service,ready,booted=false,checking=true,refreshing=null,reloading=false,loginBusy=false,loginResolve,loginWait;
  let explicitLockPending=false,resumeChecking=false;
  let lockSurface,loginForm,username,password,submit,status,showPassword,loginTitle,loginIntro,localNote,sessionNote,langSelect,sessionButton;
  let customerAuthSurface;
  let lastSnapshot=null,lastUIKey='',controlsQueued=false,channel=null;
  const auditActions=new WeakMap();
  const hiddenDisplays=new WeakMap();
  function snapshot(){return service?.getSnapshot()||lastSnapshot||{configured:true,currentAccount:null,revision:0};}
  function can(key){if(checking||resumeChecking||explicitLockPending)return false;const state=snapshot();return !state.configured||(key==='@route:notifications'?policy.canNotifications?.(state.currentAccount)===true:policy.can(state.currentAccount,key));}
  function canRoute(route){if(checking||resumeChecking||explicitLockPending)return false;const state=snapshot();return !state.configured||policy.canRoute(state.currentAccount,route);}
  function denied(){root.showToast?.(text('denied'),'er');return false;}
  function assert(key){if(!can(key)){const error=new Error('ACCESS_DENIED');error.code='ACCESS_DENIED';throw error;}return snapshot().currentAccount;}
  function allow(key){return can(key)||denied();}
  function setLocked(locked){
    doc.documentElement.dataset.wfAccountState=locked?'locked':'ready';
    if(lockSurface)lockSurface.hidden=!locked;
    for(const node of doc.body.children){
      if(node===lockSurface||['SCRIPT','STYLE','LINK'].includes(node.tagName))continue;
      if(locked&&!node.hasAttribute('inert')){node.inert=true;node.dataset.wfAccountInert='';}
      else if(!locked&&node.hasAttribute('data-wf-account-inert')){node.inert=false;node.removeAttribute('data-wf-account-inert');}
    }
  }
  function translateLock(){
    if(sessionButton){
      const account=snapshot().currentAccount,action=text(account?.role==='owner'?'switch':'lock');
      sessionButton.querySelector('strong').textContent=account?.name||'';sessionButton.querySelector('small').textContent=action;sessionButton.title=action;
      if(sessionButton.dataset.wfSessionRole!==account?.role){sessionButton.dataset.wfSessionRole=account?.role||'';sessionButton.children[0].innerHTML=account?.role==='owner'?ownerIcon:lockIcon;}
    }
    if(!lockSurface)return;
    lockSurface.dir=locale()==='ar'?'rtl':'ltr';lockSurface.lang=locale();
    loginTitle.textContent=text('title');loginIntro.textContent=text('intro');
    username.previousElementSibling.textContent=text('username');
    password.parentElement.previousElementSibling.textContent=text('password');
    submit.textContent=text(loginBusy?'entering':'title');showPassword.textContent=text(password.type==='password'?'show':'hide');
    showPassword.setAttribute('aria-label',text(password.type==='password'?'show':'hide')+' '+text('password'));
    localNote.textContent=text(remoteMode?'cloud':'local');sessionNote.textContent=text('session');
    langSelect.setAttribute('aria-label',text('language'));langSelect.value=locale();
    customerAuthSurface?.updateLanguage?.(locale());
  }
  function buildLock(){
    if(lockSurface)return;
    lockSurface=make('section');lockSurface.id='wfAccountLock';lockSurface.hidden=true;lockSurface.setAttribute('role','dialog');lockSurface.setAttribute('aria-modal','true');lockSurface.setAttribute('aria-labelledby','wfAccountLoginTitle');
    const card=make('div','wf-account-login'),brand=make('div','wf-account-login-brand');
    const emblem=make('span','wf-account-login-emblem');emblem.innerHTML=lockIcon;
    const brandName=make('span','',doc.getElementById('navTitle')?.textContent?.trim()||'WOW FURNITURE');
    const logo=doc.querySelector('#navLogo img');
    if(logo){const copy=logo.cloneNode(false);copy.removeAttribute('id');copy.alt='';brand.append(copy);}else brand.append(emblem);
    brand.append(brandName);
    const languages=make('div','wf-account-login-languages');langSelect=make('select');
    for(const [id,title]of [['ar','العربية'],['en','English'],['tr','Türkçe'],['fr','Français'],['ru','Русский']]){const option=make('option','',title);option.value=id;langSelect.append(option);}
    languages.append(langSelect);langSelect.addEventListener('change',()=>{doc.documentElement.lang=langSelect.value;doc.documentElement.dir=langSelect.value==='ar'?'rtl':'ltr';try{root.localStorage.setItem('wf_lang',langSelect.value);}catch(_){}translateLock();});
    loginTitle=make('h1');loginTitle.id='wfAccountLoginTitle';loginIntro=make('p');loginForm=make('form');loginForm.id='wfAccountLoginForm';
    const userLabel=make('label'),passwordLabel=make('label');
    username=make('input','fi');username.id='wfAccountLoginUsername';username.name='username';username.type='text';username.autocomplete='username';username.required=true;username.maxLength=64;username.dir='auto';username.spellcheck=false;
    password=make('input','fi');password.id='wfAccountLoginPassword';password.name='password';password.type='password';password.autocomplete='current-password';password.required=true;password.maxLength=128;
    const row=make('span','wf-account-password-row');showPassword=make('button');showPassword.type='button';showPassword.setAttribute('aria-controls',password.id);showPassword.setAttribute('aria-pressed','false');
    showPassword.addEventListener('click',()=>{password.type=password.type==='password'?'text':'password';showPassword.setAttribute('aria-pressed',String(password.type==='text'));translateLock();});
    row.append(password,showPassword);userLabel.append(make('span'),username);passwordLabel.append(make('span'),row);
    submit=make('button','btn btn-p wf-account-login-submit');submit.type='submit';
    status=make('p','wf-account-login-status');status.id='wfAccountLoginStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    password.setAttribute('aria-describedby',status.id);sessionNote=make('p');localNote=make('small','wf-account-login-local');
    loginForm.append(userLabel,passwordLabel,submit);card.append(languages,brand,loginTitle,loginIntro,loginForm,status,sessionNote,localNote);lockSurface.append(card);doc.body.append(lockSurface);
    if(remoteMode)customerAuthSurface=root.WFCustomerAuth?.mountVisitor?.({container:card,client:service,loginForm,lang:locale(),
      onComplete:(value,message)=>{username.value=value||'';status.textContent=message;password.focus();}});
    loginForm.addEventListener('submit',async event=>{
      event.preventDefault();if(loginBusy||!loginForm.reportValidity())return;
      loginBusy=true;submit.disabled=true;status.textContent='';translateLock();
      const value=password.value;password.value='';password.type='password';showPassword.setAttribute('aria-pressed','false');
      try{await service.signIn({username:username.value,password:value});const account=snapshot().currentAccount;if(!policy.safeHome(account)){status.textContent=text('noAccess');await service.signOut();}else{setLocked(false);loginResolve?.();loginResolve=null;}}
      catch(error){status.textContent=text(error?.code==='NETWORK'?'network':error?.code==='CLOUD_UNCONFIGURED'?'cloudUnavailable':['IDENTITY_STORAGE','STORAGE_ERROR','IDENTITY_STATE_INVALID','CONFLICT'].includes(error?.code)?'storage':'failed');password.focus();}
      finally{loginBusy=false;submit.disabled=false;translateLock();}
    });
    translateLock();
  }
  function showLogin(error){
    buildLock();setLocked(true);
    if(error){loginForm.hidden=true;status.textContent=text(error?.code==='CLOUD_UNCONFIGURED'?'cloudUnavailable':remoteMode?'network':'storage');const retry=make('button','btn btn-p wf-account-login-submit',text('retry'));retry.type='button';retry.addEventListener('click',()=>root.location.reload());status.after(retry);}
    else{loginForm.hidden=false;status.textContent='';customerAuthSurface?.updateLanguage?.(locale());username.focus({preventScroll:true});}
  }
  function fresh(){
    if(refreshing)return refreshing;
    refreshing=ready.then(()=>service.refresh()).finally(()=>{refreshing=null;});return refreshing;
  }
  function verifyResume(){
    // A restored page must not use cached permissions while its current account
    // status is being read. Periodic refreshes can remain visually unobtrusive.
    if(booted){resumeChecking=true;scheduleControls();}
    return fresh().catch(()=>{if(booted)invalidate();}).finally(()=>{
      resumeChecking=false;scheduleControls();
      root.dispatchEvent?.(new root.Event('wf-account-access-change'));
    });
  }
  function invalidate(){
    if(!remoteMode)root.WFCloud?.lockLocalAccess?.();
    if(reloading)return;reloading=true;buildLock();setLocked(true);
    // Reload drops all account-specific drafts, generated previews, JS caches and
    // in-memory records; no employee inherits the previous user's open state.
    root.location.reload();
  }
  function onSnapshot(state){
    if(!remoteMode)root.WFCloud?.localIdentityChanged?.();
    const previous=lastSnapshot;lastSnapshot=state;
    if(booted&&state.configured&&!state.currentAccount){if(!explicitLockPending)invalidate();return;}
    if(previous?.currentAccount&&state.currentAccount&&previous.currentAccount.id!==state.currentAccount.id&&booted){invalidate();return;}
    const account=state.currentAccount,key=[state.configured,account?.id,account?.sessionVersion,account?.updatedAt,account?.role,account?.permissions?.join('|')].join(':');
    if(key!==lastUIKey){lastUIKey=key;updateSession();scheduleControls();root.dispatchEvent?.(new root.Event('wf-account-access-change'));}
  }
  async function beforeInit(){
    try{await ready;}catch(error){showLogin(error);throw error;}
    const state=snapshot();
    if(state.configured&&!state.currentAccount){
      loginWait=loginWait||new Promise(resolve=>{loginResolve=resolve;});showLogin();await loginWait;
    }
    booted=true;setLocked(false);updateSession();scheduleControls();
  }
  function initialRoute(requested){
    const state=snapshot();if(!state.configured)return requested||'dashboard';
    return policy.canRoute(state.currentAccount,requested)?requested:policy.safeHome(state.currentAccount);
  }
  async function requestLock(){
    await ready;
    if(explicitLockPending)return;
    if(!snapshot().configured)return;
    if(!snapshot().currentAccount){showLogin();return;}
    if(!root.confirm(text('lockConfirm')))return;
    explicitLockPending=true;buildLock();setLocked(true);loginBusy=true;submit.disabled=true;translateLock();
    // signOut publishes a locked session before committing its audit event.
    // Keep the page alive until that transaction settles, then clear all state.
    try{
      try{await root.WFPush?.beforeSignOut?.();}catch(_){}
      await service.signOut();
    }finally{explicitLockPending=false;invalidate();}
  }
  function updateSession(){
    const sidebar=doc.getElementById('sidebar');if(!sidebar)return;
    if(!sessionButton){sessionButton=make('button','wf-account-session');sessionButton.type='button';sessionButton.id='wfAccountSession';const symbol=make('span');symbol.innerHTML=lockIcon;const caption=make('span');caption.append(make('strong'),make('small'));sessionButton.append(symbol,caption);sidebar.append(sessionButton);sessionButton.addEventListener('click',requestLock);}
    sessionButton.hidden=!snapshot().currentAccount;translateLock();
  }
  const functionPermissions={
    saveCo:'customers.edit',editCo:'customers.edit',deleteCo:'customers.delete',useCoInInvoice:'invoices.edit',
    savePr:'products.edit',editPr:'products.edit',deletePr:'products.delete',deletePrImg:'products.edit',
    saveInvoice:'invoices.edit',editInv:'invoices.edit',deleteInv:'invoices.delete',markDelivered:'invoices.edit',unarchiveInv:'archives.edit',
    addPaymentToInv:'payments.edit',deletePayment:'payments.delete',openPaymentMgmt:'payments.view',
    previewSaved:'invoices.view',previewInvoice:'invoices.view',wfShareSavedInvoice:'invoices.export',
    printInvoice:'invoices.print',downloadPDF:'invoices.export',downloadExcel:'invoices.export',shareWA:'invoices.export',shareEmail:'invoices.export',shareExcel:'invoices.export',openUnifiedShareModal:'invoices.export',wfSharePreparedFile:'invoices.export',wf13ExportAction:'invoices.export',
    wfOpenStatement:'payments.view',openSettingsPage:'settings.view',saveSettings:'settings.edit',
    wfExportBackup:'data.export',wfDriveBackupNow:'data.export',wfDriveBackupButton:'data.export',wfDriveOpenFolder:'data.view',
    wfDriveConnect:'data.edit',wfDriveDisconnect:'data.edit',wfDriveRestoreLatest:'data.edit',wfBackupRestoreConfirm:'data.edit',wfDriveStartFreshBackup:'data.edit',wfCheckDataIntegrity:'data.view',
    qblAddToInvoice:'invoices.edit',qblSendToInvoice:'invoices.edit',qblToggleCart:'invoices.edit',addPrToInv:'invoices.edit',addItemToInv_id:'invoices.edit',selectTypeAndContinue:'customers.edit'
  };
  const functionMatchers=Object.entries(functionPermissions).map(([name,key])=>[new RegExp('(?:^|[^\\w])'+name+'\\s*\\('),key]);
  const selectorPermissions={
    '#headerSettingsBtn':'settings.view','#wfNotificationsButton':'@route:notifications','#wfHomeEdit':'settings.edit',
    '#wfProductCostsOpen,[data-wf-cost-action]':'costs.view',
    '#wfProductLabelsOpen,.wf-label-card-action':'products.print','.wf-label-print':'products.print',
    '#wfPackageLabelsOpen,[data-wf-package-action]':'labels.view','#wfPackagePrint':'labels.print',
    '[data-wf-archive-action]':'archives.view','#wfMfgPrint':'manufacturing.print',
    '#wfMfgCreate,[data-wf-mfg-save]':'manufacturing.edit',
    '#wfSidebarSearchToggle':'search.view',
    '#wfAccountStatementNav':'payments.view','#wfShowroomCardsNav':'products.print',
    '#wfCartNav,#qblCartFab':'invoices.edit'
  };
  function requiredForElement(element){
    const explicit=element.dataset?.wfPermission;if(explicit)return explicit;
    for(const [selector,key]of Object.entries(selectorPermissions))if(element.matches?.(selector))return key;
    const handler=element.getAttribute?.('onclick')||'';
    const route=element.dataset?.page||handler.match(/showPage\(\s*['"]([^'"]+)['"]/)?.[1];
    if(route)return route.replace(/^#/,'')==='notifications'?'@route:notifications':policy.permissionForRoute(route)||'unknown.view';
    for(const [pattern,key]of functionMatchers)if(pattern.test(handler))return key;
    if(/switchTab\(/.test(handler))return 'settings.view';
    return null;
  }
  function setPermissionHidden(element,hidden){
    if(hidden){
      if(!element.hasAttribute('data-wf-access-hidden'))element.setAttribute('data-wf-access-hidden','');
      // Some existing navigation rules intentionally use !important. Keep
      // authorization visibility stronger without changing the user's layout.
      if(element.style?.getPropertyValue){
        if(!hiddenDisplays.has(element))hiddenDisplays.set(element,{value:element.style.getPropertyValue('display'),priority:element.style.getPropertyPriority('display')});
        if(element.style.getPropertyValue('display')!=='none'||element.style.getPropertyPriority('display')!=='important')element.style.setProperty('display','none','important');
      }
    }else{
      if(element.hasAttribute('data-wf-access-hidden'))element.removeAttribute('data-wf-access-hidden');
      const original=hiddenDisplays.get(element);
      if(original){
        if(original.value)element.style.setProperty('display',original.value,original.priority);else element.style.removeProperty('display');
        hiddenDisplays.delete(element);
      }
    }
  }
  function applyControl(element){
    const required=requiredForElement(element);
    if(!required){if(hiddenDisplays.has(element))setPermissionHidden(element,false);return;}
    setPermissionHidden(element,!can(required));
  }
  function syncControls(){
    controlsQueued=false;if(checking)return;
    const selectors=['[data-wf-permission]','[data-page]','[onclick]','.bnav-btn',...Object.keys(selectorPermissions)].join(',');
    doc.querySelectorAll(selectors).forEach(applyControl);
    for(const group of doc.querySelectorAll('.wf-destination,.wf-destination-row')){
      const trigger=group.querySelector('[data-page]');setPermissionHidden(group,!!trigger?.hasAttribute('data-wf-access-hidden'));
    }
    for(const group of doc.querySelectorAll('#sidebar .wf-nav-group')){
      const destinations=Array.from(group.querySelectorAll('.nav-item'));
      setPermissionHidden(group,destinations.length>0&&destinations.every(item=>item.hasAttribute('data-wf-access-hidden')));
    }
    const role=snapshot().currentAccount?.role||'';
    if(doc.documentElement.dataset.wfAccountRole!==role)doc.documentElement.dataset.wfAccountRole=role;
  }
  function scheduleControls(){if(!controlsQueued){controlsQueued=true;root.requestAnimationFrame(syncControls);}}
  doc.addEventListener('click',event=>{
    if(checking||event.target.closest?.('#wfAccountLock'))return;
    const element=event.target.closest?.('button,a,[role="button"],[data-wf-permission]');
    if(!element)return;const permission=requiredForElement(element);
    if(permission&&!can(permission)){event.preventDefault();event.stopImmediatePropagation();denied();}
  },true);
  let lastTouch=0;
  const touch=()=>{const now=Date.now();if(now-lastTouch>1000){lastTouch=now;service?.touch();}};
  doc.addEventListener('pointerdown',touch,{passive:true});doc.addEventListener('keydown',touch,{passive:true});
  async function prepareWrites(operations){
    await fresh();const state=snapshot();if(!state.configured)return operations;
    const account=state.currentAccount;if(!account)assert('unknown.permission');
    return operations.map(operation=>{
      if(operation.type==='merge'){
        const merge=operation.merge;
        if(typeof merge!=='function')throw new Error('ACCESS_DENIED');
        const wrapped={...operation,merge(latest,value){assertSameSession(account);const next=merge(latest,value);dataPolicy.validateWrite(account,operation,latest??null,next);auditActions.set(wrapped,writeAction(operation,latest,next));return next;}};
        return wrapped;
      }
      dataPolicy.validateWrite(account,operation,undefined,operation.value);auditActions.set(operation,writeAction(operation));return operation;
    });
  }
  function assertSameSession(account){const current=snapshot().currentAccount;if(!current||current.id!==account.id||current.sessionVersion!==account.sessionVersion)throw new Error('ACCESS_DENIED');}
  async function assertCurrentSession(){await fresh();const state=snapshot();if(state.configured&&!state.currentAccount)throw new Error('ACCESS_DENIED');}
  function finalizeWrite(operation,latest,next){
    const state=snapshot();if(!state.configured)return next;
    const account=state.currentAccount;if(!account)throw new Error('ACCESS_DENIED');
    const preserved=dataPolicy.preserveRestrictedFields?.(account,operation.store,latest??null,next)??next;
    dataPolicy.validateWrite(account,operation,latest??null,preserved);return preserved;
  }
  function needsInvoiceCosts(operation){return snapshot().configured&&operation?.store==='invoices'&&operation.type!=='merge'&&operation.type!=='delete'&&can('invoices.edit')&&!can('costs.view');}
  function captureInvoiceCosts(latest,next,products){
    const account=assert('invoices.edit');
    return dataPolicy.captureTrustedInvoiceCosts(account,latest,next,products,root.WFCostCore);
  }
  function projectRead(store,value){const state=snapshot();if(checking||resumeChecking||explicitLockPending||state.configured&&!state.currentAccount)throw new Error('ACCESS_DENIED');return state.configured?dataPolicy.projectRead(state.currentAccount,store,value):value;}
  function projectKeys(store,value){
    const state=snapshot();if(checking||resumeChecking||explicitLockPending||state.configured&&!state.currentAccount)throw new Error('ACCESS_DENIED');
    if(!state.configured||state.currentAccount.role==='owner')return value;
    const keys=Array.isArray(value)?value:[];
    if(store==='settings')return keys.filter(key=>String(key).startsWith('cashbox-entry/')&&can('payments.view'));
    const section={companies:'customers',products:'products',invoices:'invoices',payments:'payments'}[store];
    return section&&can(section+'.view')?keys:[];
  }
  function cartKey(){const account=snapshot().currentAccount;if(remoteMode&&account)return 'wf_qbl_cart_cloud_'+(snapshot().workspaceId||'')+'_'+account.id;return account&&account.role!=='owner'?'wf_qbl_cart_account_'+account.id:'wf_qbl_cart';}
  function actor(){const account=snapshot().currentAccount;return account?{id:account.id,name:account.name,username:account.username}:null;}
  function writeAction(operation,before,after){
    if(operation.store==='settings'){
      const id=operation.id??operation.value?.id;
      if(String(id).startsWith('cashbox-entry/'))return 'payments.'+(operation.type==='delete'?'delete':'edit');
      if(id==='nextInvNo')return 'invoices.edit';
      if(before&&after){
        const changes=Object.keys(after).filter(key=>!dataPolicy.sameJSON(before[key],after[key]));
        const owners={dailyTasks:'tasks',materialLibrary:'materials',procurementOrders:'purchasing',labelReprintHistory:'history',packageLabels:'labels',productLabels:'products'};
        for(const field of changes){
          if(field==='labelReprintHistory')return can('labels.print')?'labels.print':'history.edit';
          if(['packageLabels','productLabels'].includes(field))return owners[field]+'.print';
          if(owners[field])return owners[field]+'.'+(operation.value?.type==='delete'?'delete':'edit');
          if(['nextNoExt','nextNoRet','nextNoWhl'].includes(field))return 'invoices.edit';
        }
      }
    }
    if(operation.store==='invoices'&&operation.type==='merge'&&before&&after){
      if(!dataPolicy.sameJSON(before.manufacturingTicket,after.manufacturingTicket))return 'manufacturing.edit';
      if(['archived','archivedAt','delivered','deliveredAt'].some(key=>!dataPolicy.sameJSON(before[key],after[key])))return 'archives.edit';
      if(!dataPolicy.sameJSON(before.payments,after.payments))return 'payments.'+((after.payments?.length||0)<(before.payments?.length||0)?'delete':'edit');
    }
    return policy.permissionForWrite(operation);
  }
  function recordCommit(operations){
    // The cloud batch transaction records authoritative activity after acceptance.
    if(remoteMode)return;
    if(!snapshot().configured||!snapshot().currentAccount||!service.recordActivity)return;
    const first=operations[0];if(!first)return;
    const action=auditActions.get(first)||writeAction(first);
    if(!can(action))return;
    service.recordActivity({action,targetType:first.store,targetId:String(first.id??first.value?.id??''),details:{store:first.store,id:String(first.id??first.value?.id??''),count:operations.length}}).catch(()=>{root.showToast?.(text('auditFailed'),'er');});
  }
  try{
    if(!policy||!dataPolicy)throw new Error('IDENTITY_MODULES');
    if(remoteMode){
      // This entry is a separate cloud identity, including when a browser clones
      // sessionStorage from an owner tab. It must not carry the local owner back.
      try{root.sessionStorage?.removeItem('wf_owner_session_v1');}catch(_){}
      service=root.WFCloudClient?.getClient?.();
      if(!service?.isConfigured?.())throw Object.assign(new Error('CLOUD_UNCONFIGURED'),{code:'CLOUD_UNCONFIGURED'});
    }else{
    if(!root.WFAccountsCore||!root.WFAccountsLocalProvider)throw new Error('IDENTITY_MODULES');
    const provider=root.WFAccountsLocalProvider.create();
    try{if(root.BroadcastChannel)channel=new root.BroadcastChannel('wow-local-accounts-v1');}catch(_){}
    // Only a verified owner receives a continuation capability. Keep it in this
    // tab, outside business data/backups; workers never inherit it on reload.
    const ownerSessionKey='wf_owner_session_v1';
    const sessionStore={
      read(){const value=root.sessionStorage?.getItem(ownerSessionKey);return value?JSON.parse(value):null;},
      write(value){root.sessionStorage.setItem(ownerSessionKey,JSON.stringify(value));},
      clear(){root.sessionStorage?.removeItem(ownerSessionKey);}
    };
    service=root.WFAccountsCore.createService({read:provider.read,commit:async(revision,state)=>{await provider.commit(revision,state);channel?.postMessage({revision:state.revision});},crypto:root.crypto,policy,sessionStore});
    }
    service.subscribe(onSnapshot);
    ready=service.refresh().then(state=>{checking=false;lastSnapshot=service.getSnapshot();if(!remoteMode)root.WFCloud?.localIdentityChanged?.();if(!lastSnapshot.configured)setLocked(false);scheduleControls();return state;});
  }catch(error){ready=Promise.reject(error);}
  // Keep a rejected initialization visible without turning it into a new owner setup.
  ready.catch(error=>{if(!remoteMode)root.WFCloud?.lockLocalAccess?.();showLogin(error);});
  root.WFAccountAccess={ready,service,beforeInit,can,canRoute,allow,assert,initialRoute,requestLock,prepareWrites,assertCurrentSession,finalizeWrite,needsInvoiceCosts,captureInvoiceCosts,projectRead,projectKeys,cartKey,actor,recordCommit,requiredForElement,
    hasAccounts:()=>snapshot().configured,isRemote:()=>remoteMode,refresh:fresh,syncControls:scheduleControls};
  if(channel)channel.onmessage=()=>fresh().catch(()=>{if(booted)invalidate();});
  const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='childList'&&(record.addedNodes.length||record.removedNodes.length)||record.type==='attributes'))scheduleControls();});
  for(const node of [doc.getElementById('sidebar'),doc.getElementById('mainContent'),doc.getElementById('bottomNav')])if(node)observer.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['data-page','data-wf-permission','onclick']});
  new MutationObserver(()=>{translateLock();updateSession();}).observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')verifyResume();});
  root.addEventListener('pageshow',event=>{if(event.persisted)verifyResume();});
  root.setInterval(()=>{if(booted&&snapshot().configured&&doc.visibilityState==='visible')fresh().catch(invalidate);},30000);
})(typeof window==='object'?window:globalThis);
