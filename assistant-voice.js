/* Opt-in browser voice controller: single-turn dispatch, no audio retention, no echo loop. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.WOWAssistantVoice=factory;})(typeof globalThis!=='undefined'?globalThis:this,function(env){
  'use strict';
  env=env||{};
  const timer=env.setTimeout||setTimeout,clear=env.clearTimeout||clearTimeout;
  let enabled=false,listening=false,speaking=false,processing=false,rec=null,epoch=0,speechEpoch=0,locale='ar',silence=null,restart=null,watchdog=null,retries=0;
  let finalText='',partialText='',pending=false;
  const language=l=>({ar:'ar-SA',tr:'tr-TR',en:'en-US'}[l]||'ar-SA');
  const state=()=>({enabled,listening,speaking,processing});
  const emit=()=>env.onState?.(state());
  function pause(){epoch++;clear(silence);clear(restart);silence=restart=null;const old=rec;rec=null;listening=false;try{old?.abort();}catch{}emit();}
  function schedule(){clear(restart);if(enabled&&!processing&&!speaking&&!pending&&!rec)restart=timer(begin,350);}
  function flush(){if(!finalText.trim())return;const value=finalText.trim();finalText=partialText='';pending=true;pause();env.onText?.(value,true);}
  function begin(){
    if(!enabled||processing||speaking||pending||rec)return;
    const Recognition=env.Recognition;
    if(!Recognition){enabled=false;emit();env.onError?.('voiceUnavailable');return;}
    const token=++epoch;let r;try{r=new Recognition();}catch{enabled=false;emit();env.onError?.('voiceUnavailable');return;}
    rec=r;finalText=partialText='';r.lang=language(locale);r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
    r.onstart=()=>{if(token!==epoch)return;listening=true;emit();};
    r.onresult=e=>{
      if(token!==epoch||!enabled||speaking||processing)return;
      retries=0;const finals=[],interims=[];
      for(let i=0;i<e.results.length;i++){const row=e.results[i];(row.isFinal?finals:interims).push(row[0]?.transcript||'');}
      finalText=finals.join(' ').trim();partialText=interims.join(' ').trim();env.onText?.([finalText,partialText].filter(Boolean).join(' '),false);
      clear(silence);if(finalText&&!partialText)silence=timer(flush,1100);
    };
    r.onerror=e=>{
      if(token!==epoch)return;
      const permission=['not-allowed','service-not-allowed','audio-capture'].includes(e.error);
      if(permission||++retries>=3){enabled=false;pause();env.onError?.(permission?'voice_permission':'voiceError');}
      else if(!['no-speech','aborted'].includes(e.error))env.onError?.('voiceError');
    };
    r.onend=()=>{if(token!==epoch)return;rec=null;listening=false;emit();if(finalText)flush();else schedule();};
    try{r.start();}catch{rec=null;enabled=false;emit();env.onError?.('voiceError');}
  }
  function start(l){locale=l||locale;enabled=true;pending=false;retries=0;stopSpeaking(false);begin();}
  function stop(){enabled=false;pending=false;finalText=partialText='';pause();}
  function stopSpeaking(resume=true){speechEpoch++;clear(watchdog);speaking=false;try{env.synthesis?.cancel();}catch{}emit();if(resume)schedule();}
  function speak(text,l){
    if(!env.synthesis||!env.Utterance||!String(text||'').trim())return false;
    locale=l||locale;pause();stopSpeaking(false);speaking=true;emit();const token=++speechEpoch;
    const parts=String(text).slice(0,2200).match(/[^.!؟?\n]{1,220}(?:[.!؟?\n]+|$)|[^.!؟?\n]{1,220}/g)||[String(text).slice(0,220)];let index=0;
    const done=()=>{if(token!==speechEpoch)return;clear(watchdog);speaking=false;emit();schedule();};
    const next=()=>{
      if(token!==speechEpoch)return;if(index>=parts.length){done();return;}
      const u=new env.Utterance(parts[index++].trim());u.lang=language(locale);u.rate=1;const voice=env.synthesis.getVoices?.().find(v=>v.lang.toLowerCase().startsWith(locale));if(voice)u.voice=voice;
      u.onend=next;u.onerror=done;try{env.synthesis.speak(u);}catch{done();}
    };
    watchdog=timer(()=>{if(token===speechEpoch)stopSpeaking();},60000);next();return true;
  }
  function setProcessing(value){processing=!!value;if(value){pending=false;pause();}else{pending=false;schedule();}emit();}
  function setLocale(l){locale=l;if(enabled){pause();schedule();}}
  return{start,stop,speak,stopSpeaking,setProcessing,setLocale,state};
});
