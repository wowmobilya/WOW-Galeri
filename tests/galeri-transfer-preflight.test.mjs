import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectExport,familyTargets,projectRef,main} from '../scripts/galeri-transfer-preflight.mjs';
const workspace='11111111-1111-4111-8111-111111111111',account='22222222-2222-4222-8222-222222222222';
function fixture(){
 const tables=Object.fromEntries(Object.keys(familyTargets).map(name=>[name,[]]));
 tables.users=[{id:1,username:'buyer',password_hash:'NEVER-OUTPUT-THIS'}];
 tables.inventory=[{id:1},{id:'1'}];
 tables.orders=[{id:3,username:'buyer',order_number:'one',status:'delivered',items:[{id:1,qty:2}]}];
 tables.user_orders_inventory=[{id:4,username:'buyer',order_number:'one',order_status:'delivered',product_id:1,qty_purchased:2,qty_sold:1}];
 tables.user_sales_log=[{id:5,inventory_id:4,qty_sold:1}];
 tables.group_rooms=[{id:9}];tables.group_messages=[{id:10,room_id:9,reply_to_id:null}];
 tables.user_files=[{id:11,file_path:'images/a.png',file_size:12,mime_type:'image/png'}];
 const source={projectRef,tables,counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),
  objects:[{bucket:'user-files',path:'images/a.png',sha256:'a'.repeat(64),bytes:12,mime:'image/png'}]};
 const mapping={workspaceId:workspace,targetAccounts:[{id:account,workspaceId:workspace,role:'customer'}],accounts:[{family:'users',sourceId:1,targetId:account,targetRole:'customer'}],
  targetProducts:[100,'100'],products:[{sourceId:1,targetId:100},{sourceId:'1',targetId:'100'}],fileOwners:[{sourceId:11,targetId:account}]};
 return {source,mapping};
}
test('inventory is deterministic, preserves typed IDs and never declares native application ready',()=>{
 const {source,mapping}=fixture(),a=inspectExport(source,mapping),b=inspectExport(source,mapping);
 assert.deepEqual(a,b);assert.equal(a.applyReady,false);assert.equal(a.mode,'read-only');assert.equal(a.objects.contentVerified,false);
 assert.deepEqual(a.issues,[]);assert.equal(a.records.filter(r=>r.family==='inventory').length,2);
 assert.equal(a.omittedCredentialFields,1);assert(!JSON.stringify(a).includes('NEVER-OUTPUT-THIS'));
 source.tables.users[0].password_hash='DIFFERENT-SECRET';assert.equal(inspectExport(source,mapping).manifestSha256,a.manifestSha256);
});
test('missing family and source count differ from a verified empty export; credential tables stay excluded',()=>{
 const {source,mapping}=fixture();delete source.tables.hero_slider;source.counts.orders=99;
 source.tables.otp_codes=[{id:1,code:'DONT-PRINT'}];source.tables.user_sessions=[{token:'DONT-PRINT'}];
 const result=inspectExport(source,mapping);
 assert(result.issues.some(i=>i.code==='FAMILY_EXPORT_MISSING'&&i.family==='hero_slider'));
 assert(result.issues.some(i=>i.code==='SOURCE_COUNT_MISMATCH'&&i.family==='orders'));
 assert.equal(result.records.some(r=>r.family==='otp_codes'),false);assert(!JSON.stringify(result).includes('DONT-PRINT'));
});
test('roles and target identities are explicit and unowned files are never assigned to the operator',()=>{
 const {source,mapping}=fixture();mapping.fileOwners=[];mapping.accounts=[];
 let result=inspectExport(source,mapping);
 assert(result.issues.some(i=>i.code==='EXPLICIT_FILE_OWNER_REQUIRED'));
 assert(result.issues.some(i=>i.code==='ACCOUNT_MAPPING_REQUIRED'));
 mapping.accounts=[{family:'users',sourceId:1,targetId:account,targetRole:'owner'}];
 assert.throws(()=>inspectExport(source,mapping),/TARGET_ROLE_MISMATCH/);
 mapping.accounts=[];mapping.targetAccounts[0].workspaceId='33333333-3333-4333-8333-333333333333';
 assert.throws(()=>inspectExport(source,mapping),/INVALID_TARGET_ACCOUNT/);
});
test('split source writes cannot hide order, holding, resale or reply mismatches',()=>{
 const {source,mapping}=fixture();source.tables.orders[0].items[0].qty=3;source.tables.user_sales_log[0].qty_sold=2;
 source.tables.group_messages[0].reply_to_id=999;
 source.tables.message_stars=[{scope:'legacy',message_id:10,username:'buyer'}];source.counts.message_stars=1;
 const codes=new Set(inspectExport(source,mapping).issues.map(i=>i.code));
 for(const code of ['HOLDING_ORDER_MISMATCH','SALE_HOLDING_MISMATCH','UNRESOLVED_REFERENCE','LEGACY_CHAT_SCOPE_REVIEW'])assert(codes.has(code),code);
});
test('unknown families, duplicate IDs and mismatched object inventory stay visible',()=>{
 const {source,mapping}=fixture();source.tables.some_future_table=[{id:1}];source.tables.group_messages.push({...source.tables.group_messages[0]});
 source.objects[0].bytes=13;delete source.objects[0].sha256;
 const codes=new Set(inspectExport(source,mapping).issues.map(i=>i.code));
 for(const code of ['UNRECOGNIZED_FAMILY','DUPLICATE_ID','FILE_OBJECT_MISMATCH','OBJECT_BYTES_EVIDENCE_REQUIRED'])assert(codes.has(code),code);
 source.objects[0].path='../private';assert.throws(()=>inspectExport(source,mapping),/INVALID_STORAGE_INVENTORY/);
 assert.throws(()=>inspectExport({...source,projectRef:'wrong'},mapping),/INVALID_SOURCE_PROJECT/);
});
test('CLI writes a private create-only report, keeps inputs intact and rejects a repository path through a symlink',async(t)=>{
 const dir=await mkdtemp(path.join(tmpdir(),'galeri-preflight-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {source,mapping}=fixture(),exportPath=path.join(dir,'export.json'),mapPath=path.join(dir,'map.json'),report=path.join(dir,'report.json');
 await writeFile(exportPath,JSON.stringify(source));await writeFile(mapPath,JSON.stringify(mapping));
 const before=await readFile(exportPath,'utf8'),result=await main([exportPath,mapPath,report]);
 assert.equal(result.applyReady,false);assert.equal(await readFile(exportPath,'utf8'),before);assert.equal((await stat(report)).mode&0o777,0o600);
 assert(!JSON.stringify(result).includes('buyer'));await assert.rejects(()=>main([exportPath,mapPath,report]),/EEXIST/);
 await assert.rejects(()=>main([exportPath,mapPath,exportPath]),/OUTPUT_OVERWRITES_INPUT/);
 const root=path.resolve(new URL('..',import.meta.url).pathname);await symlink(root,path.join(dir,'repo-link'));
 await assert.rejects(()=>main([exportPath,mapPath,path.join(dir,'repo-link','private-export.json')]),/PRIVATE_REPORT_MUST_STAY_OUTSIDE_REPOSITORY/);
});
