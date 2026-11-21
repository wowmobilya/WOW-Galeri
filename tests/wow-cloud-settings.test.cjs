'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const createUI=require('../modules/platform/cloud/wow-cloud-settings.js');
function fixture(){
  const pending=[],calls=[],observers=[];let doc,subscriber,fail;
  class Event{constructor(type,options={}){this.type=type;Object.assign(this,options);}preventDefault(){}}
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.dataset={};this.attrs={};this.listeners={};this.style={};this._text='';this._classes=new Set();this.value='';this.disabled=false;this.hidden=false;this.required=false;this.customValidity='';this.classList={contains:key=>this._classes.has(key),add:(...keys)=>keys.forEach(key=>this._classes.add(key)),toggle:(key,on)=>{on?this._classes.add(key):this._classes.delete(key);}};}
    set className(value){this._classes=new Set(value.split(/\s+/).filter(Boolean));}get className(){return [...this._classes].join(' ');}
    set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    get firstElementChild(){return this.children[0]||null;}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    prepend(node){node.remove();node.parentElement=this;this.children.unshift(node);}
    replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){if(key.startsWith('data-'))return this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??null;return this.attrs[key]??null;}
    matches(selector){return selector.split(',').some(part=>{part=part.trim();return part[0]==='.'?this._classes.has(part.slice(1)):part[0]==='#'?this.id===part.slice(1):part[0]==='['?this.getAttribute(part.slice(1,-1))!=null:this.tagName===part.toUpperCase();});}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}dispatchEvent(event){event.target??=this;for(const callback of this.listeners[event.type]||[]){const result=callback(event);if(result?.then)pending.push(result);}}
    click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}focus(){doc.activeElement=this;}select(){}setCustomValidity(value){this.customValidity=value;}
    reportValidity(){if(this.tagName==='FORM')return this.querySelectorAll('input').every(input=>input.reportValidity());return this.disabled||!this.customValidity&&(!this.required||!!this.value)&&(!this.minLength||this.value.length>=this.minLength);}
  }
  doc=new Element('document');doc.documentElement=new Element('html');doc.documentElement.lang='en';doc.append(doc.documentElement);doc.createElement=tag=>new Element(tag);doc.getElementById=id=>doc.querySelector('#'+id);
  const page=new Element('section');page.id='page-settings';page.className='active';doc.documentElement.append(page);
  const workspace=new Element();workspace.className='wf-settings-workspace';page.append(workspace);const tabs=new Element();tabs.className='tabs';const content=new Element();content.className='wf-settings-content';workspace.append(tabs,content);
  const root=new Element('window');root.document=doc;root.CustomEvent=Event;root.MutationObserver=class{constructor(fn){observers.push(fn);}observe(){}};root.switchTab=()=>{};root.showPage=()=>{};root.location={href:'https://wow.example/#settings'};root.navigator={clipboard:{writeText:async value=>calls.push({copy:value})}};
  let state={mode:'local',authenticated:false,workspaceId:null,currentAccount:null,connection:'idle',role:null};
  const client={getSnapshot:()=>structuredClone(state),subscribe:fn=>{subscriber=fn;},isConfigured:()=>true,isRemote:()=>false,isLinkedOwner:()=>!!state.workspaceId,getConfig:()=>({dashboardUrl:'https://supabase.com/dashboard/project/example'}),entryUrl:()=>`https://wow.example/?wf-cloud=employee&workspace=${state.workspaceId}#dashboard`,
    async signIn(input){calls.push({action:'signIn',input:structuredClone(input)});if(fail)throw fail;state={...state,authenticated:true,workspaceId:'space-1',currentAccount:{id:'owner',name:'Owner'},role:'owner',connection:'online'};subscriber(state);},
    async enrollOwner(input){calls.push({action:'enrollOwner',input:structuredClone(input)});return this.signIn(input);},async refresh(){return state;},async signOut(){state={...state,authenticated:false,currentAccount:null};subscriber(state);}};
  root.WFCloudClient={getClient:()=>client};root.WFAppUpdates={registerGuard(){}};root.wfInitializeCloudSync=async()=>{calls.push({action:'initializeSync'});};
  const api=createUI(root);doc.dispatchEvent(new Event('DOMContentLoaded'));root.switchTab('cloud');
  const settle=async()=>{for(let i=0;i<6;i++){await Promise.resolve();if(pending.length)await Promise.all(pending.splice(0));}};
  const input=(key,value)=>{const field=doc.getElementById('wfCloud-'+key);assert(field,key);field.value=value;field.dispatchEvent(new Event('input'));return field;};
  return {root,doc,api,calls,client,settle,input,panel:doc.getElementById('stab-cloud'),fail:value=>{fail=value;},button:caption=>doc.getElementById('stab-cloud').querySelectorAll('button').find(button=>button.textContent===caption),language:value=>{doc.documentElement.lang=value;for(const observe of observers)observe();}};
}

test('cloud sign-in uses shared settings actions, clears secrets, and does not leave a dirty hidden form',async()=>{
  const h=fixture();h.input('username','owner');const password=h.input('password','Owner password 2026');
  const actions=h.api.getSettingsActions();assert.equal(actions.canSave,true);actions.save.click();await h.settle();
  assert.equal(h.calls[0].action,'signIn');assert.equal(password.value,'');assert.equal(h.api.getSettingsActions(),null);
  assert.equal(h.api.hasUnsavedChanges(),false);assert(h.calls.some(call=>call.action==='initializeSync'));
});

test('owner enrollment submits explicit setup proof and clears it after failure',async()=>{
  const h=fixture();h.button('Set up WOW owner').click();h.input('setupToken','private-proof');h.input('name','Owner');h.input('username','owner');h.input('password','Owner password 2026');h.input('confirmPassword','Owner password 2026');
  h.fail(Object.assign(Error('NETWORK'),{code:'NETWORK'}));h.api.getSettingsActions().save.click();await h.settle();
  assert.equal(h.calls[0].input.setupToken,'private-proof');assert.equal(h.doc.getElementById('wfCloud-setupToken').value,'');
  assert(h.panel.textContent.includes('Could not reach WOW'));assert(!h.panel.textContent.includes('Account verified'));
});

test('remote account administration is an explicit same-tab workspace link',async()=>{
  const h=fixture();await h.client.signIn({});await h.settle();const link=h.panel.querySelectorAll('a').find(link=>link.textContent==='Manage cloud accounts');assert(link);
  const url=new URL(link.href);assert.equal(url.searchParams.get('wf-cloud'),'employee');assert.equal(url.searchParams.get('wf-accounts'),'cloud');assert.equal(url.searchParams.get('workspace'),'space-1');assert.equal(link.target,undefined);
});

test('changing settings language preserves entered credentials until submission',()=>{
  const h=fixture();h.input('username','owner');const password=h.input('password','Owner password 2026');
  const titles={ar:'السحابة والوصول عن بُعد',tr:'Bulut ve uzaktan erişim',fr:'Cloud et accès distant',ru:'Облако и удалённый доступ',en:'Cloud and remote access'};
  for(const lang of ['ar','tr','fr','ru','en']){h.language(lang);assert.equal(password.value,'Owner password 2026');assert(h.api.getSettingsActions());assert.equal(h.panel.querySelector('h2').textContent,titles[lang]);}
  h.root.switchTab('company');assert.equal(password.value,'');
});

test('sync engine failures remain visible even when the account is connected',async()=>{
  const h=fixture();await h.client.signIn({});let status={linked:true,connection:'error',lastError:'MEDIA_TOO_LARGE',pendingCount:2};
  h.root.WFCloudSyncEngine={getSnapshot:()=>status,subscribe:()=>()=>{}};
  h.root.dispatchEvent(new h.root.CustomEvent('wf-cloud-sync-change'));await h.settle();
  const connection=h.panel.querySelectorAll('.wf-cloud-metric')[0];
  assert.equal(connection.querySelector('strong').textContent,'Sync needs attention');
  assert(h.panel.textContent.includes('8 MiB'));assert(h.panel.textContent.includes('MEDIA_TOO_LARGE'));
  assert(!h.panel.textContent.includes('Connected and verified'));
  status={...status,connection:'idle',lastError:null,pendingCount:0};h.api.refresh();await h.settle();
  assert.equal(connection.querySelector('strong').textContent,'Connected and verified');
  assert(!h.panel.textContent.includes('MEDIA_TOO_LARGE'));
});

test('sync errors describe atomic save limits and unsupported media in all app languages',()=>{
  const h=fixture();
  assert.match(h.api.describeError({code:'SYNC_BATCH_TOO_LARGE'}),/100.*Nothing from this save/i);
  assert.match(h.api.describeError({code:'MEDIA_TOO_LARGE'}),/8 MiB/);
  assert.match(h.api.describeError({code:'UNSUPPORTED_SYNC_VALUE'}),/nested|embedded/i);
  for(const lang of ['ar','tr','fr','ru','en']){h.language(lang);assert(h.api.describeError({code:'SYNC_BATCH_TOO_LARGE'}).includes('100'));assert(h.api.describeError({code:'MEDIA_TOO_LARGE'}).includes('8 MiB'));}
});

test('conflict records identify affected rows and require an explicit inline confirmation',async()=>{
  const h=fixture();await h.client.signIn({});let resolved=false;
  h.root.WFCloudSyncEngine={getSnapshot:()=>({linked:true,conflictCount:resolved?0:1,pendingCount:1}),subscribe:()=>()=>{},
    listConflicts:async()=>resolved?[]:[{id:'batch:a',batchId:'a',reason:'CONFLICT',conflicts:[{store:'invoices',id:'invoice-7'}]}],
    exportConflict:async()=>({batches:[]}),resolveConflict:async(batchId,options)=>{h.calls.push({action:'resolve',batchId,options});resolved=true;},syncNow:async()=>{}};
  h.root.dispatchEvent(new h.root.CustomEvent('wf-cloud-sync-change'));await h.settle();
  assert(h.panel.textContent.includes('invoice-7'));assert(h.button('Export local changes to review'));
  h.button('Use cloud version').click();await h.settle();assert(!h.calls.some(call=>call.action==='resolve'));
  assert(h.panel.textContent.includes('dependent operations'));
  h.button('Confirm this choice').click();await h.settle();
  assert.deepEqual(h.calls.find(call=>call.action==='resolve'),{action:'resolve',batchId:'a',options:{strategy:'server'}});
});
