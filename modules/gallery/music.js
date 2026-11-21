/* Original, optional gallery ambience. Playback always belongs to one visible session. */
(function(root){
  'use strict';
  const doc=root.document;
  if(!doc||root.WFGalleryMusic)return;
  const preferenceStore='wf.gallery.music.v1',maxEntries=8,maxPreferenceBytes=12288,defaultVolume=.18;
  const words={
    ar:{title:'موسيقى المعرض',play:'تشغيل الموسيقى',pause:'إيقاف الموسيقى',volume:'مستوى الصوت',paused:'الموسيقى متوقفة.',ready:'اختيارك محفوظ. اضغط تشغيل لبدء الموسيقى.',loading:'جارٍ تحميل الموسيقى…',playing:'الموسيقى تعمل.',speech:'توقفت الموسيقى أثناء القراءة الصوتية.',blocked:'منع المتصفح تشغيل الصوت. اضغط تشغيل للمحاولة مجددًا.',error:'الموسيقى غير متاحة الآن. اتصل بالإنترنت مرة واحدة لحفظ المقطع، ثم أعد المحاولة.',inactive:'توقفت الموسيقى بعد تغيّر جلسة الدخول.'},
    tr:{title:'Galeri müziği',play:'Müziği başlat',pause:'Müziği durdur',volume:'Ses düzeyi',paused:'Müzik duraklatıldı.',ready:'Tercihiniz kaydedildi. Başlatmak için oynat düğmesine basın.',loading:'Müzik yükleniyor…',playing:'Müzik çalıyor.',speech:'Sesli okuma sırasında müzik duraklatıldı.',blocked:'Tarayıcı sesi engelledi. Tekrar denemek için oynat düğmesine basın.',error:'Müzik şu anda kullanılamıyor. Parçayı kaydetmek için bir kez internete bağlanıp yeniden deneyin.',inactive:'Oturum değiştiği için müzik durduruldu.'},
    en:{title:'Gallery music',play:'Play music',pause:'Pause music',volume:'Volume',paused:'Music is paused.',ready:'Your preference is saved. Press Play to start music.',loading:'Loading music…',playing:'Music is playing.',speech:'Music is paused during speech.',blocked:'The browser blocked audio. Press Play to try again.',error:'Music is unavailable. Connect once to save the track, then try again.',inactive:'Music stopped because the signed-in session changed.'},
    fr:{title:'Musique de la galerie',play:'Lancer la musique',pause:'Mettre en pause',volume:'Volume',paused:'La musique est en pause.',ready:'Votre préférence est enregistrée. Appuyez sur Lecture pour démarrer.',loading:'Chargement de la musique…',playing:'La musique est en cours.',speech:'La musique est en pause pendant la lecture vocale.',blocked:'Le navigateur a bloqué le son. Appuyez sur Lecture pour réessayer.',error:'La musique est indisponible. Connectez-vous une fois pour enregistrer le morceau, puis réessayez.',inactive:'La musique a été arrêtée car la session a changé.'},
    ru:{title:'Музыка галереи',play:'Включить музыку',pause:'Приостановить музыку',volume:'Громкость',paused:'Музыка приостановлена.',ready:'Ваш выбор сохранён. Нажмите «Включить», чтобы начать.',loading:'Загрузка музыки…',playing:'Музыка играет.',speech:'Музыка приостановлена во время озвучивания.',blocked:'Браузер заблокировал звук. Нажмите «Включить», чтобы повторить.',error:'Музыка недоступна. Подключитесь к интернету для сохранения записи и повторите попытку.',inactive:'Музыка остановлена из-за смены сеанса.'}
  };
  let asset='';
  try{
    const base=doc.baseURI||root.location.href;
    const script=doc.currentScript?.src||new URL('modules/gallery/music.js',base).href;
    const url=new URL('../../assets/gallery/wow-ambient-v1.mp3',script);
    if(url.origin===new URL(base).origin&&['https:','http:'].includes(url.protocol))asset=url.href;
  }catch{/* An invalid base never falls back to a remote recording. */}
  function endpoint(){
    try{
      const raw=root.WFCloud?.getConfig?.().endpoint;
      if(typeof raw!=='string'||raw.length>512)return '';
      const url=new URL(raw);
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
      const normalized=url.origin+url.pathname.replace(/\/+$/,'');
      return normalized.length<=512?normalized:'';
    }catch{return '';}
  }
  function identity(api,permission){
    try{
      const state=api.getSession(),account=state?.currentAccount,server=endpoint();
      if(!server||!(state.authenticated||state.offlineVerified)||!account||!api.can(permission)||
        typeof state.workspaceId!=='string'||!state.workspaceId||state.workspaceId.length>128||
        typeof state.userId!=='string'||!state.userId||state.userId.length>128||account.id!==state.userId||
        account.status&&account.status!=='active')return null;
      if(account.expiresAt&&!(Date.parse(account.expiresAt)>Date.now()))return null;
      const key=JSON.stringify([server,state.workspaceId,state.userId]);
      if(key.length>1024)return null;
      const runtime=JSON.stringify([key,state.mode||'',state.sessionVersion||0,state.authGeneration||0,account.role||'',account.sessionVersion||0,account.expiresAt||'']);
      return {key,runtime};
    }catch{return null;}
  }
  function entries(){
    try{
      const raw=root.localStorage.getItem(preferenceStore);
      if(!raw||raw.length>maxPreferenceBytes||new TextEncoder().encode(raw).byteLength>maxPreferenceBytes)return [];
      const value=JSON.parse(raw);
      if(value?.version!==1||!Array.isArray(value.entries))return [];
      return value.entries.filter(row=>row&&typeof row.key==='string'&&row.key.length>0&&row.key.length<=1024&&
        typeof row.volume==='number'&&Number.isFinite(row.volume)&&row.volume>=0&&row.volume<=1&&typeof row.enabled==='boolean')
        .slice(-maxEntries).map(({key,volume,enabled})=>({key,volume,enabled}));
    }catch{return [];}
  }
  function mount({container,api,lang='ar',permission='gallery.view'}){
    const initial=identity(api,permission),saved=initial&&entries().find(row=>row.key===initial.key);
    let language=words[lang]?lang:'en',preference={volume:saved?.volume??defaultVolume,enabled:saved?.enabled===true},
      disposed=false,retired=!initial,wanted=false,pending=false,generation=0,phase=preference.enabled?'ready':'paused',speech=false;
    const listeners=[],mediaListeners=[];
    const hasClass=(node,name)=>typeof node?.className==='string'&&node.className.split(/\s+/).includes(name);
    let owningPage=container;
    while(owningPage&&!hasClass(owningPage,'page'))owningPage=owningPage.parentElement;
    const el=(tag,cls)=>{const node=doc.createElement(tag);if(cls)node.className=cls;return node;};
    const panel=el('section','wfg-music'),title=el('strong','wfg-music-title'),controls=el('div','wfg-music-controls'),
      button=el('button','btn wfg-button'),label=el('label','wfg-music-volume'),caption=el('span'),
      volume=el('input'),amount=el('output'),status=el('p','wfg-music-status'),audio=el('audio');
    panel.setAttribute('role','group');button.type='button';volume.type='range';volume.min='0';volume.max='100';volume.step='1';
    audio.preload='none';audio.autoplay=false;audio.loop=false;audio.volume=preference.volume;audio.hidden=true;audio.setAttribute('aria-hidden','true');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    label.append(caption,volume,amount);controls.append(button,label);panel.append(title,controls,status,audio);container.prepend(panel);
    function listen(target,event,handler,options,media=false){
      target.addEventListener(event,handler,options);(media?mediaListeners:listeners).push(()=>target.removeEventListener(event,handler,options));
    }
    const clear=list=>{for(const off of list.splice(0))off();};
    const valid=()=>!disposed&&!retired&&!!initial&&identity(api,permission)?.runtime===initial.runtime;
    const hidden=()=>doc.hidden===true||doc.visibilityState==='hidden'||!!owningPage&&
      (!hasClass(owningPage,'active')||owningPage.hidden===true||owningPage.getAttribute('aria-hidden')==='true');
    function speaking(){
      try{const live=root.WFProgramSpeech?.getState?.();if(typeof live?.active==='boolean')return live.active;}catch{}
      return speech;
    }
    function remember(patch){
      if(!valid())return;
      preference={...preference,...patch};
      const next=[...entries().filter(row=>row.key!==initial.key),{key:initial.key,...preference}].slice(-maxEntries);
      let value=JSON.stringify({version:1,entries:next});
      // Evict older preferences first, including when UTF-8 identifiers use multiple bytes.
      while(next.length>1&&new TextEncoder().encode(value).byteLength>maxPreferenceBytes){next.shift();value=JSON.stringify({version:1,entries:next});}
      if(new TextEncoder().encode(value).byteLength>maxPreferenceBytes)return;
      try{root.localStorage.setItem(preferenceStore,value);}catch{/* Current-tab controls still work when storage is unavailable. */}
    }
    function render(){
      if(disposed)return;
      const t=words[language],active=valid(),busySpeech=speaking();
      panel.setAttribute('dir',language==='ar'?'rtl':'ltr');panel.setAttribute('lang',language);panel.setAttribute('aria-label',t.title);
      title.textContent=t.title;button.textContent=wanted?t.pause:t.play;button.setAttribute('aria-label',button.textContent);
      button.setAttribute('aria-pressed',String(phase==='playing'&&wanted));button.setAttribute('aria-busy',String(pending&&wanted));
      button.disabled=!active||hidden()||busySpeech||pending&&!wanted;
      button.className='btn wfg-button'+(phase==='playing'&&wanted?' wfg-active':'');
      caption.textContent=t.volume;volume.setAttribute('aria-label',t.title+' · '+t.volume);volume.value=String(Math.round(preference.volume*100));
      volume.disabled=!active;amount.textContent=volume.value+'%';volume.setAttribute('aria-valuetext',amount.textContent);
      status.textContent=t[!active?'inactive':busySpeech?'speech':phase]||t.paused;panel.dataset.state=!active?'inactive':busySpeech?'speech':phase;
    }
    function silence(unload=false){
      audio.loop=false;try{audio.pause();}catch{}
      if(unload){audio.removeAttribute('src');try{audio.load();}catch{}}
    }
    function stop(reason='paused',manual=false,unload=false){
      wanted=false;++generation;phase=reason;
      silence(unload||pending);
      if(manual)remember({enabled:false});
      render();
    }
    function eligible(){
      if(!valid()){retired=true;stop('inactive',false,true);return false;}
      if(hidden()){stop();return false;}
      if(speaking()){stop('speech');return false;}
      return true;
    }
    function playing(){
      if(!wanted||!eligible()){silence(pending||disposed||retired);return;}
      if(audio.paused)return;
      phase='playing';if(!preference.enabled)remember({enabled:true});render();
    }
    async function toggle(event){
      if(event.isTrusted!==true||disposed)return;
      if(wanted){stop('paused',true);return;}
      if(pending||!eligible())return;
      if(!asset){stop('error');return;}
      const run=++generation;wanted=true;pending=true;phase='loading';audio.loop=true;audio.volume=preference.volume;
      if(!audio.src)audio.src=asset;
      render();
      try{
        // Keep play() on the trusted click stack; do not await storage, networking or a timer first.
        const result=audio.play();await result;
        if(run!==generation||!wanted||!eligible()){silence(disposed||retired||pending);return;}
        if(audio.paused)stop();else if(result&&typeof result.then==='function')playing();
      }catch(reason){
        if(run===generation&&wanted)stop(reason?.name==='NotAllowedError'?'blocked':'error');else silence(disposed||retired||pending);
      }finally{
        pending=false;
        if(disposed){silence(true);clear(mediaListeners);}else render();
      }
    }
    listen(button,'click',toggle);
    listen(volume,'input',event=>{
      if(event.isTrusted!==true||!valid())return;
      const next=Number(volume.value);if(!Number.isFinite(next))return;
      const value=Math.round(Math.max(0,Math.min(100,next)))/100;
      audio.volume=value;remember({volume:value});render();
    });
    listen(audio,'play',()=>{if(!wanted||!eligible())silence(pending||disposed||retired);},undefined,true);
    listen(audio,'playing',playing,undefined,true);
    listen(audio,'pause',()=>{if(wanted&&audio.paused)stop();},undefined,true);
    listen(audio,'ended',()=>stop(),undefined,true);
    listen(audio,'error',()=>{if(wanted)stop('error',false,true);},undefined,true);
    listen(audio,'waiting',()=>{if(wanted&&eligible()){phase='loading';render();}},undefined,true);
    listen(audio,'timeupdate',()=>{if(wanted)eligible();},undefined,true);
    const sessionChange=()=>{if(!valid()){retired=true;stop('inactive',false,true);}};
    for(const event of ['wf-account-access-change','wf-cloud-session-change'])listen(root,event,sessionChange);
    listen(root,'wf-cloud-local-owner-retired',()=>{retired=true;stop('inactive',false,true);});
    const speechChange=event=>{speech=typeof event?.detail?.active==='boolean'?event.detail.active:speaking();if(speaking())stop('speech');else{if(phase==='speech')phase='paused';render();}};
    listen(root,'wf-program-speech-state',speechChange);listen(root,'wf-robot-ready',speechChange);
    const visibilityChange=()=>{if(hidden())stop();else{sessionChange();render();}};
    listen(doc,'visibilitychange',visibilityChange);
    // The shell retains dirty studio forms when another route is active. They still own no audio.
    if(owningPage&&root.MutationObserver){
      const observer=new root.MutationObserver(visibilityChange);
      observer.observe(owningPage,{attributes:true,attributeFilter:['class','hidden','aria-hidden']});
      listeners.push(()=>observer.disconnect());
    }
    listen(root,'pagehide',()=>stop('paused',false,true));
    listen(doc,'play',event=>{if(event.target!==audio&&['AUDIO','VIDEO'].includes(event.target?.tagName))stop();},true);
    render();
    return Object.freeze({
      updateLanguage(next){language=words[next]?next:'en';sessionChange();render();},
      dispose(){
        if(disposed)return;disposed=true;stop('paused',false,true);clear(listeners);panel.remove();
        // A pending browser play promise keeps only its old media guards until it settles.
        // Its late `playing` event and promise continuation must both silence the retired element.
        if(!pending)clear(mediaListeners);
      }
    });
  }
  root.WFGalleryMusic=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);
