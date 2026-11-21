(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.WFServerCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function status(snapshot,now=Date.now()){
  if(!snapshot?.settings)return 'unknown';
  if(snapshot.settings.enabled===false)return 'disabled';
  const stamp=Date.parse(snapshot.settings.lastTickAt||'');
  if(!Number.isFinite(stamp)||now-stamp>15*60*1000||stamp-now>5*60*1000||snapshot.scheduler!==true)return 'stale';
  if(snapshot.settings.lastResult?.status==='failed')return 'failed';
  if((snapshot.incidents||[]).some(i=>i.active&&i.severity==='critical'))return 'critical';
  if((snapshot.incidents||[]).some(i=>i.active))return 'attention';
  return 'healthy';
 }
 function metrics(snapshot){
  const q=snapshot?.queue||{},count=key=>Number.isSafeInteger(q[key])&&q[key]>=0?q[key]:0;
  return {waiting:count('pending')+count('leased'),sent:count('sent'),failed:count('failed'),
   recovered:(snapshot?.runs||[]).reduce((n,r)=>n+(Number.isSafeInteger(r.recovered_leases)?r.recovered_leases:0),0)};
 }
 function storageStatus(snapshot,now=Date.now()){
  if(snapshot?.settings?.enabled===false)return 'disabled';
  const value=snapshot?.storageMaintenance;if(!value)return 'unknown';
  if(value.configured!==true||value.scheduler!==true)return 'attention';
  const stamp=Date.parse(value.lastScanAt||'');
  if(!Number.isFinite(stamp)||now-stamp>30*60*1000||stamp-now>5*60*1000)return 'stale';
  return value.retrying>0?'attention':'healthy';
 }
 return Object.freeze({status,metrics,storageStatus});
});
