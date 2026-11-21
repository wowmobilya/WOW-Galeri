/* Apply a new controlling worker only when the workspace is safe to reload.
   No database, draft, cache or installed application is deleted by this module. */
(() => {
  'use strict';
  const INTERVAL=60000,GUARD='wf_app_update_reload_v1';
  function blocking(safety){
    if(safety.dirty||safety.editing)return 'draft';
    if(safety.dialog)return 'dialog';
    if(safety.busy||safety.speech||safety.camera||safety.downloading)return 'busy';
    if(!safety.visible)return 'hidden';
    return '';
  }
  function createCoordinator({bootController,release,getSafety,readGuard,writeGuard,reload,now=Date.now,onChange=()=>{}}){
    let baseline=bootController||null,target=null,reloaded=false,dismissed=false,automaticSuppressed=false;
    const status=()=>{
      // Keystrokes and speech progress also ask for banner state. Without a
      // replacement worker there is no reload to guard or form to serialize.
      if(!target)return {available:false,reloaded,dismissed,reason:'',canReload:false,canAutoReload:false};
      const safety=getSafety(),reason=blocking(safety);return {available:true,reloaded,dismissed,reason,canReload:!reloaded&&!reason,canAutoReload:!reloaded&&!dismissed&&!automaticSuppressed&&!reason&&safety.route==='dashboard'&&safety.idle};
    };
    function changed(controller){
      if(!controller||controller.state!=='activated')return false;
      // A first installation is not an update of the page that is already open.
      if(!baseline){baseline=controller;return false;}
      if(controller===baseline||controller===target)return false;
      target=controller;dismissed=false;onChange(status());return true;
    }
    function attempt(manual=false){
      const state=status();if(!state.canReload||(!manual&&!state.canAutoReload)){onChange(state);return false;}
      const key='from-release:'+release,previous=readGuard();
      if(!manual&&previous?.key===key){automaticSuppressed=true;onChange(status());return false;}
      const recorded=writeGuard({key,at:now()});
      // If a persistent loop guard is unavailable, leave the choice to the user.
      if(!manual&&!recorded){automaticSuppressed=true;onChange(status());return false;}
      reloaded=true;onChange(status());reload();return true;
    }
    return {changed,status,attempt,dismiss(){dismissed=true;onChange(status());},reveal(){dismissed=false;onChange(status());}};
  }
  function createChecker({registration,visible,online,now=Date.now,minimum=10000}){
    let pending=null,last=-Infinity;
    return function check(force=false){
      if(pending)return pending;
      if(!visible()||!online()||(!force&&now()-last<minimum))return Promise.resolve(false);
      last=now();
      pending=Promise.resolve().then(registration).then(async reg=>{if(!reg)return false;await reg.update();return true;}).catch(()=>false).finally(()=>pending=null);
      return pending;
    };
  }
  function createDraftTracker({snapshot,revision=()=>null}){
    const records=new Map();
    function begin(root){if(root&&!records.has(root))records.set(root,{baseline:snapshot(root),forced:false,submitted:false});}
    function touch(root,forced=false){if(!root)return;const known=records.has(root);begin(root);const record=records.get(root);record.submitted=false;record.forced=record.forced||forced||!known;}
    function clean(root){if(root)records.delete(root);}
    function submitted(root){begin(root);if(root){const record=records.get(root);record.submitted=true;record.revision=revision(root);}}
    function settled(root){const record=records.get(root);if(!record?.submitted)return;record.submitted=false;if(revision(root)!==record.revision)records.delete(root);}
    function dirty(){
      for(const [root,record] of records){
        if(root.isConnected===false){records.delete(root);continue;}
        if(record.forced||snapshot(root)!==record.baseline)return true;
      }
      return false;
    }
    return {begin,touch,clean,submitted,settled,dirty};
  }
  function visibleElement(element,style,viewport){
    if(!element||!element.getClientRects().length)return false;
    for(let current=element;current;current=current.parentElement){
      if(current.hidden||current.getAttribute('aria-hidden')==='true')return false;
      const css=style(current);if(css.display==='none'||css.visibility==='hidden'||Number(css.opacity)===0)return false;
    }
    const rect=element.getBoundingClientRect?.();
    return !rect||!viewport||rect.bottom>viewport.top&&rect.top<viewport.bottom&&rect.right>viewport.left&&rect.left<viewport.right;
  }
  const core={INTERVAL,blocking,createCoordinator,createChecker,createDraftTracker,visibleElement};
  if(typeof module!=='undefined'&&module.exports){module.exports=core;return;}
  if(typeof document==='undefined'||window.WFAppUpdates)return;
  const script=document.currentScript||document.querySelector('script[src*="app-updates.js"]');
  const release=String(script?.dataset.release||'174').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,40)||'174';
  const copy={
    ar:{title:'يتوفر تحديث جديد',ready:'التحديث جاهز. يمكنك تحديث البرنامج الآن.',draft:'احفظ التعديلات أو ألغها قبل التحديث.',dialog:'أغلق النافذة المفتوحة عندما تنتهي لتحديث البرنامج.',busy:'سينتظر التحديث انتهاء العملية الحالية.',refresh:'تحديث الآن',later:'لاحقًا',version:'الإصدار',check:'التحقق من التحديثات',checking:'جارٍ التحقق…',checked:'تم التحقق من التحديثات',failed:'تعذّر التحقق الآن. حاول عند توفر الاتصال.'},
    en:{title:'An update is ready',ready:'You can refresh the app now.',draft:'Save or discard your edits before refreshing.',dialog:'Close the open window when you finish to refresh the app.',busy:'The update will wait for the current activity to finish.',refresh:'Refresh now',later:'Later',version:'Version',check:'Check for updates',checking:'Checking…',checked:'Update check complete',failed:'Could not check now. Try again when connected.'},
    tr:{title:'Yeni güncelleme hazır',ready:'Uygulamayı şimdi yenileyebilirsiniz.',draft:'Yenilemeden önce değişiklikleri kaydedin veya iptal edin.',dialog:'İşiniz bitince açık pencereyi kapatıp uygulamayı yenileyin.',busy:'Güncelleme mevcut işlemin bitmesini bekleyecek.',refresh:'Şimdi yenile',later:'Daha sonra',version:'Sürüm',check:'Güncellemeleri kontrol et',checking:'Kontrol ediliyor…',checked:'Güncelleme kontrolü tamamlandı',failed:'Şimdi kontrol edilemedi. Bağlantı varken tekrar deneyin.'},
    fr:{title:'Une mise à jour est prête',ready:'Vous pouvez actualiser l’application.',draft:'Enregistrez ou annulez vos modifications avant d’actualiser.',dialog:'Fermez la fenêtre ouverte après avoir terminé pour actualiser.',busy:'La mise à jour attend la fin de l’activité en cours.',refresh:'Actualiser',later:'Plus tard',version:'Version',check:'Rechercher des mises à jour',checking:'Vérification…',checked:'Vérification terminée',failed:'Vérification impossible. Réessayez avec une connexion.'},
    ru:{title:'Доступно обновление',ready:'Теперь можно обновить приложение.',draft:'Сохраните или отмените изменения перед обновлением.',dialog:'Завершите работу и закройте открытое окно для обновления.',busy:'Обновление дождётся завершения текущей операции.',refresh:'Обновить сейчас',later:'Позже',version:'Версия',check:'Проверить обновления',checking:'Проверка…',checked:'Проверка завершена',failed:'Проверка недоступна. Повторите при подключении.'}
  };
  const language=()=>copy[document.documentElement.lang]||copy.en;
  const state=()=>typeof S==='object'?S:{};
  const isVisible=element=>{const view=window.visualViewport;return visibleElement(element,getComputedStyle,{left:view?.offsetLeft||0,top:view?.offsetTop||0,right:(view?.offsetLeft||0)+(view?.width||window.innerWidth),bottom:(view?.offsetTop||0)+(view?.height||window.innerHeight)});};
  const roots='#page-add-company,#page-add-product,#page-create-invoice,#page-payment-management,#page-cashboxes,#stab-company,#stab-bank,#stab-invoice,#stab-currency,#stab-app-identity,#stab-product-categories';
  const editor=element=>element?.closest?.(roots)||element?.closest?.('form')||null;
  function settingsLogoSource(){
    let fallback='',pending;
    try{if(typeof DEFAULT_WOW_LOGO==='string')fallback=DEFAULT_WOW_LOGO;}catch(_){}
    try{if(typeof wfPendingSettingsLogo!=='undefined')pending=wfPendingSettingsLogo;}catch(_){}
    return pending!==undefined?pending:state().settings?.logo||fallback;
  }
  function snapshot(root){
    const fields=[...root.querySelectorAll('input,select,textarea,[contenteditable="true"]')].map(field=>[field.id||field.name||field.tagName,field.type==='checkbox'||field.type==='radio'?field.checked:field.type==='file'?[...(field.files||[])].map(file=>file.name+':'+file.size):field.value??field.textContent]);
    const data=state(),extra=root.id==='page-create-invoice'?[data.invItems,data.currentInvPayments,data.invTier]:root.id==='page-add-product'?[data.prImgData,data.selColor]:root.id==='page-add-company'?[data.logoData]:root.id==='stab-company'?[settingsLogoSource()]:null;
    return JSON.stringify([fields,extra]);
  }
  function revision(root){const settings=state().settings||{};return root.id==='stab-app-identity'?settings.appIdentity:root.id==='stab-product-categories'?settings.productCategories:null;}
  const drafts=createDraftTracker({snapshot,revision});
  let lastInteraction=Date.now(),cameraBusy=false,registration=null,registering=null,autoTimer=0,tickTimer=0,checkTimer=0,ready=false,suspended=false;
  const guards=new Map();
  const banner=document.createElement('aside');banner.id='wfAppUpdate';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
  const content=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p'),actions=document.createElement('div'),refreshButton=document.createElement('button'),laterButton=document.createElement('button');
  content.className='wf-app-update-copy';actions.className='wf-app-update-actions';refreshButton.type=laterButton.type='button';refreshButton.className='wf-app-update-refresh';laterButton.className='wf-app-update-later';content.append(title,detail);actions.append(refreshButton,laterButton);banner.append(content,actions);document.body.append(banner);
  function safety(){
    const data=state();let extra=false,downloading=false;
    for(const check of guards.values()){try{if(check())extra=true;}catch(_){extra=true;}}
    try{downloading=[window.WFOfflineVoice,window.WFReferenceVoice].some(api=>api?.list().some(voice=>api.getStatus(voice.locale).state==='downloading'));}catch(_){downloading=true;}
    const active=document.activeElement;
    const focused=!!active?.matches?.('input:not([type="button"]):not([type="submit"]),textarea,select,[contenteditable="true"]')&&isVisible(active);
    const route=document.querySelector('.page.active')?.id?.replace(/^page-/,'')||'';
    const dialogs=[...document.querySelectorAll('dialog[open],[aria-modal="true"],[role="dialog"],.modal-ov,.delete-modal-ov,.deliver-modal-ov,#currCalcModal,#wfsa,#wfRestoreModal,#wfUnifiedShareOverlay,#wfExcelShareReady')].some(isVisible);
    let pending=false;
    try{pending=!!(typeof WF_SAVE_PENDING!=='undefined'&&WF_SAVE_PENDING.size)||!!window.WF_RESTORE_WRITE_LOCK||!!(typeof WF_RESTORE_PENDING!=='undefined'&&WF_RESTORE_PENDING.busy)||!!(typeof WF_DRIVE_STATE!=='undefined'&&(WF_DRIVE_STATE.inFlight||WF_DRIVE_STATE.connectBusy));}catch(_){pending=true;}
    const media=[...document.querySelectorAll('audio,video')].some(item=>(item.srcObject?.active===true)||(!item.paused&&!item.ended));
    return {route,visible:document.visibilityState==='visible',idle:Date.now()-lastInteraction>2500,
      dirty:drafts.dirty(),editing:focused||(route==='add-company'&&!!data.editCoId)||(route==='add-product'&&!!data.editPrId)||(route==='create-invoice'&&!!data.editInvId)||(!data.editInvId&&(!!data.invItems?.length||!!data.currentInvPayments?.length))||extra,
      dialog:dialogs,busy:!ready||pending||media||!!document.querySelector('[aria-busy="true"]:not(#wfAppUpdate)'),
      speech:document.getElementById('wfGreetingRobot')?.dataset.voiceActive==='true'||!!window.speechSynthesis?.speaking||!!window.speechSynthesis?.pending,
      camera:cameraBusy||document.querySelector('#stab-robot .wf-robot-camera-toggle')?.getAttribute('aria-checked')==='true',downloading};
  }
  function readGuard(){try{return JSON.parse(sessionStorage.getItem(GUARD)||'null');}catch(_){return null;}}
  function writeGuard(value){try{sessionStorage.setItem(GUARD,JSON.stringify(value));return true;}catch(_){return false;}}
  function render(update=coordinator.status()){
    const text=language();title.textContent=text.title;detail.textContent=text[update.reason]||text.ready;refreshButton.textContent=text.refresh;laterButton.textContent=text.later;
    refreshButton.disabled=!update.canReload;banner.hidden=!update.available||update.dismissed||update.reloaded;
    if(!banner.hidden){const header=[...document.querySelectorAll('.navbar,.page.active > .sct-sticky-header')].find(isVisible);banner.style.setProperty('--wf-update-top',Math.max(12,header?header.getBoundingClientRect().bottom+8:12)+'px');}
    if(versionLabel)versionLabel.textContent=text.version+' '+release;
    if(checkButton&&!checkButton.disabled)checkButton.textContent=text.check;
    const ticking=update.available&&!update.dismissed&&!update.reloaded&&!suspended&&document.visibilityState==='visible';
    if(ticking&&!tickTimer)tickTimer=setInterval(()=>{render();scheduleAuto();},1000);
    if(!ticking){clearInterval(tickTimer);tickTimer=0;}
  }
  const coordinator=createCoordinator({bootController:navigator.serviceWorker?.controller,release,getSafety:safety,readGuard,writeGuard,reload:()=>location.reload(),onChange:render});
  function scheduleAuto(){
    clearTimeout(autoTimer);autoTimer=0;
    if(suspended||document.visibilityState!=='visible')return;
    if(coordinator.status().canAutoReload)autoTimer=setTimeout(()=>coordinator.attempt(false),750);
  }
  let versionLabel=null,checkButton=null;
  function aboutVersion(){
    const about=document.querySelector('#stab-about .wf-about-identity');if(!about)return;
    versionLabel=about.querySelector('[data-wf-ui="Version 2.0.0"]')||document.getElementById('wfAppRelease');
    if(!versionLabel){versionLabel=document.createElement('span');about.append(versionLabel);}
    versionLabel.removeAttribute('data-wf-ui');versionLabel.removeAttribute('data-i18n');versionLabel.id='wfAppRelease';versionLabel.classList.add('wf-app-release');
    checkButton=document.createElement('button');checkButton.id='wfCheckAppUpdates';checkButton.type='button';checkButton.className='wf-app-check-updates';about.append(checkButton);
    checkButton.addEventListener('click',async()=>{checkButton.disabled=true;checkButton.textContent=language().checking;const ok=await check(true);if(coordinator.status().available)coordinator.reveal();checkButton.disabled=false;checkButton.textContent=ok?language().checked:language().failed;setTimeout(()=>{if(checkButton&&!checkButton.disabled)checkButton.textContent=language().check;},4000);});
  }
  async function register(){
    if(registration)return registration;if(registering)return registering;
    if(!navigator.serviceWorker)return null;
    registering=navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
      registration=reg;
      reg.addEventListener('updatefound',()=>{const installing=reg.installing;if(installing)installing.addEventListener('statechange',inspectController);});
      inspectController();return reg;
    }).catch(()=>null).finally(()=>registering=null);
    return registering;
  }
  const check=createChecker({registration:register,visible:()=>document.visibilityState==='visible',online:()=>navigator.onLine!==false});
  function inspectController(){
    const controller=navigator.serviceWorker?.controller;
    if(controller&&controller.state!=='activated'){controller.addEventListener('statechange',inspectController,{once:true});return;}
    if(coordinator.changed(controller)){render();scheduleAuto();}
  }
  function stopTimers(){clearTimeout(checkTimer);checkTimer=0;clearTimeout(autoTimer);autoTimer=0;clearInterval(tickTimer);tickTimer=0;}
  function checkVisible(){
    clearTimeout(checkTimer);checkTimer=0;
    if(suspended||document.visibilityState!=='visible'){stopTimers();return;}
    check();render();scheduleAuto();checkTimer=setTimeout(checkVisible,INTERVAL);
  }
  function interaction(){lastInteraction=Date.now();clearTimeout(autoTimer);autoTimer=0;}
  document.addEventListener('pointerdown',event=>{interaction();drafts.begin(editor(event.target));},{passive:true,capture:true});
  document.addEventListener('focusin',event=>{interaction();drafts.begin(editor(event.target));});
  document.addEventListener('keydown',interaction,{passive:true,capture:true});document.addEventListener('wheel',interaction,{passive:true,capture:true});
  for(const type of ['input','change'])document.addEventListener(type,event=>{interaction();const root=editor(event.target);drafts.touch(root,event.target.type==='file'||root?.id==='stab-product-categories');render();},true);
  document.addEventListener('submit',event=>drafts.submitted(editor(event.target)),true);
  document.addEventListener('reset',event=>{const root=editor(event.target);queueMicrotask(()=>{if(!event.defaultPrevented)drafts.clean(root);});},true);
  document.addEventListener('wf-cashbox-entry-saved',event=>{
    const root=editor(event.target);if(root?.id!=='page-cashboxes')return;
    drafts.clean(root);render();scheduleAuto();
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button');if(!target)return;
    const root=editor(target);if(!root)return;
    if(root.id==='stab-company'&&/^\s*resetSettingsLogo\s*\(\s*\)\s*;?\s*$/.test(target.getAttribute('onclick')||'')){drafts.touch(root);render();}
    else if(target.matches('.wf-app-identity-actions button[type="button"],.wf-category-form-actions button[type="button"],.wf-category-new,.wf-category-edit'))drafts.clean(root);
    else if(target.closest('.wf-app-identity-cards,.wf-category-image-controls'))drafts.touch(root,true);
  });
  function wrap(name,after){const original=window[name];if(typeof original!=='function')return;window[name]=function(...args){const before=after.before?.();const result=original.apply(this,args);if(result&&typeof result.then==='function')return result.then(value=>{after(value,before);return value;});after(result,before);return result;};}
  wrap('resetCoForm',()=>drafts.clean(document.getElementById('page-add-company')));
  wrap('resetPrForm',()=>drafts.clean(document.getElementById('page-add-product')));
  const savedSettings=(_result,before)=>{if(state().settings!==before)for(const id of ['company','bank','invoice','currency'])drafts.clean(document.getElementById('stab-'+id));};savedSettings.before=()=>state().settings;wrap('saveSettings',savedSettings);
  const savedInvoice=(_result,before)=>{const invoices=state().invoices||[];if(invoices.length!==before.length||invoices.some((invoice,index)=>invoice!==before[index]))drafts.clean(document.getElementById('page-create-invoice'));};savedInvoice.before=()=>[...(state().invoices||[])];wrap('saveInvoice',savedInvoice);
  const savedPayment=(_result,before)=>{const payments=state().payments||[];if(payments.length!==before.length||payments.some((payment,index)=>payment!==before[index]))drafts.clean(document.getElementById('page-payment-management'));};savedPayment.before=()=>[...(state().payments||[])];wrap('addPaymentToInv',savedPayment);
  refreshButton.addEventListener('click',()=>coordinator.attempt(true));laterButton.addEventListener('click',()=>coordinator.dismiss());
  navigator.serviceWorker?.addEventListener('controllerchange',inspectController);
  document.addEventListener('visibilitychange',checkVisible);window.addEventListener('focus',checkVisible);window.addEventListener('online',checkVisible);
  window.addEventListener('pagehide',()=>{suspended=true;stopTimers();});
  window.addEventListener('pageshow',event=>{if(suspended||event.persisted){suspended=false;checkVisible();}});
  window.addEventListener('resize',()=>render(),{passive:true});
  window.addEventListener('wf-robot-motion',event=>{cameraBusy=!!event.detail?.active||event.detail?.state==='requesting';render();});
  window.addEventListener('wf-robot-speaking',()=>render());window.addEventListener('wf-offline-voice-change',()=>render());
  new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  new MutationObserver(records=>{for(const {target} of records)if((target.id==='stab-app-identity'||target.id==='stab-product-categories')&&target.getAttribute('aria-busy')!=='true')drafts.settled(target);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-busy']});
  window.WFAppUpdates={release,getSafety:safety,check:()=>check(true),status:()=>coordinator.status(),refresh:()=>coordinator.attempt(true),markClean:root=>drafts.clean(typeof root==='string'?document.querySelector(root):root),registerGuard:(name,guard)=>{if(typeof guard==='function')guards.set(name,guard);return()=>guards.delete(name);}};
  aboutVersion();render();
  function start(){ready=true;register().then(()=>{render();scheduleAuto();clearTimeout(checkTimer);if(!suspended&&document.visibilityState==='visible')checkTimer=setTimeout(checkVisible,INTERVAL);});}
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
