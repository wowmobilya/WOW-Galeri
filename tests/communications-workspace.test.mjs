import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {localDOM} from './fixtures/module-dom.mjs';
import {communicationsFixture} from './fixtures/communications.mjs';
const require=createRequire(import.meta.url),core=require('../modules/communications/core.js');
const walk=node=>[node,...node.children.flatMap(walk)];
const btn=(container,caption)=>walk(container).find(n=>n.tagName==='BUTTON'&&n.textContent===caption);
const dialog=container=>walk(container).find(n=>n.tagName==='DIALOG'&&n.open);
const field=(container,caption)=>walk(container).find(n=>n.tagName==='LABEL'&&n.ownText===caption)?.lastElementChild;
const until=async(predicate)=>{for(let i=0;i<500&&!predicate();i++)await new Promise(r=>setTimeout(r,2));assert(predicate(),'UI did not settle');};

test('native correspondence UI uses reviewed scoped recipients and distinguishes provider acceptance from device handoff',async(t)=>{
 const f=await communicationsFixture();t.after(()=>f.db.close());
 const {doc,body}=localDOM(),container=doc.createElement('div');body.append(container);let definition,language='en',shares=0;
 const root={document:doc,crypto:{randomUUID},navigator:{share:async()=>{shares++;}},WFCommunicationsCore:core,WFModules:{register:value=>definition=value}};
 vm.runInNewContext(await readFile(new URL('../modules/communications/workspace.js',import.meta.url),'utf8'),{window:root,Intl,URL,console});
 const api={can:()=>true,request:(action,data)=>f.call(action.replace('communications.',''),data)};
 const instance=definition.mount({container,api,locale:()=>language,params:{source:{kind:'company',id:7}}});
 t.after(()=>instance.dispose());await until(()=>dialog(container)&&field(dialog(container),'Recipient')?.value);
 let form=dialog(container);assert.equal(btn(form,'Send this email'),undefined,'email cannot send before a saved review');
 const subject=field(form,'Subject'),bodyText=field(form,'Message text');subject.value='Reviewed <img onerror=alert(1)>';bodyText.value='Hello <script>not executed</script>';
 await subject.fire('input');await bodyText.fire('input');await btn(form,'Save and review draft').fire('click');
 assert.equal(f.sends.length,0);assert(form.textContent.includes(f.company.email));assert.equal(btn(form,'Send this email').disabled,false);
 await btn(form,'Send this email').fire('click');assert.equal(f.sends.length,1);assert(form.textContent.includes('Provider accepted request'));
 assert(!form.textContent.includes('Recipient mail server accepted'));
 assert.equal(btn(form,'Save and review draft'),undefined,'accepted payload is immutable in the editor');
 assert.equal(walk(container).filter(n=>['SCRIPT','IMG'].includes(n.tagName)).length,0,'customer and message markup is literal text');
 await btn(form,'Close').fire('click');await btn(container,'New message').fire('click');form=dialog(container);
 const people=field(form,'Recipient');people.value=people.options.find(x=>x.value)?.value;await people.fire('change');
 const channel=field(form,'Channel');channel.value='whatsapp';await channel.fire('change');field(form,'Subject').value='Order contact';field(form,'Message text').value='Please confirm & check <items>.';
 await field(form,'Message text').fire('input');await btn(form,'Save and review draft').fire('click');await btn(form,'Prepare share').fire('click');
 assert.equal(f.sends.length,1);assert.equal(shares,0);assert(form.textContent.includes('delivery is not confirmed'));
 const link=walk(form).find(n=>n.tagName==='A');assert.equal(link.href,'https://wa.me/905551234567?text=Please%20confirm%20%26%20check%20%3Citems%3E.');assert.equal(link.rel,'noopener noreferrer');
 await btn(form,'Close').fire('click');
 language='ar';instance.updateLanguage();assert(container.textContent.includes('مراسلات العملاء'));
 for(const lang of core.locales){assert.equal(core.templates(lang).length,4);assert(!core.text('delivered',lang).includes('delivered'));}
});

test('literal templates, recipient URL validation and query encoding cannot inject HTML or extra mail headers',()=>{
 assert.equal(core.render('Hello {{name}}',{name:'<script>attack</script>'}),'Hello <script>attack</script>');
 const url=core.shareURL({channel:'mail',recipient:{email:"o'brien!tag=x@example.test"},subject:'a&bcc=target@example.test',body:'Line\n&cc=other@example.test'});
 assert(url.startsWith('mailto:'));assert(url.includes('%26bcc%3D'));assert(!url.includes('&bcc='));assert(!url.includes('&cc='));
 assert.throws(()=>core.shareURL({channel:'mail',recipient:{email:'a@example.test\r\nBcc:bad@example.test'},body:''}));
 assert.throws(()=>core.shareURL({channel:'whatsapp',recipient:{phone:'javascript:alert(1)'},body:''}));
 assert.equal(core.shareURL({channel:'mail',recipient:{email:'buyer@shop.xn--p1ai'},subject:'Order',body:'Hello'}),'mailto:buyer%40shop.xn--p1ai?subject=Order&body=Hello');
 for(const email of ['buyer@shop.xn--bad-','buyer@'+'x'.repeat(64)+'.test','.buyer@example.test'])assert.throws(()=>core.shareURL({channel:'mail',recipient:{email},subject:'Order',body:'Hello'}));
});

test('disposed or switched identity cannot render an in-flight correspondence response or complete a new send',async()=>{
 const {doc,body}=localDOM(),container=doc.createElement('div');body.append(container);let definition,resolve,requests=0;
 const pending=new Promise(r=>resolve=r),root={document:doc,crypto:{randomUUID},WFCommunicationsCore:core,WFModules:{register:value=>definition=value}};
 vm.runInNewContext(await readFile(new URL('../modules/communications/workspace.js',import.meta.url),'utf8'),{window:root,Intl,URL});
 const api={can:()=>true,request:async()=>{requests++;await pending;return {items:[{id:randomUUID(),recipient:{name:'Private person'},subject:'Private text',body:'Private body',channel:'email',status:'draft'}],more:false};}};
 const instance=definition.mount({container,api,locale:()=> 'en'});assert.equal(requests,3);instance.dispose();resolve();
 await new Promise(r=>setTimeout(r,0));assert.equal(container.children.length,0);assert(!body.textContent.includes('Private'));
});
