/* Shared shell for independent, authenticated Mark Robot sections. */
(function(root){
  'use strict';
  const doc=root.document,ops=root.WFOperations,cloud=root.WFCloud;
  if(!doc||!ops||root.WFModules)return;
  const entries=new Map(),words={
    connect:{ar:'اربط مارك ربوت بحسابك السحابي لفتح هذا القسم.',tr:'Bu bölümü açmak için Mark Robot bulut hesabınıza bağlanın.',en:'Connect your Mark Robot cloud account to open this section.',fr:'Connectez votre compte cloud Mark Robot pour ouvrir cette section.',ru:'Подключите облачную учётную запись Mark Robot для открытия раздела.'},
    offline:{ar:'اتصل بالسيرفر للتحقق من حساب المالك وإتاحة النسخ المحفوظة على هذا الجهاز.',tr:'Bu cihazdaki kayıtlı kopyalar için sunucuya bağlanarak sahibi doğrulayın.',en:'Connect to the server to verify the owner and enable saved copies on this device.',fr:'Connectez-vous au serveur pour vérifier le propriétaire et activer les copies enregistrées.',ru:'Подключитесь к серверу для проверки владельца и доступа к сохранённым копиям.'},
    setup:{ar:'إعداد اتصال السيرفر',tr:'Sunucu bağlantısını ayarla',en:'Set up server connection',fr:'Configurer la connexion',ru:'Настроить соединение'},
    denied:{ar:'هذا القسم غير متاح لصلاحيات حسابك.',tr:'Hesabınızın bu bölüme erişim izni yok.',en:'Your account does not have permission to open this section.',fr:'Votre compte ne peut pas ouvrir cette section.',ru:'У вашей учётной записи нет доступа к этому разделу.'},
    retry:{ar:'إعادة المحاولة',tr:'Yeniden dene',en:'Try again',fr:'Réessayer',ru:'Повторить'},
    error:{ar:'تعذّر تحميل القسم. بقيت البيانات المحفوظة كما هي.',tr:'Bölüm yüklenemedi. Kaydedilmiş veriler korunuyor.',en:'The section could not load. Saved data is preserved.',fr:'Le chargement a échoué. Les données enregistrées sont conservées.',ru:'Раздел не загрузился. Сохранённые данные не изменены.'}
  };
  const locale=()=>ops.locale(),label=(value)=>value?.[locale()]||value?.en||value?.ar||'';
  const current=()=>doc.querySelector('.page.active')?.id?.slice(5);
  const session=()=>cloud?.getSnapshot?.()||{};
  const local=()=>root.WFAccountAccess?.service?.getSnapshot?.()||null;
  let ownerGrant;
  const offlineRoute=p=>['gallery','myorders','orders','chat','files','finance','payroll','metals'].includes(p.split('.')[0]);
  const moduleSession=()=>{const live=session();return live.authenticated?live:(ownerGrant?.active()||live);};
  function moduleIdentity(state=moduleSession()){
    const active=local(), remote=state.currentAccount, account=active?.currentAccount;
    if(!(state.authenticated||state.offlineVerified)||!active||!state.workspaceId||!state.userId||!remote||remote.id!==state.userId)return null;
    if(remote.status&&remote.status!=='active'||remote.expiresAt&&Date.parse(remote.expiresAt)<=Date.now())return null;
    if(active.configured&&(!account||account.status&&account.status!=='active'||account.expiresAt&&Date.parse(account.expiresAt)<=Date.now()))return null;
    if(state.mode==='local'&&active.configured&&account?.role!=='owner')return null;
    if(state.mode==='remote'&&account?.id!==remote.id)return null;
    const grants=a=>a?.role==='owner'?'*':(a?.permissions||[]).slice().sort();
    const owner=JSON.stringify([cloud?.getConfig?.().endpoint||'',state.workspaceId,state.userId,state.mode,!!active.configured,account?.id||'']);
    const cloudVersion=state.sessionVersion||0,localVersion=account?.sessionVersion||0;
    // A synchronous retirement marker fences a prior owner even if navigation interrupts an IndexedDB purge.
    let retirement=null;
    if(state.mode==='local'&&active.configured&&account?.role==='owner')try{
      retirement=root.WFOfflineOwnerGrant?.retirement(cloud.getConfig?.().endpoint,{localOwner:account.id,localEpoch:localVersion},root.localStorage);
    }catch(_){}
    const scope=JSON.stringify([owner,cloudVersion,remote.role,remote.expiresAt||'',grants(remote),
      localVersion,account?.role||'',account?.expiresAt||'',grants(account),...(retirement&&retirement!=='initial'?[retirement]:[])]);
    return {owner,scope,cloudVersion,localVersion,verifiedAt:state.lastVerifiedAt||0,runtime:JSON.stringify([scope,state.authGeneration]),
      offlineVerified:state.offlineVerified===true,grantSeal:state.grantSeal};
  }
  const scope=state=>moduleIdentity(state)?.runtime||'';
  const can=permission=>{
    const state=session(),active=local(),access=root.WFAccountAccess;
    if(!active||!access?.can?.(permission))return false;
    if(!state.authenticated){
      const saved=ownerGrant?.active();
      return !!saved&&!!active.configured&&active.currentAccount?.role==='owner'&&
        (offlineRoute(permission)||['customers.view','invoices.view','payments.view'].includes(permission))&&
        root.WFAccountPolicy?.can(saved.currentAccount,permission)===true;
    }
    // A remembered cloud-owner connection belongs to the verified local owner.
    // A local staff login must never inherit that connection's privileges.
    if(state.mode==='local'&&active.configured&&active.currentAccount?.role!=='owner')return false;
    if(state.mode==='remote'&&active.currentAccount?.id!==state.currentAccount?.id)return false;
    return !!root.WFAccountPolicy?.can(state.currentAccount,permission);
  };
  const failure=()=>Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});
  const deviceStore=root.WFModuleStore?.create();
  if(deviceStore && root.WFOfflineOwnerGrant && cloud)ownerGrant=root.WFOfflineOwnerGrant.create({store:deviceStore,cloud,local,
    config:()=>({enabled:cloud.isConfigured?.()===true,endpoint:cloud.getConfig?.().endpoint,pin:root.WOW_CLOUD_CONFIG?.offlineGrantPin,
      origin:root.location?.origin,permissionKeys:root.WFAccountPolicy?.permissionKeys||[]}),liveIdentity:state=>state.authenticated?moduleIdentity(state):null,notify:schedule});
  const transport=root.WFModuleTransport?.create({store:deviceStore,identity:moduleIdentity,can,remote:(action,payload,assertAuthorized)=>cloud.request(action,payload,{authenticated:true,assertAuthorized}),
    verifySession:()=>cloud.refresh(),onBindingRevoked:()=>{ownerGrant?.recheck();schedule();}});
  transport?.start();
  let lastScope=scope(moduleSession()),queued=false;
  const group=doc.createElement('div');group.className='wf-module-nav';
  doc.getElementById('wf-nav-main')?.append(group);

  function release(entry){
    entry.generation++;entry.loading=false;
    try{typeof entry.instance==='function'?entry.instance():entry.instance?.dispose?.();}catch(_){}
    entry.status?.dispose();entry.transport?.dispose();entry.status=null;entry.transport=null;
    entry.instance=null;entry.mountedScope='';entry.surface.body.replaceChildren();
  }
  function notice(entry,type){
    const body=entry.surface.body;body.replaceChildren();
    const box=doc.createElement('section');box.className='wf-module-notice';box.setAttribute('role',type==='error'?'alert':'status');
    const text=doc.createElement('p');text.textContent=label(words[type]);box.append(text);
    const allowedSetup=['connect','offline'].includes(type)&&root.WFAccountAccess?.can?.('settings.view');
    if(type==='error'||allowedSetup){
      const button=doc.createElement('button');button.type='button';button.className='btn';button.textContent=label(words[type==='error'?'retry':'setup']);
      button.addEventListener('click',()=>type==='error'?activate(entry,true):root.WFCloudSettings?.open?.());box.append(button);
    }
    body.append(box);
  }
  async function activate(entry,force=false){
    if(current()!==entry.id)return;
    const state=moduleSession(),identity=scope(state);
    if(!identity){release(entry);notice(entry,root.navigator?.onLine===false||state.connection==='offline'?'offline':'connect');return;}
    if(state.offlineVerified&&!offlineRoute(entry.definition.permission)){release(entry);notice(entry,'connect');return;}
    if(!can(entry.definition.permission)){release(entry);notice(entry,'denied');return;}
    if(!force&&(entry.loading||entry.mountedScope===identity))return;
    release(entry);const generation=entry.generation;entry.loading=true;
    const active=()=>identity===scope(moduleSession())&&generation===entry.generation&&can(entry.definition.permission);
    entry.transport=transport?.view(entry.definition.permission,active);
    const scoped=entry.transport;
    const request=async(action,payload={},options={})=>{
      if(!active())throw failure();
      const result=scoped?await scoped.request(action,payload,options):await cloud.request(action,payload,{authenticated:true});
      if(identity!==scope(moduleSession())||generation!==entry.generation||!can(entry.definition.permission))throw failure();
      return result;
    };
    const api=Object.freeze({...scoped,request,can,getSession:moduleSession,open,notify:(message,type)=>ops.notify(message,type)});
    if(scoped)entry.status=root.WFModuleStatus?.mount(entry.surface.actions,api,locale);
    try{
      const instance=await entry.definition.mount({container:entry.surface.body,api,lang:locale(),locale,params:entry.params,route:entry.id,
        request,can,onNavigate:open});
      if(generation!==entry.generation||identity!==scope(moduleSession())||!can(entry.definition.permission)){
        try{typeof instance==='function'?instance():instance?.dispose?.();}catch(_){}return;
      }
      entry.instance=instance;entry.mountedScope=identity;entry.loading=false;
    }catch(_){if(generation===entry.generation){release(entry);notice(entry,scope(moduleSession())?'error':'connect');}}
  }
  function sync(){
    ownerGrant?.update().catch(()=>{});transport?.update();
    const nowScope=scope(moduleSession());
    if(nowScope!==lastScope){lastScope=nowScope;for(const entry of entries.values())release(entry);}
    for(const entry of entries.values()){
      const active=local();
      const allowed=!!root.WFAccountAccess?.can?.(entry.definition.permission)&&
        (session().mode!=='local'||!active?.configured||active?.currentAccount?.role==='owner');
      entry.button.hidden=!allowed;entry.button.classList.toggle('active',current()===entry.id);
      entry.caption.textContent=label(entry.definition.title);
      if(!can(entry.definition.permission)&&(entry.instance||entry.loading))release(entry);
      if(current()===entry.id)activate(entry);else if((entry.instance||entry.loading)&&!dirty(entry))release(entry);
    }
  }
  function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;sync();});}
  function register(definition){
    if(!definition||!/^[a-z][a-z0-9-]{1,50}$/.test(definition.id)||typeof definition.mount!=='function'||
       root.WFAccountPolicy?.permissionForRoute(definition.id)!==definition.permission)throw Error('INVALID_MODULE_DEFINITION');
    if(entries.has(definition.id))throw Error('DUPLICATE_MODULE');
    const entry={id:definition.id,definition,instance:null,mountedScope:'',loading:false,generation:0,params:{}};
    entry.surface=ops.register({...definition,onEnter:()=>activate(entry),onLanguage:()=>{
      entry.caption.textContent=label(definition.title);entry.instance?.updateLanguage?.(locale());entry.status?.updateLanguage();
      if(current()===entry.id&&!entry.instance&&!entry.loading)activate(entry,true);
    }});
    entry.surface.page.classList.add('wf-module-page');
    const button=doc.createElement('button');button.type='button';button.className='nav-item';button.dataset.wfPermission=definition.permission;
    button.setAttribute('data-wf-module-route',entry.id);
    const icon=doc.createElement('span');icon.className='nav-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=ops.icon(definition.icon||'package');
    const caption=doc.createElement('span');caption.textContent=label(definition.title);button.append(icon,caption);
    button.addEventListener('click',()=>open(entry.id));group.append(button);entry.button=button;entry.caption=caption;
    entries.set(entry.id,entry);root.WFAccountAccess?.syncControls?.();schedule();return entry.surface;
  }
  function open(id,params={}){
    const entry=entries.get(id);
    if(!entry)return root.showPage?.(id);
    if(!root.WFAccountAccess?.can?.(entry.definition.permission))return false;
    if((entry.instance||entry.loading)&&!mayLeave(entry))return false;
    entry.params=params&&typeof params==='object'?{...params}:{};
    if(entry.instance||entry.loading)release(entry);
    root.showPage(id);schedule();
  }
  function dirty(entry){try{return !!entry?.instance?.hasUnsavedChanges?.();}catch(_){return true;}}
  function mayLeave(entry){
    if(!dirty(entry))return true;
    return !!root.confirm?.(label({ar:'لديك تغييرات غير محفوظة. هل تريد مغادرة القسم؟',en:'You have unsaved changes. Leave this section?',tr:'Kaydedilmemiş değişiklikleriniz var. Bölümden çıkılsın mı?',fr:'Des modifications ne sont pas enregistrées. Quitter cette section ?',ru:'Есть несохранённые изменения. Покинуть раздел?'}));
  }
  const originalShow=root.showPage;
  root.showPage=function(id){
    const previous=entries.get(current());
    if(id!==current()&&!mayLeave(previous))return false;
    const result=originalShow.apply(this,arguments);schedule();return result;
  };
  cloud?.subscribe?.(schedule);
  root.addEventListener('wf-cloud-local-owner-retired',event=>{ownerGrant?.retire(event.detail);schedule();});
  root.addEventListener('wf-account-access-change',schedule);
  root.addEventListener('wf-cloud-session-change',schedule);
  root.addEventListener('hashchange',schedule);
  root.addEventListener('pagehide',()=>{for(const entry of entries.values())release(entry);});
  root.addEventListener('pageshow',schedule);root.addEventListener('online',schedule);root.addEventListener('offline',schedule);doc.addEventListener?.('visibilitychange',schedule);
  root.addEventListener('beforeunload',event=>{if([...entries.values()].some(dirty)){event.preventDefault();event.returnValue='';}});
  function guard(){root.WFAppUpdates?.registerGuard?.('mark-robot-modules',()=>[...entries.values()].some(entry=>!!entry.instance?.hasUnsavedChanges?.()));}
  guard();root.addEventListener('load',guard,{once:true});
  root.WFModules=Object.freeze({register,open,refresh:()=>{const entry=entries.get(current());if(entry&&mayLeave(entry))activate(entry,true);},
    getSession:session,can,locale});
})(typeof window==='object'?window:globalThis);
