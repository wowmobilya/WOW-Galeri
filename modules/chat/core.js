(function(root){
  'use strict';
  const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  function links(text){
    const matches=String(text||'').match(/https?:\/\/[^\s<>"']+/giu)||[],result=[];
    for(const m of matches){try{const u=new URL(m.replace(/[.,;!?)\]]+$/u,''));if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)result.push(u.href);}catch{}}
    return [...new Set(result)];
  }
  function parts(text,query){
    const source=String(text||''),term=String(query||'');
    if(!term)return [{value:source,match:false}];
    const expression=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'),output=[];let start=0;
    for(const match of source.matchAll(expression)){if(match.index>start)output.push({value:source.slice(start,match.index),match:false});output.push({value:match[0],match:true});start=match.index+match[0].length;}
    if(start<source.length)output.push({value:source.slice(start),match:false});return output;
  }
  function recorderType(Recorder){return ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(x=>Recorder.isTypeSupported?.(x))||'';}
  function isTransient(error){return ['NETWORK','STORAGE_UNAVAILABLE','SERVICE_UNAVAILABLE'].includes(error?.code);}
  function after(value,other){try{return BigInt(value||0)>BigInt(other||0);}catch{return false;}}
  const core={validRoom:v=>typeof v==='string'&&uuid.test(v),links,parts,after,recorderType,isTransient,reactions:['👍','❤️','😂','😮','😢','🙏','🎉','🔥','👏','👎']};
  root.WFChatCore=core;if(typeof module!=='undefined'&&module.exports)module.exports=core;
})(globalThis);
