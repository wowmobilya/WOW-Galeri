const test = require('node:test');
const assert = require('node:assert/strict');
const createUI = require('../accounts-settings.js');
const policy = require('../accounts-policy.js');

// Exercise the actual settings controller with event-driven controls. The
// service fixture deliberately publishes snapshots while forms are being used.
function fixture({configured = true} = {}) {
  const pending = [], observers = [], calls = [], guards = new Map();
  let document, callback, barrier, fail, clock = 0;
  class Event {
    constructor(type, options = {}) { this.type = type; Object.assign(this,options); }
    preventDefault() { this.defaultPrevented = true; }
  }
  class Element {
    constructor(tag='div') {
      this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.dataset={};this.attrs={};this.listeners={};this.style={};
      this._text='';this._classes=new Set();this.value='';this.disabled=false;this.hidden=false;this.required=false;this.checked=false;this.customValidity='';
      this.classList={contains:key=>this._classes.has(key),add:(...keys)=>keys.forEach(key=>this._classes.add(key)),remove:(...keys)=>keys.forEach(key=>this._classes.delete(key)),
        toggle:(key,on)=>{on=on??!this._classes.has(key);on?this._classes.add(key):this._classes.delete(key);return on;}};
    }
    set className(value) {this._classes=new Set(value.split(/\s+/).filter(Boolean));}
    get className() {return [...this._classes].join(' ');}
    set textContent(value) {this._text=String(value);for(const child of this.children)child.parentElement=null;this.children=[];}
    get textContent() {return this._text+this.children.map(child=>child.textContent).join('');}
    get firstElementChild(){return this.children[0]||null;}
    get lastElementChild(){return this.children.at(-1)||null;}
    get options(){return this.children;}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    prepend(node){node.remove();node.parentElement=this;this.children.unshift(node);}
    replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    setAttribute(key,value){this.attrs[key]=String(value);}
    getAttribute(key){
      if(key.startsWith('data-')){const field=key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[field]??this.attrs[key]??null;}
      return this.attrs[key]??null;
    }
    matches(selector){
      return selector.split(',').some(part=>{
        part=part.trim();
        if(part.startsWith('.'))return part.slice(1).split('.').every(key=>this._classes.has(key));
        if(part.startsWith('#'))return this.id===part.slice(1);
        if(part.startsWith('['))return this.getAttribute(part.slice(1,-1))!==null;
        return this.tagName===part.toUpperCase();
      });
    }
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
    dispatchEvent(event){event.target??=this;for(const handler of this.listeners[event.type]||[]){const result=handler(event);if(result?.then)pending.push(result);}return !event.defaultPrevented;}
    click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
    focus(){document.activeElement=this;}
    setCustomValidity(value){this.customValidity=value;}
    reportValidity(){
      if(this.tagName==='FORM')return this.querySelectorAll('input,select,textarea').every(input=>input.reportValidity());
      return this.disabled||(!this.customValidity&&(!this.required||!!this.value)&&(!this.minLength||!this.value||this.value.length>=this.minLength));
    }
    close(){this.open=false;this.dispatchEvent(new Event('close'));}
  }
  document=new Element('document');document.documentElement=new Element('html');document.documentElement.lang='en';document.append(document.documentElement);
  document.createElement=tag=>new Element(tag);
  document.getElementById=id=>document.querySelector('#'+id);
  const page=new Element('section');page.id='page-settings';page.className='page active';document.documentElement.append(page);
  const workspace=new Element();workspace.className='wf-settings-workspace';page.append(workspace);
  const tabs=new Element();tabs.className='tabs';const content=new Element();content.className='wf-settings-content';workspace.append(tabs,content);
  const dialog=new Element('dialog');dialog.id='wfSettingsDialog';dialog.open=true;workspace.append(dialog);
  const root=new Element('window');root.document=document;root.CustomEvent=Event;
  root.MutationObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}};
  root.WFAppUpdates={registerGuard:(name,guard)=>guards.set(name,guard)};
  root.WFAccountPolicy=policy;root.switchTab=()=>{};root.showPage=()=>{};
  let snapshot={configured,revision:0,currentAccount:null,accounts:[],audit:[]};
  const account=(id,name,role)=>({id,name,username:id,role,permissions:policy.presets(role),department:'',note:'',expiresAt:null,status:'active',
    createdAt:'2026-11-21T12:00:00.000Z',updatedAt:'2026-11-21T12:00:00.000Z',lastLoginAt:null,sessionVersion:1});
  if(configured){
    snapshot.accounts=[account('owner-1','Owner','owner'),account('worker-1','Woodworker','carpentry')];
    snapshot.currentAccount=snapshot.accounts[0];
  }
  function publish(){snapshot.revision++;callback?.(structuredClone(snapshot));return structuredClone(snapshot);}
  async function run(kind,args,change){
    calls.push({kind,args});await barrier;if(fail){const code=fail;fail=null;throw Error(code);}
    change();return publish();
  }
  const service={
    getSnapshot:()=>structuredClone(snapshot),subscribe:fn=>{callback=fn;return()=>{callback=null;};},
    refresh:async()=>publish(),
    bootstrapOwner:input=>run('bootstrap',[input],()=>{
      const row={...account('first-owner',input.name,'owner'),username:input.username};snapshot.accounts.push(row);snapshot.currentAccount=row;snapshot.configured=true;
    }),
    createAccount:input=>run('create',[input],()=>{
      const {password,...safe}=input;snapshot.accounts.push({...account('new-'+(++clock),input.name,input.role),...safe});
    }),
    updateAccount:(id,changes)=>run('update',[id,changes],()=>{Object.assign(snapshot.accounts.find(row=>row.id===id),changes,{updatedAt:'2026-11-21T12:01:00.000Z'});}),
    changePassword:(oldPassword,newPassword)=>run('changePassword',[oldPassword,newPassword],()=>{}),
    setPassword:(id,password)=>run('setPassword',[id,password],()=>{}),
    setStatus:(id,status,reason)=>run('status',[id,status,reason],()=>{snapshot.accounts.find(row=>row.id===id).status=status;}),
    restoreAccount:id=>run('restore',[id],()=>{snapshot.accounts.find(row=>row.id===id).status='suspended';}),
    revokeSessions:id=>run('revokeSessions',[id],()=>{snapshot.accounts.find(row=>row.id===id).sessionVersion++;})
  };
  root.WFAccountAccess={ready:Promise.resolve(),service,requestLock:()=>calls.push({kind:'lock'})};
  const api=createUI(root);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();if(pending.length)await Promise.all(pending.splice(0));}};
  const byId=id=>document.getElementById(id);
  const buttonText=text=>byId('stab-accounts').querySelectorAll('button').find(node=>node.textContent===text);
  const input=(id,value,type='input')=>{const node=byId(id);assert(node,'missing '+id);node.value=value;node.dispatchEvent(new Event(type));return node;};
  return {root,api,calls,guards,document,byId,buttonText,input,settle,
    async open(){await settle();root.switchTab('accounts');await settle();},
    openDetail(id){byId('wfAccountsList').children.find(node=>node.dataset.accountId===id).querySelector('button').click();},
    snapshot:()=>structuredClone(snapshot),
    change(id,changes){Object.assign(snapshot.accounts.find(row=>row.id===id),changes);publish();},
    lock(){snapshot.currentAccount=null;publish();},
    emit(){publish();},
    failNext(code){fail=code;},
    hold(){barrier=new Promise(resolve=>{this.release=()=>{barrier=null;resolve();};});}
  };
}

test('owner bootstrap uses the shared settings actions and clears entered passwords after commit',async()=>{
  const f=fixture({configured:false});await f.open();
  f.input('wfAccount-name','Shop owner');f.input('wfAccount-username','shop.owner');
  const password=f.input('wfAccount-newPassword','long-password-123');const confirmation=f.input('wfAccount-confirmPassword','long-password-123');
  assert.equal(f.api.getSettingsActions().dirty,true);assert.equal(f.guards.get('accounts')(),true);
  f.api.getSettingsActions().save.click();await f.settle();
  assert.equal(f.calls[0].kind,'bootstrap');assert.equal(password.value,'');assert.equal(confirmation.value,'');
  assert.equal(f.snapshot().configured,true);assert.equal(f.api.view,'detail');assert.equal(f.api.getSettingsActions(),null);
  assert(!JSON.stringify(f.snapshot()).includes('long-password'));
});

test('editable presets normalize dependencies and submit precisely the selected grants',async()=>{
  const f=fixture();await f.open();f.byId('wfAccountsAdd').click();
  f.input('wfAccount-name','New carpenter');f.input('wfAccount-username','new.carpenter');
  f.input('wfAccount-role','carpentry','change');
  const view=f.byId('wfAccountPermission-manufacturing-view');view.checked=false;view.dispatchEvent({type:'change'});
  assert.equal(f.byId('wfAccountPermission-manufacturing-edit').checked,false);
  assert.equal(f.byId('wfAccountPermission-manufacturing-edit').disabled,true);
  assert.equal(f.byId('wfAccountPermission-accounts-view').disabled,true);
  const password=f.input('wfAccount-newPassword','employee-password-456');f.input('wfAccount-confirmPassword','employee-password-456');
  f.api.getSettingsActions().save.click();await f.settle();
  const payload=f.calls.find(call=>call.kind==='create').args[0];
  assert.equal(payload.role,'carpentry');assert(!payload.permissions.some(key=>key.startsWith('manufacturing.')));
  assert(!payload.permissions.some(key=>key.startsWith('accounts.')));assert.equal(password.value,'');
  assert.equal(f.snapshot().accounts.find(row=>row.username==='new.carpenter').name,'New carpenter');
});

test('the customer editor offers personal grants and disables the staff and administration controls',async()=>{
  const f=fixture();await f.open();f.byId('wfAccountsAdd').click();
  const roles=f.byId('wfAccount-role').options;
  assert(roles.some(option=>option.value==='customer'&&option.textContent==='Customer'));
  f.input('wfAccount-role','customer','change');
  for(const id of ['gallery-edit','orders-view','reports-view','finance-view','server-view']){
    const input=f.byId('wfAccountPermission-'+id);assert.equal(input.disabled,true);assert.equal(input.checked,false);
  }
  const fileExport=f.byId('wfAccountPermission-files-export');assert(!fileExport.disabled);assert(!fileExport.checked);
  assert.equal(f.byId('wfAccountPermission-myorders-edit').checked,true);
});

test('a protected customer promotion explains the separate managed login requirement',async()=>{
  const f=fixture();await f.open();f.change('worker-1',{role:'customer',permissions:policy.presets('customer')});
  f.openDetail('worker-1');f.byId('wfAccountEdit').click();f.input('wfAccount-role','owner','change');
  f.failNext('CUSTOMER_PRINCIPAL_ROLE_FIXED');f.api.getSettingsActions().save.click();await f.settle();
  assert(f.byId('stab-accounts').textContent.includes('Create a separate managed login for staff or owner access.'));
  assert.equal(f.snapshot().accounts.find(account=>account.id==='worker-1').role,'customer');
});

test('snapshot notifications preserve dirty controls and reject a stale edit until cancelled',async()=>{
  const f=fixture();await f.open();f.openDetail('worker-1');f.byId('wfAccountEdit').click();
  const name=f.input('wfAccount-name','Unsaved employee name');
  f.emit();assert.equal(f.byId('wfAccount-name'),name);assert.equal(name.value,'Unsaved employee name');
  f.change('worker-1',{name:'Changed in another window',updatedAt:'2026-11-21T12:02:00.000Z'});
  assert.equal(f.byId('wfAccount-name'),name);assert.equal(f.api.getSettingsActions().dirty,true);
  assert.equal(f.api.getSettingsActions().canSave,false);
  f.api.getSettingsActions().save.click();await f.settle();assert.equal(f.calls.length,0);
  f.api.getSettingsActions().cancel.click();assert.equal(f.api.view,'detail');
  assert(f.byId('stab-accounts').textContent.includes('Changed in another window'));
});

test('own password change requires the current password and clears secrets even when verification fails',async()=>{
  const f=fixture();await f.open();f.openDetail('owner-1');f.byId('wfAccountPassword').click();
  const old=f.input('wfAccount-currentPassword','old-owner-password');
  const password=f.input('wfAccount-newPassword','new-owner-password');const confirmation=f.input('wfAccount-confirmPassword','new-owner-password');
  const show=password.parentElement.querySelector('button');show.click();assert.equal(password.type,'text');
  f.failNext('LOGIN_FAILED');f.api.getSettingsActions().save.click();await f.settle();
  assert.equal(f.calls[0].kind,'changePassword');assert.equal(old.value,'');assert.equal(password.value,'');assert.equal(confirmation.value,'');
  assert.equal(password.type,'password');assert.equal(show.getAttribute('aria-pressed'),'false');
  assert(f.byId('stab-accounts').textContent.includes('Could not verify the current password.'));
  assert.equal(f.api.view,'password');
});

test('other-account password reset and reversible lifecycle changes use the explicit service actions',async()=>{
  const f=fixture();await f.open();f.openDetail('worker-1');f.byId('wfAccountPassword').click();
  assert.equal(f.byId('wfAccount-currentPassword'),null);
  f.input('wfAccount-newPassword','another-password-789');f.input('wfAccount-confirmPassword','another-password-789');
  f.api.getSettingsActions().save.click();await f.settle();
  assert.equal(f.calls[0].kind,'setPassword');assert.equal(f.calls[0].args[0],'worker-1');
  f.buttonText('Delete account').click();assert.equal(f.calls.length,1,'confirmation must precede mutation');
  f.input('wfAccountReason','Employee left');f.byId('wfAccountConfirm').click();await f.settle();
  assert.deepEqual(f.calls[1].args,['worker-1','deleted','Employee left']);
  f.buttonText('Recover account').click();f.byId('wfAccountConfirm').click();await f.settle();
  assert.equal(f.calls[2].kind,'restore');assert.equal(f.snapshot().accounts.find(row=>row.id==='worker-1').status,'suspended');
});

test('losing the owner session during a pending action clears secrets and replaces the editor with sign-in',async()=>{
  const f=fixture();await f.open();f.openDetail('worker-1');f.byId('wfAccountPassword').click();
  const password=f.input('wfAccount-newPassword','another-password-789');f.input('wfAccount-confirmPassword','another-password-789');
  f.hold();f.failNext('AUTH_REQUIRED');f.api.getSettingsActions().save.click();f.lock();
  assert.equal(password.value,'');f.release();await f.settle();
  assert.equal(f.byId('wfAccountPasswordEditor'),null);
  assert(f.byId('stab-accounts').textContent.includes('Sign in to manage accounts'));
  assert.equal(f.api.getSettingsActions(),null);
});
