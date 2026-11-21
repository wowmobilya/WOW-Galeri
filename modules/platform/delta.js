(function(root){
  'use strict';
  function applyDelta(previous,response){
    if(!response?._delta)return response;
    const d=response._delta;
    if(!['rooms','messages','files'].includes(d.field)||previous?._deltaState?.revision!==d.base)throw Error('STALE_DELTA');
    if(d.unchanged)return previous;
    const rows=new Map(previous[d.field].map(row=>[String(row.id),row]));for(const key of d.removed)rows.delete(key);
    for(const row of d.upsert)rows.set(String(row.id),row);
    const order=d.order||previous[d.field].map(row=>String(row.id));const page=order.map(id=>rows.get(id));
    if(page.some(row=>!row)||page.length!==rows.size)throw Error('STALE_DELTA');
    return {...previous,...d.meta,[d.field]:page,_deltaState:response._deltaState};
  }
  const api=Object.freeze({applyDelta});root.WFModuleDelta=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
