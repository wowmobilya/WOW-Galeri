import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {webcrypto,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {projectDelta} from '../supabase/functions/wow-cloud/modules/delta.mjs';
import {createFilesActions,describeUpload} from '../supabase/functions/wow-cloud/modules/files.mjs';
const require=createRequire(import.meta.url),F=require('../modules/files/core.js'),C=require('../modules/chat/core.js'),D=require('../modules/platform/delta.js');
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});

test('projection changes reconcile deletions, order and private metadata against the exact baseline',async()=>{
  const before={messages:[{id:'8',text:'first'},{id:'9',text:'expire'}],prefs:{muted:false},typing:[]},initial=await projectDelta(before,'messages');
  assert.equal(D.applyDelta(initial,await projectDelta(before,'messages',initial._deltaState)),initial);
  const after={messages:[{id:'10',text:'new'},{id:'8',text:'changed'}],prefs:{muted:true},typing:[]};
  const patch=await projectDelta(after,'messages',initial._deltaState);
  assert.deepEqual(patch._delta.removed,['9']);assert.deepEqual(patch._delta.order,['10','8']);assert(!JSON.stringify(patch).includes('expire'));
  assert.deepEqual(D.applyDelta(initial,patch),await projectDelta(after,'messages'));
  assert.throws(()=>D.applyDelta(null,patch),/STALE_DELTA/);
  await assert.rejects(projectDelta(before,'messages',{...initial._deltaState,rows:{bad:'x'}}),/INVALID_DELTA/);
  const extra=Object.fromEntries(Array.from({length:501},(_,i)=>[String(i+1),'a'.repeat(64)]));
  await assert.rejects(projectDelta(before,'messages',{...initial._deltaState,rows:extra}),/INVALID_DELTA/);
});

test('ZIP has unique UTF-8 file names, a valid checksum, STORE / native DEFLATE and fails closed on a missing file',async()=>{
  for(const compress of [true,false]){
    const raw=new TextEncoder().encode('مصباح '.repeat(150)),b=await F.zip([{name:'../ملف.txt',blob:new Blob([raw])},{name:'ملف.txt',blob:new Blob(['B'])}],{compress});
    const buffer=Buffer.from(await b.arrayBuffer());assert.equal(buffer.readUInt32LE(0),0x04034b50);assert.equal(buffer.readUInt16LE(6),0x800);
    const n=buffer.readUInt16LE(26),bytes=buffer.readUInt32LE(18),piece=buffer.subarray(30+n,30+n+bytes);
    assert.deepEqual(Buffer.from(buffer.readUInt16LE(8)===8?inflateRawSync(piece):piece),Buffer.from(raw));assert.equal(buffer.readUInt32LE(14),F.crc32(raw));
    assert.equal(buffer.subarray(30,30+n).toString(),'ملف.txt');assert(buffer.includes(Buffer.from('ملف (2).txt')));
    assert.equal(buffer.readUInt16LE(buffer.length-12),2);assert.equal(buffer.readUInt32LE(buffer.length-22),0x06054b50);
  }
  await assert.rejects(F.zip([{name:'ok.txt',blob:new Blob(['ok'])},{name:'failed',load:async()=>{throw Error('DOWNLOAD_FAILED');}}]),/DOWNLOAD_FAILED/);
});

test('chat highlights literal characters, allows only web links, orders bigint cursors and picks a supported voice container',()=>{
  assert.deepEqual(C.parts('a.b+b','.'),[{value:'a',match:false},{value:'.',match:true},{value:'b+b',match:false}]);
  assert.deepEqual(C.links('javascript:alert(9) https://example.org/a. https://user:pass@example.org'),['https://example.org/a']);
  assert(C.after('180000000000000000','179999999999999999'));assert(!C.validRoom('../..'));
  assert.equal(C.recorderType({isTypeSupported:t=>t==='audio/mp4'}),'audio/mp4');
});

test('server rejects misleading image bytes and caller paths, and sends only verified actor and bounded values to SQL',async()=>{
  const a={userId:randomUUID(),sessionId:randomUUID()},input={fileId:randomUUID(),userId:randomUUID(),sessionId:randomUUID(),workspaceId:randomUUID(),storagePath:'outside'};
  const calls=[],api=createFilesActions({moduleRpc:async(fn,action,data)=>{calls.push({fn,action,data});return {path:'wrong',ttl:60};},storage:{sign:()=>assert.fail('No unverified path should be signed')}});
  await assert.rejects(api['files.open']({actor:a,body:input}),/INVALID_RESPONSE/);assert.deepEqual(calls[0].data,{fileId:input.fileId,download:false,...a});
  assert.throws(()=>describeUpload(new TextEncoder().encode('<html>'), 'photo.jpg','image/jpeg'),/INVALID_MEDIA/);
  assert.throws(()=>describeUpload(Uint8Array.of(137,80,78,71,13,10,26,10),'a.png','image/png'),/INVALID_MEDIA/);
  await assert.rejects(api['files.upload']({actor:a,body:{name:'../other',mime:'text/plain',requestId:randomUUID(),data:'QQ=='}}),/INVALID_REQUEST/);
  assert(!Object.hasOwn(api,'files.gc'));assert(!Object.hasOwn(api,'files.reserve'));assert(!Object.hasOwn(api,'files.finish'));
});
