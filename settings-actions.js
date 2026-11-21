/* Settings actions belong to the existing curved navigation. Each editor owns
   its draft, validation, persistence and rollback; this controller only routes
   the shared buttons and protects unfinished edits without another dialog. */
(() => {
  'use strict';
  const page=document.getElementById('page-settings');
  const dialog=document.getElementById('wfSettingsDialog');
  const nav=document.getElementById('bottomNav');
  if(!page||!dialog||!nav||window.WFSettingsActions)return;
  const root=document.documentElement;
  const locales=['ar','en','tr','fr','ru'];
  const words={
    save:['حفظ','Save','Kaydet','Enregistrer','Сохранить'],
    saving:['جارٍ الحفظ','Saving','Kaydediliyor','Enregistrement','Сохранение'],
    saved:['تم الحفظ','Saved','Kaydedildi','Enregistré','Сохранено'],
    cancel:['إلغاء','Cancel','İptal','Annuler','Отмена'],
    back:['رجوع','Back','Geri','Retour','Назад'],
    done:['تم','Done','Tamam','Terminer','Готово'],
    refresh:['تحديث','Refresh','Yenile','Actualiser','Обновить'],
    clean:['لا توجد تعديلات غير محفوظة','No unsaved changes','Kaydedilmemiş değişiklik yok','Aucune modification en attente','Нет несохранённых изменений'],
    dirty:['تعديلات بانتظار الحفظ','Changes ready to save','Kaydedilmeyi bekleyen değişiklikler','Modifications à enregistrer','Есть несохранённые изменения'],
    busy:['جارٍ معالجة التعديلات…','Processing changes…','Değişiklikler işleniyor…','Traitement des modifications…','Обработка изменений…'],
    automatic:['تُحفظ التغييرات تلقائيًا','Changes are saved automatically','Değişiklikler otomatik kaydedilir','Les modifications sont enregistrées automatiquement','Изменения сохраняются автоматически'],
    readonly:['اختر الإجراء الذي تحتاجه في هذا القسم','Choose an action in this section','Bu bölümde bir işlem seçin','Choisissez une action dans cette rubrique','Выберите действие в этом разделе'],
    leave:['لديك تعديلات؛ احفظها أو اختر إلغاء قبل مغادرة القسم','Save or cancel your changes before leaving this section','Bu bölümden ayrılmadan önce kaydedin veya iptal edin','Enregistrez ou annulez avant de quitter cette rubrique','Сохраните или отмените изменения перед выходом'],
    invalid:['راجع الحقول المعلّمة ثم احفظ مجددًا','Check the highlighted fields, then save again','İşaretli alanları kontrol edip yeniden kaydedin','Vérifiez les champs signalés, puis enregistrez','Проверьте отмеченные поля и сохраните снова'],
    failed:['لم يتم الحفظ؛ تعديلاتك محفوظة في النموذج للمحاولة مجددًا','Not saved. Your edits are still here; try again','Kaydedilemedi. Değişiklikleriniz duruyor; yeniden deneyin','Échec de l’enregistrement. Vos modifications sont conservées','Не сохранено. Изменения остались в форме; повторите попытку'],
    cancelled:['أُلغيت التعديلات','Changes cancelled','Değişiklikler iptal edildi','Modifications annulées','Изменения отменены']
  };
  const text=key=>(words[key]||words.clean)[Math.max(0,locales.indexOf(root.lang))];
  const owners={company:'WFCompanyIdentity',bank:'WFCompanyIdentity',invoice:'WFCompanyIdentity',
    currency:'WFCurrencySources','smart-card':'WFSmartCardSettings','app-identity':'WFAppIdentity',
    'product-categories':'WFProductCategories',robot:'WFRobotSettings',accounts:'WFAccounts',cloud:'WFCloudSettings'};
  const status=document.createElement('span');
  status.id='wfSettingsActionStatus';status.className='wf-settings-dock-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  nav.append(status);
  let queued=false,viewportQueued=false,forwarding=false,leaving=false,invalid=false;
  let lastKey='',submittedKey='',outcome='',lastSignature='';

  function selectedSection(){
    return page.querySelector('.tab-btn.active')?.id?.replace('wf-settings-tab-','')||'';
  }
  function current(){
    if(!dialog.open||!page.classList.contains('active'))return null;
    const key=selectedSection();
    const owner=window[owners[key]];
    return owner?.getSettingsActions?.()||null;
  }
  function blocked(target){
    if(typeof target==='function')return false;
    return !target||target.disabled||target.matches?.(':disabled')||
      target.getAttribute?.('aria-disabled')==='true'||target.getAttribute?.('aria-busy')==='true'||
      !!target.closest?.('[inert]');
  }
  function getState(){
    const open=dialog.open&&page.classList.contains('active');
    const action=open?current():null;
    const section=selectedSection();
    const editable=!!action?.save;
    const busy=!!action?.busy;
    const dirty=!!action?.dirty;
    const automatic=!editable&&['appearance','language'].includes(section);
    const key=action?.key||section;
    const same=key===lastKey;
    let state=busy?'busy':same&&leaving?'leave':editable?dirty?'dirty':same&&outcome==='saved'?'saved':'clean':automatic?'automatic':'readonly';
    let message=same&&invalid?'invalid':action?.error?'failed':state;
    if(same&&outcome==='cancelled'&&!dirty&&!busy)message='cancelled';
    const intent=action?.intent||'save';
    const primary=busy?'saving':!editable?'done':intent==='refresh'?'refresh':state==='saved'?'saved':'save';
    return {open,key,editable,busy,dirty,automatic,state,message:message==='saved'?text('saved'):text(message),
      primaryLabel:text(primary),primaryIcon:busy?'loading':!editable||state==='saved'?'check':intent==='refresh'?'refresh':'save',
      backLabel:text('back'),cancelLabel:text('cancel'),
      canSave:open&&editable&&!busy&&!blocked(action.save)&&(action.canSave??dirty),
      canCancel:open&&editable&&!busy&&!blocked(action.cancel),
      canBack:open&&!busy};
  }
  function canRun(name){
    const state=getState();
    return name==='primary'?(state.editable?state.canSave:state.canBack):name==='cancel'?state.canCancel:state.canBack;
  }
  function invoke(target){
    if(blocked(target))return false;
    forwarding=true;
    try{return typeof target==='function'?target():target.click();}
    finally{forwarding=false;}
  }
  function discard(action){
    if(!action||action.busy||blocked(action.cancel))return false;
    invoke(action.cancel);
    leaving=false;invalid=false;submittedKey='';outcome='cancelled';
    if(!current()?.dirty)window.WFAppUpdates?.markClean?.(action.scope);
    schedule();return true;
  }
  function requestBack(){
    const state=getState(),action=current();
    if(!state.canBack)return false;
    if(state.dirty){leaving=true;invalid=false;outcome='';schedule();document.getElementById('bnav-2')?.focus({preventScroll:true});return false;}
    if(action){
      const key=action.key;
      if(!discard(action))return false;
      // Nested company/category/source editors return to their own directory.
      // Root settings forms return to the section cards after their reset.
      if(current()?.key===key)dialog.close();
    }else dialog.close();
    schedule();return true;
  }
  function run(name){
    if(!canRun(name))return false;
    if(name==='back')return requestBack();
    const action=current();
    if(name==='cancel')return discard(action);
    if(!action){dialog.close();schedule();return true;}
    invalid=false;leaving=false;outcome='';submittedKey=action.key;
    invoke(action.save);schedule();return true;
  }
  function markSources(action){
    if(!action)return;
    for(const [kind,target]of [['save',action.save],['cancel',action.cancel]]){
      if(!target||typeof target==='function')continue;
      if(target.dataset.wfDockedAction!==kind)target.dataset.wfDockedAction=kind;
      const row=target.closest('.wf-app-identity-actions,.wf-category-form-actions,.wf-smart-settings-actions,.wf-fx-details-actions,#wfCompanySectionDialog > footer');
      if(row&&!row.hasAttribute('data-wf-docked-row'))row.setAttribute('data-wf-docked-row','');
    }
  }
  function viewport(){
    viewportQueued=false;
    if(!dialog.open)return;
    const view=window.visualViewport;
    if(view&&Math.abs(view.scale-1)>.01)return;
    for(const [key,value]of [['--wf-settings-viewport-height',(view?.height||window.innerHeight)+'px'],['--wf-settings-viewport-top',(view?.offsetTop||0)+'px']]){
      if(dialog.style.getPropertyValue(key)!==value)dialog.style.setProperty(key,value);
    }
  }
  function scheduleViewport(){if(!viewportQueued){viewportQueued=true;requestAnimationFrame(viewport);}}
  function sync(){
    queued=false;
    const action=current();
    let state=getState();
    if(state.key!==lastKey){lastKey=state.key;leaving=false;invalid=false;outcome='';submittedKey='';}
    if(submittedKey===state.key&&!state.busy){
      if(!state.dirty&&!action?.error&&!invalid)outcome='saved';
      submittedKey='';
    }
    state=getState();
    nav.classList.toggle('wf-settings-dock',state.open);
    status.hidden=!state.open;
    if(state.open){
      markSources(action);
      const message=state.message;
      if(status.textContent!==message)status.textContent=message;
      if(nav.dataset.settingsState!==state.state)nav.dataset.settingsState=state.state;
      if(nav.dataset.settingsEditable!==String(state.editable))nav.dataset.settingsEditable=String(state.editable);
      nav.classList.remove('settings-close-action');
      scheduleViewport();
    }else{
      leaving=false;invalid=false;outcome='';submittedKey='';lastKey='';
    }
    const signature=JSON.stringify([state.open,state.key,state.state,state.primaryLabel,state.primaryIcon,state.message,state.canSave,state.canCancel,state.canBack,root.lang]);
    if(signature!==lastSignature){lastSignature=signature;window.dispatchEvent(new CustomEvent('wf-settings-actions-change'));}
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(sync);}}
  function edited(){invalid=false;leaving=false;outcome='';submittedKey='';schedule();}
  dialog.addEventListener('input',edited);
  dialog.addEventListener('change',edited);
  dialog.addEventListener('invalid',()=>{invalid=true;submittedKey='';schedule();},true);
  dialog.addEventListener('click',event=>{
    if(forwarding)return;
    const target=event.target.closest('button');
    const close=dialog.querySelector(':scope > header button');
    const switchingCategory=target?.matches?.('.wf-category-edit,.wf-category-new')&&
      current()?.key?.startsWith('product-categories:')&&(getState().dirty||getState().busy);
    if(switchingCategory||target&&(target===close||target.id==='wfCompanySectionBack'||target.classList.contains('wf-fx-back'))){
      event.preventDefault();event.stopImmediatePropagation();requestBack();
    }else if(!nav.contains(event.target))schedule();
  },true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();requestBack();},true);
  dialog.addEventListener('close',schedule);
  new MutationObserver(records=>{
    if(records.some(record=>!nav.contains(record.target)))schedule();
  }).observe(dialog,{subtree:true,childList:true,attributes:true,
    attributeFilter:['open','hidden','disabled','inert','style','class','aria-busy','data-view','data-state','data-company-section']});
  new MutationObserver(schedule).observe(page,{attributes:true,attributeFilter:['class']});
  new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['lang','dir']});
  window.addEventListener('wf-settings-actions-change',schedule);
  window.addEventListener('resize',scheduleViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',scheduleViewport,{passive:true});
  window.WFSettingsActions={getState,canRun,run,requestBack};
  const originalBack=window.goBack;
  if(typeof originalBack==='function')window.goBack=function(...args){
    if(dialog.open&&page.classList.contains('active'))return requestBack();
    return originalBack.apply(this,args);
  };
  dialog.classList.add('wf-settings-actions-ready');
  document.addEventListener('DOMContentLoaded',()=>window.WFAppUpdates?.registerGuard?.('settings-actions',()=>{
    const state=getState();return state.open&&(state.dirty||state.busy);
  }));
  sync();
})();
