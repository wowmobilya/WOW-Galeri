import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {localDOM} from './fixtures/module-dom.mjs';
const source=await readFile(new URL('../modules/customer-auth/workspace.js',import.meta.url),'utf8');
const tree=node=>[node,...node.children.flatMap(tree)];
function page(href='https://customer-auth.invalid/?wf-cloud=employee&workspace='+randomUUID()){
 const {doc,body}=localDOM(),changes=[],calls=[],container=doc.createElement('div'),loginForm=doc.createElement('form');
 container.append(loginForm);body.append(container);const location=new URL(href);
 const win={document:doc,location,history:{replaceState(_state,_title,value){changes.push(value);}},crypto:{randomUUID},
  localStorage:{setItem(){assert.fail('email proof must never persist');}},sessionStorage:{setItem(){assert.fail('email proof must never persist');}}};
 const sandbox=vm.createContext({window:win,URL,URLSearchParams,Intl,Promise,TextEncoder,Uint8Array,Array,Object});vm.runInContext(source,sandbox);
 const client={isRemote:()=>true,customerAuthOptions:async()=>({registrationEnabled:true,recoveryEnabled:true}),
  customerRegister:async value=>{calls.push({action:'register',value});return {accepted:true};},
  customerRecover:async value=>{calls.push({action:'recover',value});return {accepted:true};},
  customerVerify:async value=>{calls.push({action:'verify',value});return {completed:true,username:'confirmed-customer'};}};
 return {doc,win,container,loginForm,changes,calls,client,tree:()=>tree(container),button:text=>tree(container).find(x=>x.tagName==='BUTTON'&&x.textContent===text),
  input:name=>tree(container).find(x=>x.name===name),form:()=>tree(container).find(x=>x.className==='wf-customer-auth-form')};
}

test('visitor registration and recovery operate through real form handlers and accurately describe email acceptance',async()=>{
 const p=page(),surface=p.win.WFCustomerAuth.mountVisitor({container:p.container,loginForm:p.loginForm,client:p.client,lang:'en'});await surface.ready;
 assert.equal(p.loginForm.hidden,false);await p.button('Create customer account').fire('click');assert.equal(p.loginForm.hidden,true);
 for(const [key,value]of Object.entries({name:'Customer Name',username:'customer',email:'customer@example.com',company:'Customer Company',callingCode:'+90',phone:'5551234567'}))p.input(key).value=value;
 assert.equal(p.input('country').options.length,249);p.input('search').value='tür';await p.input('search').fire('input');assert(p.input('country').options.some(x=>x.value==='TR'));
 assert(!p.input('password'),'the initiator cannot set the mailbox holder password');
 await p.form().fire('submit');assert.equal(p.calls.length,1);assert.equal(p.calls[0].action,'register');
 assert.match(p.calls[0].value.requestId,/^[a-f0-9-]{36}$/);assert.equal(p.calls[0].value.country,'TR');
 assert(p.tree().some(x=>x.textContent.includes('Acceptance does not confirm email delivery.')));assert.equal(p.loginForm.hidden,false);
 await p.button('Forgot password').fire('click');p.input('email').value='customer@example.com';await p.form().fire('submit');assert.equal(p.calls.at(-1).action,'recover');
 for(const lang of ['ar','tr','fr','ru','en']){surface.updateLanguage(lang);assert(p.tree().every(x=>!x.textContent.includes('undefined')));}
 surface.dispose();assert.equal(p.container.children.length,1);
});

test('fragment proof is stripped at module load and used once without creating a persisted browser session',async()=>{
 const requestId=randomUUID(),wid=randomUUID(),hash='b'.repeat(64),challenge='q'.repeat(43);
 const p=page('https://customer-auth.invalid/?wf-cloud=employee&workspace='+wid+'&wf-customer=register&request='+requestId+'#challenge='+challenge+'&token_hash='+hash);
 assert.equal(p.changes.length,1);assert(!p.changes[0].includes(hash));assert(!p.changes[0].includes(challenge));assert(!p.changes[0].includes('request='));assert.equal(new URL(p.changes[0]).hash,'#dashboard');
 const completed=[],surface=p.win.WFCustomerAuth.mountVisitor({container:p.container,loginForm:p.loginForm,client:p.client,lang:'en',onComplete:(...args)=>completed.push(args)});await surface.ready;
 assert.equal(p.loginForm.hidden,true);p.input('password').value='Confirmed password from email';p.input('repeat').value='other password';await p.form().fire('submit');assert.equal(p.calls.length,0);
 p.input('password').value='Confirmed password from email';p.input('repeat').value='Confirmed password from email';await p.form().fire('submit');
 assert.deepEqual(JSON.parse(JSON.stringify(p.calls)),[{action:'verify',value:{requestId,tokenHash:hash,challenge,password:'Confirmed password from email'}}]);
 assert.equal(completed[0][0],'confirmed-customer');assert.equal(p.loginForm.hidden,false);assert(!p.form());assert(!p.tree().some(x=>x.textContent.includes(hash)));
 surface.dispose();
});

test('query-only or missing challenge callbacks are cleared and cannot reach verification',async()=>{
 const challenge='s'.repeat(43),base='https://customer-auth.invalid/?wf-cloud=employee&workspace='+randomUUID()+'&wf-customer=register&request='+randomUUID();
 for(const href of [base+'&challenge='+challenge+'#token_hash='+'d'.repeat(64),base+'#token_hash='+'e'.repeat(64),'https://customer-auth.invalid/#challenge='+challenge]){
  const p=page(href),surface=p.win.WFCustomerAuth.mountVisitor({container:p.container,loginForm:p.loginForm,client:p.client,lang:'en'});await surface.ready;
  assert.equal(p.changes.length,1);assert(!p.changes[0].includes(challenge));assert(!p.input('password'));assert.equal(p.calls.length,0);
  assert(p.tree().some(node=>node.textContent.includes('expired or already used')));surface.dispose();
 }
});

test('expired proof gives an actionable new-link path and local owner login never mounts customer enrollment',async()=>{
 const p=page('https://customer-auth.invalid/?wf-cloud=employee&workspace='+randomUUID()+'&wf-customer=recover&request='+randomUUID()+'#challenge='+'r'.repeat(43)+'&token_hash='+'c'.repeat(64));
 p.client.customerVerify=async()=>{throw Object.assign(Error(),{code:'INVALID_EMAIL_LINK'});};
 const surface=p.win.WFCustomerAuth.mountVisitor({container:p.container,loginForm:p.loginForm,client:p.client,lang:'en'});await surface.ready;
 p.input('password').value='replacement password';p.input('repeat').value='replacement password';await p.form().fire('submit');
 assert(p.tree().some(x=>x.textContent.includes('expired or already used')));assert(p.button('Forgot password'));assert.equal(p.loginForm.hidden,false);surface.dispose();
 const local=page();local.client.isRemote=()=>false;
 local.win.WFCustomerAuth.mountVisitor({container:local.container,loginForm:local.loginForm,client:local.client,lang:'en'});assert.equal(local.container.children.length,1);
});

test('owner controls use revision checks and show accepted requests separately from completed proofs',async()=>{
 const p=page(),calls=[],wid=randomUUID();let state={configured:true,workspaceId:wid,settings:{registrationEnabled:false,recoveryEnabled:false,revision:1},accepted24h:3,failed24h:1,completed24h:2};
 const api={can:key=>key==='accounts.edit',async request(action,payload){calls.push({action,payload});if(action==='customerAuth.configure')state={...state,settings:{...payload,revision:2}};return state;}};
 const surface=p.win.WFCustomerAuth.mountOwner({container:p.container,api,lang:'en',origin:'https://customer-auth.invalid'});await surface.ready;
 assert(p.tree().some(x=>x.textContent.includes('Requests accepted by email provider in 24 hours: 3')));
 const checks=p.tree().filter(x=>x.type==='checkbox');checks[0].checked=checks[1].checked=true;
 const form=p.tree().find(x=>x.tagName==='FORM'&&x!==p.loginForm);await form.fire('submit');
 assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),{action:'customerAuth.configure',payload:{revision:1,registrationEnabled:true,recoveryEnabled:true}});
 const link=p.tree().find(x=>x.type==='url');assert.equal(new URL(link.value).searchParams.get('workspace'),wid);assert.equal(link.readOnly,true);
 surface.dispose();const before=p.container.children.length;
 p.win.WFCustomerAuth.mountOwner({container:p.container,api:{can:()=>false,request(){assert.fail('staff cannot read control');}},lang:'en'});assert.equal(p.container.children.length,before);
});
