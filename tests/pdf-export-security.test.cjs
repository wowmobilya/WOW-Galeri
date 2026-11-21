'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('const WF_PDF_PERMISSIONS='),end=html.indexOf('async function wfExportSnapshot',start);
const context=vm.createContext({crypto:webcrypto,Blob,Uint8Array,TextEncoder,TextDecoder,DataView,atob,WF_PDF_VERSION:'211-security'});
vm.runInContext(html.slice(start,end)+'\nglobalThis.exportPDF=wfMakePdf;',context);
const jpeg='data:image/jpeg;base64,'+fs.readFileSync(path.join(__dirname,'fixtures/pdf-export-security.jpg')).toString('base64');

test('invoice PDF remains readable and encrypted without a public signing credential or false certification',async()=>{
  assert(start>0&&end>start);
  assert(!html.includes('WF_PDF_CERT_KEY_PKCS8_B64'));
  assert(!html.includes('WF_PDF_OWNER_PASSWORD'));
  const input=[{width:794,height:1139,jpeg},{width:794,height:1139,jpeg}];
  const first=Buffer.from(await(await context.exportPDF(input,'فاتورة - TEST-211')).arrayBuffer());
  const second=Buffer.from(await(await context.exportPDF(input,'فاتورة - TEST-211')).arrayBuffer());
  assert.notDeepEqual(first,second,'each export receives independent encryption material');
  const parsed=JSON.parse(execFileSync('python',['-c',`
import sys,io,json
from pypdf import PdfReader
r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True)
assert r.is_encrypted
assert r.decrypt('')
root=r.trailer['/Root']
assert '/AcroForm' not in root and '/DocMDP' not in root.get('/Perms',{})
assert r.trailer['/Encrypt']['/R']==6
pages=[]
for page in r.pages:
 image=page['/Resources']['/XObject']['/InvoicePage']
 assert image.get_data().startswith(bytes([255,216]))
 assert b'/InvoicePage Do' in page.get_contents().get_data()
 pages.append([int(image['/Width']),int(image['/Height'])])
print(json.dumps({'pages':pages,'title':r.metadata.title,'producer':r.metadata.producer}))
`],{input:first,maxBuffer:1024*1024}).toString());
  assert.deepEqual(parsed.pages,[[794,1139],[794,1139]]);
  assert.equal(parsed.title,'فاتورة - TEST-211');
  assert(!parsed.producer.includes('CERTIFIED'));
  if(process.env.WOW_PDF_TEST_OUTPUT)fs.writeFileSync(process.env.WOW_PDF_TEST_OUTPUT,first);
});

test('PDF exporter rejects empty input and preserves malformed image rejection',async()=>{
  await assert.rejects(context.exportPDF([],'Empty'),/EMPTY_PDF/);
  await assert.rejects(context.exportPDF([{width:794,height:1139,jpeg:'invalid'}],'Broken'),/BAD_PDF_IMAGE/);
});
