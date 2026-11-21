import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),acorn=require('acorn');
const html=await readFile(path.join(root,'index.html'),'utf8'),sw=await readFile(path.join(root,'sw.js'),'utf8');
const references=new Set([...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(m=>m[1].replace(/^\.\//,'')).filter(s=>!/^https?:|^data:|^#/.test(s)));
// This optional presentation asset is created by the music controller at runtime.
references.add('assets/gallery/wow-ambient-v1.mp3');
let bytes=0,scripts=0;
for(const source of references){
 const filename=source.split('?')[0],full=path.resolve(root,filename);
 if(!full.startsWith(root+path.sep))throw Error('Asset outside project: '+source);
 const info=await stat(full);if(!info.isFile())throw Error('Missing asset: '+source);bytes+=info.size;
 if(/\.js$/.test(filename)){
  const code=await readFile(full,'utf8');acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});scripts++;
  if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{20,}|WF_PDF_CERT_KEY_PKCS8_B64/.test(code))throw Error('Private credential pattern in client asset: '+source);
 }
 if(/\.(?:js|css|mp3)$/.test(filename)&&!sw.includes("'./"+source+"'"))throw Error('App/offline asset version mismatch: '+source);
}
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
 if(/\bsrc\s*=/.test(match[1])||/\btype=["'](?:application\/ld\+json|application\/json|importmap)["']/.test(match[1]))continue;
 acorn.parse(match[2],{ecmaVersion:'latest',sourceType:/\btype=["']module/.test(match[1])?'module':'script'});scripts++;
}
acorn.parse(sw,{ecmaVersion:'latest',sourceType:'script'});
if(/WF_PDF_CERT_KEY_PKCS8_B64|WF_PDF_OWNER_PASSWORD|AES-256 CERTIFIED/.test(html))throw Error('Retired PDF signing material/claim present');
for(const name of ['accounts-policy.js','accounts-data-policy.js','product-cost-core.js']){
 const clientPolicy=await readFile(path.join(root,name),'utf8'),serverPolicy=await readFile(path.join(root,'supabase/functions/wow-cloud',name),'utf8');
 if(clientPolicy!==serverPolicy)throw Error('Client and server business policy differ: '+name);
}
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
if(!manifest.name.includes('مارك ربوت')||manifest.id!=='/'||manifest.scope!=='/')throw Error('Unexpected app identity/scope');
const config=await readFile(path.join(root,'modules/platform/cloud/wow-cloud-config.js'),'utf8');
if(!config.includes('sldthbnigivpsqixccah')||config.includes('oxsrajzowlxydzgipquy'))throw Error('Wrong backend target');
console.log(JSON.stringify({result:'RELEASE_SOURCE_VERIFIED',assetFiles:references.size,parsedScripts:scripts,referencedBytes:bytes,
 deployment:'Not inferred by this source check',browser:'Not executed by this source check'},null,2));
