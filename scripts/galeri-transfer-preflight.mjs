#!/usr/bin/env node
// Offline evidence only. No provider client, SQL execution, file upload or writes
// to the application are present in this program.
import {createHash} from 'node:crypto';
import {readFile,stat,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRef='sldthbnigivpsqixccah';
export const familyTargets=Object.freeze({
 inventory:'public.wow_records/products + public.wow_gallery_listings',
 orders:'public.wow_gallery_orders + public.wow_gallery_lines',
 user_orders_inventory:'reconcile order lines and purchaser preferences; do not add stock',
 user_sales_log:'public.wow_gallery_sales',user_print_settings:'public.wow_gallery_print_profiles',
 users:'explicit existing Auth/customer mapping',admin_accounts:'explicit existing Auth/staff mapping',
 admin_profiles:'wow_collab.profiles',admin_chats:'review legacy direct-room conversion',
 group_rooms:'wow_collab.rooms',group_members:'wow_collab.members',group_messages:'wow_collab.messages',
 group_read_status:'wow_collab.members read cursor through message ID map',
 message_mentions:'wow_collab.messages.mentions',message_forwards:'wow_collab.messages forwarded lineage',
 message_reactions:'wow_collab.reactions',message_stars:'wow_collab.stars',message_hidden_by:'wow_collab.hidden',
 message_seen_by:'review per-message receipts versus native member cursor',
 chat_drafts:'wow_collab.members.draft',chat_user_settings:'wow_collab.members preferences',
 user_files:'wow_collab.files with explicit file owner',local_folders:'wow_collab.folders with explicit owner',
 messages:'historical communications archive; never enqueue a send',
 app_settings:'allowlisted gallery presentation settings only',dimension_fields:'gallery presentation fields',
 home_cards:'gallery presentation cards',hero_slider:'gallery presentation slides'
});
const excluded=new Set(['user_sessions','otp_codes','push_subscriptions','chat_typing_status']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=/^[a-f0-9]{64}$/;
const secret=/password|passwd|secret|(?:^|_)(?:token|jwt|otp|session|api_key|private_key|service_role|credential)(?:_|$)/i;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const typed=value=>{
 if(typeof value==='string'&&value.length>0&&value.length<=180)return JSON.stringify(value);
 if(Number.isSafeInteger(value))return JSON.stringify(value);
 throw Error('INVALID_TYPED_ID');
};
function canonical(value,depth=0){
 if(depth>32)throw Error('EXPORT_TOO_DEEP');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('INVALID_NUMBER');return value;}
 if(Array.isArray(value))return value.map(item=>canonical(item,depth+1));
 if(!plain(value))throw Error('INVALID_RECORD');
 return Object.fromEntries(Object.keys(value).filter(key=>!secret.test(key)).sort().map(key=>[key,canonical(value[key],depth+1)]));
}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const countSecrets=(value,depth=0)=>{
 if(depth>32)throw Error('EXPORT_TOO_DEEP');
 if(!value||typeof value!=='object')return 0;
 return Object.entries(value).reduce((n,[key,item])=>n+(secret.test(key)?1:countSecrets(item,depth+1)),0);
};

export function inspectExport(source,mapping={}){
 if(!plain(source)||source.projectRef!==projectRef||!plain(source.tables))throw Error('INVALID_SOURCE_PROJECT_OR_EXPORT');
 if(!plain(mapping))throw Error('INVALID_MAPPING');
 const rows=new Map(),issues=[],families=[],records=[];
 let total=0,omittedCredentialFields=0;
 const add=(code,family,index,detail)=>issues.push({code,family,...(index==null?{}:{row:index}),...(detail?{detail}:{})});
 for(const name of Object.keys(source.tables).sort()){
  const items=source.tables[name];
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(name)||!Array.isArray(items)||items.length>50000)throw Error('INVALID_TABLE_EXPORT');
  total+=items.length;if(total>100000)throw Error('EXPORT_ROW_LIMIT');
  if(excluded.has(name)){
   families.push({family:name,rows:items.length,disposition:'exclude-ephemeral-credentials'});continue;
  }
  if(name.startsWith('acc_')){families.push({family:name,rows:items.length,disposition:'existing-finance-importer'});continue;}
  if(!own(familyTargets,name)){families.push({family:name,rows:items.length,disposition:'unrecognized'});add('UNRECOGNIZED_FAMILY',name);continue;}
  const index=new Map();
  items.forEach((record,i)=>{
   if(!plain(record))throw Error('INVALID_RECORD');omittedCredentialFields+=countSecrets(record);
   let key;
   try{key=own(record,'id')?typed(record.id):null;}catch{add('UNSAFE_OR_INVALID_ID',name,i);}
   if(key&&index.has(key))add('DUPLICATE_ID',name,i);else if(key)index.set(key,{record,index:i});
   records.push({family:name,row:i,...(key?{sourceId:record.id}:{}),recordSha256:digest(record)});
  });
  rows.set(name,{items,index});
  const expected=source.counts?.[name];
  if(!Number.isSafeInteger(expected)||expected<0)add('SOURCE_COUNT_REQUIRED',name);
  else if(expected!==items.length)add('SOURCE_COUNT_MISMATCH',name);
  families.push({family:name,rows:items.length,disposition:'review-required',target:familyTargets[name],sha256:digest(items)});
 }
 for(const name of Object.keys(familyTargets))if(!rows.has(name))add('FAMILY_EXPORT_MISSING',name);
 const accounts=new Map();
 for(const account of mapping.targetAccounts||[]){
  if(!plain(account)||!uuid.test(account.id)||account.workspaceId!==mapping.workspaceId||!['owner','manager','sales','carpentry','assembly','warehouse','customer','custom'].includes(account.role))throw Error('INVALID_TARGET_ACCOUNT');
  if(accounts.has(account.id))throw Error('DUPLICATE_TARGET_ACCOUNT');accounts.set(account.id,account);
 }
 if(!uuid.test(mapping.workspaceId))add('TARGET_WORKSPACE_REQUIRED','mapping');
 const mappedAccounts=new Map();
 for(const entry of mapping.accounts||[]){
  if(!plain(entry)||!['users','admin_accounts'].includes(entry.family)||!accounts.has(entry.targetId))throw Error('INVALID_ACCOUNT_MAPPING');
  const key=entry.family+':'+typed(entry.sourceId);if(mappedAccounts.has(key))throw Error('DUPLICATE_ACCOUNT_MAPPING');
  const from=rows.get(entry.family)?.index.get(typed(entry.sourceId));
  if(!from)throw Error('UNKNOWN_ACCOUNT_MAPPING');
  // Role is evidence from the target inventory, not a value to be imported.
  if(entry.targetRole!==accounts.get(entry.targetId).role)throw Error('TARGET_ROLE_MISMATCH');
  mappedAccounts.set(key,entry.targetId);
 }
 for(const name of ['users','admin_accounts'])rows.get(name)?.items.forEach((record,i)=>{
  if(record.id==null||!mappedAccounts.has(name+':'+typed(record.id)))add('ACCOUNT_MAPPING_REQUIRED',name,i);
 });
 const products=new Map();
 for(const entry of mapping.products||[]){
  const key=typed(entry.sourceId),target=typed(entry.targetId);
  if(products.has(key)||!rows.get('inventory')?.index.has(key))throw Error('INVALID_PRODUCT_MAPPING');
  if(!(mapping.targetProducts||[]).some(id=>typed(id)===target))throw Error('TARGET_PRODUCT_NOT_FOUND');products.set(key,target);
 }
 rows.get('inventory')?.items.forEach((record,i)=>{if(record.id==null||!products.has(typed(record.id)))add('PRODUCT_MAPPING_REQUIRED','inventory',i);});
 const owners=new Map();
 for(const entry of mapping.fileOwners||[]){
  const key=typed(entry.sourceId);if(owners.has(key)||!accounts.has(entry.targetId)||!rows.get('user_files')?.index.has(key))throw Error('INVALID_FILE_OWNER_MAPPING');
  owners.set(key,entry.targetId);
 }
 rows.get('user_files')?.items.forEach((record,i)=>{if(record.id==null||!owners.has(typed(record.id)))add('EXPLICIT_FILE_OWNER_REQUIRED','user_files',i);});
 const relations=[['group_members','room_id','group_rooms'],['group_messages','room_id','group_rooms'],
  ['group_messages','reply_to_id','group_messages'],['group_read_status','room_id','group_rooms'],
  ['group_read_status','last_read_id','group_messages'],['user_sales_log','inventory_id','user_orders_inventory'],
  ['chat_drafts','room_id','group_rooms'],['chat_user_settings','room_id','group_rooms']];
 for(const name of ['message_mentions','message_forwards','message_reactions','message_stars','message_hidden_by','message_seen_by'])rows.get(name)?.items.forEach((record,i)=>{
  if(record.scope!=='group'){add('LEGACY_CHAT_SCOPE_REVIEW',name,i);return;}
  try{if(record.message_id==null||!rows.get('group_messages')?.index.has(typed(record.message_id)))add('UNRESOLVED_REFERENCE',name,i,{field:'message_id',parent:'group_messages'});}
  catch{add('INVALID_REFERENCE',name,i,{field:'message_id',parent:'group_messages'});}
 });
 for(const [name,field,parent] of relations)rows.get(name)?.items.forEach((record,i)=>{
  const value=record[field];if(value==null||value===0&&field==='last_read_id')return;
  try{if(!rows.get(parent)?.index.has(typed(value)))add('UNRESOLVED_REFERENCE',name,i,{field,parent});}
  catch{add('INVALID_REFERENCE',name,i,{field,parent});}
 });
 // Source used separate writes for order, holding and sale totals. Their values
 // must agree before any native migration is designed, never by adding them.
 const orderNumbers=new Map();
 rows.get('orders')?.items.forEach((record,i)=>{
  const key=JSON.stringify([record.username,record.order_number]);
  if(orderNumbers.has(key))add('AMBIGUOUS_ORDER_NUMBER','orders',i);else orderNumbers.set(key,record);
 });
 const soldTotals=new Map(),invalidSales=new Set();
 for(const sale of rows.get('user_sales_log')?.items||[]){
  let key;try{key=typed(sale.inventory_id);}catch{continue;}
  if(!Number.isSafeInteger(sale.qty_sold)||sale.qty_sold<0)invalidSales.add(key);
  else soldTotals.set(key,(soldTotals.get(key)||0)+sale.qty_sold);
 }
 rows.get('user_orders_inventory')?.items.forEach((record,i)=>{
  const order=orderNumbers.get(JSON.stringify([record.username,record.order_number]));
  if(!order)add('HOLDING_ORDER_UNRESOLVED','user_orders_inventory',i);
  else{
   const lines=(Array.isArray(order.items)?order.items:[]).filter(line=>{try{return typed(line.id)===typed(record.product_id);}catch{return false;}});
   if(lines.length!==1||lines[0].qty!==record.qty_purchased||order.status!==record.order_status)add('HOLDING_ORDER_MISMATCH','user_orders_inventory',i);
  }
  const saleKey=typed(record.id),sum=soldTotals.get(saleKey)||0;
  if(invalidSales.has(saleKey))add('INVALID_SALE_QUANTITY','user_orders_inventory',i);
  if(!Number.isSafeInteger(record.qty_sold)||record.qty_sold!==sum||record.qty_sold<0||record.qty_sold>record.qty_purchased)add('SALE_HOLDING_MISMATCH','user_orders_inventory',i);
 });
 const objects=new Map();
 for(const object of source.objects||[]){
  if(!plain(object)||!['home-images','chat-media','user-files'].includes(object.bucket)||typeof object.path!=='string'||object.path.length>1024||
   object.path.startsWith('/')||object.path.split('/').some(s=>!s||s==='.'||s==='..')||/[\u0000-\u001f\\]/.test(object.path))throw Error('INVALID_STORAGE_INVENTORY');
  const key=object.bucket+'/'+object.path;if(objects.has(key))throw Error('DUPLICATE_STORAGE_OBJECT');objects.set(key,object);
  if(!hash.test(object.sha256||'')||!Number.isSafeInteger(object.bytes)||object.bytes<=0||typeof object.mime!=='string')add('OBJECT_BYTES_EVIDENCE_REQUIRED','storage');
 }
 rows.get('user_files')?.items.forEach((record,i)=>{
  const object=objects.get('user-files/'+record.file_path);
  if(!object)add('FILE_OBJECT_MISSING','user_files',i);
  else if(object.bytes!==record.file_size||object.mime!==record.mime_type)add('FILE_OBJECT_MISMATCH','user_files',i);
 });
 return {format:'galeri-transfer-preflight/1',sourceProject:projectRef,targetWorkspace:uuid.test(mapping.workspaceId)?mapping.workspaceId:null,
  mode:'read-only',applyReady:false,blocker:'AUTHORIZED_SOURCE_SCHEMA_AND_NATIVE_IMPORT_ADAPTER_REQUIRED',
  rows:total,families,omittedCredentialFields,issues,records,
  manifestSha256:digest({families,records,mapping:canonical(mapping)}),
  objects:{count:objects.size,bytes:[...objects.values()].reduce((n,o)=>n+(Number.isSafeInteger(o.bytes)?o.bytes:0),0),contentVerified:false}};
}

async function readJson(filename){const info=await stat(filename);if(!info.isFile()||info.size>67108864)throw Error('INPUT_LIMIT');return JSON.parse(await readFile(filename,'utf8'));}
export async function main(args){
 if(args.length!==3)throw Error('USAGE: node scripts/galeri-transfer-preflight.mjs export.json mapping.json report.json');
 const [exportPath,mappingPath,reportPath]=args.map(filename=>path.resolve(filename));
 if(reportPath===exportPath||reportPath===mappingPath)throw Error('OUTPUT_OVERWRITES_INPUT');
 const repo=await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
 const physicalOutput=path.join(await realpath(path.dirname(reportPath)),path.basename(reportPath));
 if(physicalOutput===repo||physicalOutput.startsWith(repo+path.sep))throw Error('PRIVATE_REPORT_MUST_STAY_OUTSIDE_REPOSITORY');
 const [source,mapping]=await Promise.all([readJson(exportPath),readJson(mappingPath)]);
 const result=inspectExport(source,mapping);
 await writeFile(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 return {mode:result.mode,applyReady:false,rows:result.rows,issues:result.issues.length,omittedCredentialFields:result.omittedCredentialFields,manifestSha256:result.manifestSha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{
  console.error(/^[A-Z_ :a-z./]+$/.test(error.message)?error.message:'INVALID_EXPORT_OR_LOCAL_FILE');process.exitCode=1;
 });
}
