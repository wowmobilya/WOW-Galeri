/* Optional male speech: worker inference, cancelable playback and fixed model selection. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WOWAssistantNeural=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function create(env,callbacks={}){
  let active=null,nextId=0,reusableWorker=null;
  function cleanAudio(job){if(job.audio){job.audio.onended=job.audio.onerror=null;try{job.audio.pause();job.audio.removeAttribute('src');job.audio.load();}catch(_){}job.audio=null;}if(job.url){env.revokeURL(job.url);job.url=null;}}
  function finish(job,ok,error){if(active!==job)return;active=null;clearTimeout(job.timer);cleanAudio(job);if(!ok||error){job.worker?.terminate();if(reusableWorker===job.worker)reusableWorker=null;}callbacks.change?.(false);job.resolve(ok);if(error)callbacks.error?.(error);}
  function cancel(){if(active)finish(active,false);}
  function run(value,lang,prepare){
   cancel();return new Promise(resolve=>{
    const parts=String(value||'').slice(0,2400).match(/.{1,180}(?:\s|$)|\S{1,180}/gu)||[];
    if(!prepare&&!parts.length){resolve(false);return;}
    const job={started:Date.now(),id:++nextId,resolve,parts,index:0,worker:null,audio:null,url:null,timer:null};active=job;callbacks.change?.(true);
    const arm=()=>{clearTimeout(job.timer);job.timer=setTimeout(()=>finish(job,false,'voice_timeout'),Math.max(1,Math.min(180000,900000-(Date.now()-job.started))));};
    try{
     job.worker=reusableWorker||(reusableWorker=env.createWorker());job.worker.onerror=()=>finish(job,false,'voice_unavailable');
     job.worker.onmessage=event=>{
      const data=event.data;if(active!==job||data?.id!==job.id)return;
      if(data.type==='progress'||data.type==='loading'){arm();callbacks.progress?.(data);return;}
      if(data.type==='error'){finish(job,false,data.error);return;}
      if(data.type==='ready'){callbacks.progress?.(data);finish(job,true);return;}
      if(data.type!=='audio'||prepare)return;
      try{job.url=env.createURL(new Blob([data.buffer],{type:'audio/wav'}));job.audio=env.getAudio?.()||new env.Audio();job.audio.src=job.url;job.audio.playbackRate=.98;
       job.audio.onended=()=>{if(active!==job)return;cleanAudio(job);if(++job.index<parts.length){arm();job.worker.postMessage({id:job.id,type:'speak',lang,text:parts[job.index]});}else finish(job,true);};
       job.audio.onerror=()=>finish(job,false,'voice_playback_failed');Promise.resolve(job.audio.play()).catch(()=>finish(job,false,'voice_playback_failed'));
      }catch(_){finish(job,false,'voice_playback_failed');}
     };
     arm();job.worker.postMessage({id:job.id,type:prepare?'prepare':'speak',lang,text:parts[0]||''});
    }catch(_){finish(job,false,'voice_unavailable');}
   });
  }
  function dispose(){cancel();reusableWorker?.terminate();reusableWorker=null;}
  return {dispose,speak:(text,lang)=>run(text,lang,false),prepare:lang=>run('',lang,true),cancel,get busy(){return !!active;}};
 }
 return {create};
});
