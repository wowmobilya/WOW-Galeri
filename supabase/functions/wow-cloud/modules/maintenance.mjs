import {isStorageCleanupPath} from '../rest.mjs';

const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const unavailable=()=>new Error('STORAGE_MAINTENANCE_DEFERRED');

// Called only after the private worker has authenticated and drained push.
// A stopped process leaves a timed lease. The next worker can repeat the same
// exact removal, including after the provider succeeded and the SQL ACK was lost.
export function createStorageMaintenance({maintenanceRpc,storage}) {
  async function processJob(job) {
    if(!uuid.test(job?.id)||!uuid.test(job?.lease))throw unavailable();
    const handle={id:job.id,lease:job.lease};
    const prepared=await maintenanceRpc('prepare',handle);
    if(prepared?.status==='gone'||prepared?.status==='paused')return;
    if(prepared?.status!=='ready'||!isStorageCleanupPath(prepared.path))throw unavailable();
    let outcome='removed';
    try{await storage.remove(prepared.path);}catch{outcome='retry';}
    const result=await maintenanceRpc('finish',{...handle,path:prepared.path,outcome});
    if(!['removed','gone','paused'].includes(result?.status))throw unavailable();
  }
  return async()=>{
    const {jobs}=await maintenanceRpc('claim',{});
    if(!Array.isArray(jobs)||jobs.length>12)throw unavailable();
    let next=0,failed=false;
    await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
      while(next<jobs.length){
        const job=jobs[next++];
        try{await processJob(job);}catch{failed=true;}
      }
    }));
    if(failed)throw unavailable();
  };
}
