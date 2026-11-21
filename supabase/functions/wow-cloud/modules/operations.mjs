const fail=(code,status=422)=>{throw Object.assign(new Error(code),{code,status});};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function createOperationsActions({moduleRpc,configuration={}}){
 const actions={};
 for(const action of ['operations.snapshot','operations.check','operations.configure','operations.acknowledge'])actions[action]=async({body,actor})=>{
  let payload={};
  if(action==='operations.configure'){
   if(typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.revision)||body.revision<1)fail('INVALID_OPERATION_SETTING');
   payload={enabled:body.enabled,revision:body.revision};
  }
  if(action==='operations.acknowledge'){
   if(!uuid(body.incidentId))fail('INVALID_INCIDENT');payload={incidentId:body.incidentId};
  }
  const data=await moduleRpc('wow_operations_service',action,{...payload,userId:actor.userId,sessionId:actor.sessionId});
  return {...data,deployment:{name:'مارك ربوت',company:'WOW FURNITURE',
   origin:'https://markrobot.wowfurniture.com.tr',contactEmail:'info@wowfurniture.com.tr',
   planVerified:configuration.planVerified===true,databaseBackupVerified:configuration.databaseBackupVerified===true,
   objectBackupVerified:configuration.objectBackupVerified===true,emailVerified:configuration.emailVerified===true,
   externalMonitorVerified:configuration.externalMonitorVerified===true,aiConfigured:configuration.aiConfigured===true}};
 };
 return actions;
}
