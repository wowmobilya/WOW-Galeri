'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('../modules/server/core.js');
test('the dashboard does not turn old or missing evidence into a healthy service',()=>{
 const now=Date.now(),base={settings:{enabled:true,lastTickAt:new Date(now).toISOString(),lastResult:{status:'healthy'}},scheduler:true,incidents:[]};
 assert.equal(core.status(null,now),'unknown');assert.equal(core.status(base,now),'healthy');
 assert.equal(core.status(base,now+16*60*1000),'stale');
 assert.equal(core.status({...base,scheduler:false},now),'stale');
 assert.equal(core.status({...base,settings:{...base.settings,enabled:false}},now),'disabled');
 assert.equal(core.status({...base,incidents:[{active:true,severity:'critical'}]},now),'critical');
 assert.equal(core.status({...base,incidents:[{active:true,severity:'info'}]},now),'attention');
});
test('operational metrics count queue states without coercing malformed values',()=>{
 assert.deepEqual(core.metrics({queue:{pending:2,leased:3,sent:9,failed:'2'},runs:[{recovered_leases:4}]}),{waiting:5,sent:9,failed:0,recovered:4});
});
test('storage maintenance is healthy only with configured scheduling and a recent observed scan',()=>{
 const now=Date.now(),base={settings:{enabled:true},storageMaintenance:{configured:true,scheduler:true,lastScanAt:new Date(now).toISOString(),retrying:0}};
 assert.equal(core.storageStatus(null,now),'unknown');assert.equal(core.storageStatus(base,now),'healthy');
 assert.equal(core.storageStatus(base,now+31*60000),'stale');
 assert.equal(core.storageStatus({...base,storageMaintenance:{...base.storageMaintenance,configured:false}},now),'attention');
 assert.equal(core.storageStatus({...base,storageMaintenance:{...base.storageMaintenance,retrying:1}},now),'attention');
 assert.equal(core.storageStatus({...base,settings:{enabled:false}},now),'disabled');
});
