(function(root){
 'use strict';
 const modules=root.WFModules,core=root.WFCommunicationsCore;if(!modules||!core)return;
 modules.register({id:'communications',permission:'communications.view',icon:'message-circle',
  title:{ar:'مراسلات العملاء',en:'Customer correspondence',tr:'Müşteri yazışmaları',fr:'Correspondance clients',ru:'Переписка с клиентами'},
  mount({container,api,locale,params={}}){
   const doc=container.ownerDocument||root.document;
   let disposed=false,loading=false,generation=0,messages=[],templates=[],service={},more=false,dialog=null,dialogScope=0;
   const selected=new Set(),query={offset:0,search:'',status:'',channel:'',limit:25};
   const t=key=>core.text(key,locale()),can=cap=>api.can('communications.'+cap);
   const el=(tag,cls='',text)=>{const node=doc.createElement(tag);node.className=cls;if(text!=null)node.textContent=text;return node;};
   const button=(key,run,cls='')=>{const b=el('button','wf-mail-button '+cls,t(key));b.type='button';b.addEventListener('click',run);return b;};
   const field=(title,input)=>{const label=el('label','wf-mail-field',title);label.append(input);return label;};
   const input=(value='',max=200,type='text')=>{const node=el('input');node.type=type;node.value=value;node.maxLength=max;node.dir='auto';return node;};
   const area=(value='',max=10000)=>{const node=el('textarea');node.value=value;node.maxLength=max;node.rows=8;node.dir='auto';return node;};
   const select=(options,value)=>{const node=el('select');for(const [id,title] of options){const option=el('option','',title);option.value=id;node.append(option);}node.value=value??options[0]?.[0]??'';return node;};
   const date=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?new Intl.DateTimeFormat(locale(),{dateStyle:'medium',timeStyle:'short'}).format(n):'';};
   const status=el('p','wf-mail-status');status.setAttribute('role','status');
   const title=el('header','wf-mail-header'),body=el('div','wf-mail-list'),tools=el('div','wf-mail-actions'),filters=el('form','wf-mail-filters');
   const section=el('section','wf-mail');section.append(title,tools,filters,status,body);container.append(section);
   const alive=scope=>!disposed&&(scope==null||scope===dialogScope);
   async function call(action,data={}){if(disposed)throw Error('AUTH_REQUIRED');const result=await api.request('communications.'+action,data);if(disposed)throw Error('AUTH_REQUIRED');return result;}
   function problem(node,error){if(!disposed)node.textContent=t(error?.code==='INVALID_RECIPIENT_CONTACT'?'noContact':error?.code==='MAIL_NOT_CONFIGURED'?'unconfigured':'failedAction');}
   function close(){dialogScope++;dialog?.close?.();dialog?.remove();dialog=null;}
   function modal(caption){
    close();const scope=dialogScope,node=el('dialog','wf-mail-dialog'),head=el('header','wf-mail-dialog-head'),content=el('div','wf-mail-dialog-body');
    head.append(el('h3','',caption),button('close',close));node.append(head,content);container.append(node);dialog=node;
    node.addEventListener('cancel',event=>{event.preventDefault();close();});node.showModal?.();
    return {node,content,scope};
   }
   function paint(){
    if(disposed)return;title.replaceChildren(el('h2','',t('title')),el('p','',t('intro')));
    tools.replaceChildren();if(can('edit'))tools.append(button('compose',()=>compose()),button('templates',()=>manageTemplates()));
    tools.append(button('refresh',()=>load()));
    if(can('delete')&&selected.size)tools.append(button('removeSelected',()=>confirmDelete([...selected])));
    tools.append(el('small','wf-mail-muted',t(service.provider?.configured?'configured':'unconfigured')));
    if(service.pending)tools.append(el('small','',t('pending')+': '+service.pending));
    filters.replaceChildren();const search=input(query.search,100,'search'),channel=select(['','email','whatsapp','mail','share'].map(k=>[k,t(k||'all')]),query.channel),
     state=select(['','draft','prepared','queued','sending','retry','accepted','delivered','delayed','bounced','complained','failed','uncertain','cancelled','suppressed'].map(k=>[k,t(k||'all')]),query.status);
    const apply=()=>{query.search=search.value;query.channel=channel.value;query.status=state.value;return load();};
    filters.append(field(t('search'),search),field(t('channel'),channel),field(t('all'),state),button('find',apply));
    filters.onsubmit=event=>{event.preventDefault();return apply();};
    body.replaceChildren();if(!messages.length)body.append(el('p','wf-mail-empty',t('empty')));
    for(const row of messages){
     const card=el('article','wf-mail-card'),head=el('div','wf-mail-card-head'),name=row.recipient?.company||row.recipient?.name||row.recipient?.order||'';
     if(can('delete')){const check=input('',1,'checkbox');check.checked=selected.has(row.id);check.setAttribute('aria-label',t('choose')+' '+name);
      check.addEventListener('change',()=>{if(check.checked&&selected.size<50)selected.add(row.id);else selected.delete(row.id);paint();});head.append(check);}
     head.append(el('h3','',row.subject||name),el('span','wf-mail-badge '+row.status,t(row.status)));card.append(head,
      el('p','',name+' · '+t(row.channel)),el('time','wf-mail-muted',date(row.createdAt)),el('p','wf-mail-excerpt',row.body));
     const actions=el('div','wf-mail-actions');actions.append(button('detail',()=>detail(row.id)));
     if(can('delete'))actions.append(button('remove',()=>confirmDelete([row.id])));card.append(actions);body.append(card);
    }
    if(more)body.append(button('more',()=>load(true)));
   }
   async function load(append=false){
    if(disposed||loading)return;loading=true;const run=++generation;status.textContent=t('busy');
    if(!append){query.offset=0;selected.clear();}else query.offset=messages.length;
    try{const [archive,settings,patterns]=await Promise.all([call('list',query),call('status'),call('templates')]);
     if(disposed||run!==generation)return;messages=append?messages.concat(archive.items):archive.items;more=archive.more;service=settings;templates=patterns.items;status.textContent='';paint();
    }catch(error){problem(status,error);}finally{loading=false;}
   }
   async function detail(id){
    const view=modal(t('detail')),note=el('p');view.content.append(note);note.textContent=t('busy');
    try{const {message}=await call('detail',{id});if(!alive(view.scope))return;
     view.content.replaceChildren(el('h4','',message.subject),el('span','wf-mail-badge '+message.status,t(message.status)),
      el('p','',message.recipient?.company||message.recipient?.name||''),el('p','',message.recipient?.email||message.recipient?.phone||''),el('pre','wf-mail-message',message.body));
     if(message.status==='uncertain')view.content.append(el('p','wf-mail-warning',t('uncertainNote')));
     if(message.channel!=='email'&&message.status==='prepared')shareControls(view.content,message,view.scope);
     const actions=el('div','wf-mail-actions');
     if(can('edit')&&['draft','prepared'].includes(message.status))actions.append(button('edit',()=>compose(message.source,message)));
     if(message.channel==='email'&&!['draft','prepared'].includes(message.status))actions.append(button('verify',async()=>{
      const note=el('p');actions.append(note);try{await call('reconcile',{id});if(alive(view.scope)){await load();detail(id);}}catch(error){if(alive(view.scope))problem(note,error);}
     }));
     if(can('delete')&&message.status==='queued'&&message.attempts===0)actions.append(button('cancel',async()=>{
      const note=el('p');actions.append(note);try{await call('cancel',{id,version:message.version,commandId:root.crypto.randomUUID()});if(alive(view.scope)){close();await load();}}catch(error){if(alive(view.scope))problem(note,error);}
     }));
     view.content.append(actions);
    }catch(error){if(alive(view.scope))problem(note,error);}
   }
   function shareControls(holder,message,scope){
    holder.append(el('p','wf-mail-muted',t('readyShare')));
    const link=core.shareURL(message);
    if(link){const a=el('a','wf-mail-button wf-mail-primary',t('open'));a.href=link;a.target='_blank';a.rel='noopener noreferrer';holder.append(a);}
    else if(typeof root.navigator?.share==='function')holder.append(button('share',async()=>{
     if(!alive(scope))return;try{await root.navigator.share({title:message.subject,text:message.body});}catch(error){if(error?.name!=='AbortError'&&alive(scope))problem(holder,error);}
    },'wf-mail-primary'));
    if(typeof root.navigator?.clipboard?.writeText==='function')holder.append(button('copy',async()=>{
     if(!alive(scope))return;await root.navigator.clipboard.writeText(message.body);if(alive(scope))holder.append(el('small','',t('copied')));
    }));
   }
   async function compose(sourceHint,existing){
    if(!can('edit'))return;const view=modal(t('compose')),form=el('form','wf-mail-form'),note=el('p','wf-mail-status');note.setAttribute('role','status');
    const sourceKinds=['company','order'].filter(k=>api.can(k==='company'?'customers.view':'orders.view'));
    const kind=select(sourceKinds.map(k=>[k,t(k)]),sourceHint?.kind),search=input('',100,'search'),people=select([['',t('choose')]],''),recipient=el('div','wf-mail-recipient');
    const channel=select(['email','whatsapp','mail','share'].map(k=>[k,t(k)]),existing?.channel||'email'),language=select(core.locales.map(k=>[k,new Intl.DisplayNames([locale()],{type:'language'}).of(k)]),existing?.language||locale());
    const pattern=select([['',t('custom')]],''),subject=input(existing?.subject||'',200),bodyText=area(existing?.body||''),actions=el('div','wf-mail-actions'),prepared=el('div','wf-mail-prepared');
    let contact=null,current=existing||null,dirty=!existing,saving=false,saveAttempt=null,sendAttempt=null,contactGeneration=0;
    const draftId=existing?.id||root.crypto.randomUUID();
    function preview(){recipient.replaceChildren();if(contact)recipient.append(el('strong','',contact.company||contact.name),el('p','',contact.email||''),el('p','',contact.phone||''),el('p','',contact.order||''));}
    function patterns(){pattern.replaceChildren();for(const row of [{id:'',name:t('custom')},...core.templates(language.value),...templates.filter(x=>x.language===language.value)]){
      const option=el('option','',row.name);option.value=row.id;pattern.append(option);}pattern.value='';}
    function changed(){dirty=true;sendAttempt=null;prepared.replaceChildren();buttons();}
    for(const node of [subject,bodyText,channel,language])node.addEventListener('input',changed);
    channel.addEventListener('change',changed);language.addEventListener('change',()=>{patterns();changed();});
    pattern.addEventListener('change',()=>{const selected=[...core.templates(language.value),...templates].find(x=>x.id===pattern.value);if(selected){subject.value=core.render(selected.subject,contact);bodyText.value=core.render(selected.body,contact);changed();}});
    async function choose(){const run=++contactGeneration;if(!people.value){contact=null;preview();changed();return;}
     try{const value=JSON.parse(people.value),res=await call('recipient',{source:value});if(alive(view.scope)&&run===contactGeneration){contact=res.contact;preview();changed();}}catch(error){if(alive(view.scope))problem(note,error);}}
    people.addEventListener('change',choose);
    async function find(){const run=++contactGeneration;
     try{const res=await call('contacts',{kind:kind.value,search:search.value,limit:50});if(!alive(view.scope)||run!==contactGeneration)return;
      people.replaceChildren();const first=el('option','',t('choose'));first.value='';people.append(first);
      for(const row of res.items){const option=el('option','',(row.company||row.name)+(row.order?' · '+row.order:''));option.value=JSON.stringify({kind:row.kind,id:row.id});people.append(option);}people.value='';contact=null;preview();changed();
     }catch(error){if(alive(view.scope))problem(note,error);}}
    kind.addEventListener('change',find);
    function payload(){if(!contact)throw Error('INVALID_RECIPIENT_CONTACT');return {id:draftId,version:current?.version||0,source:{kind:contact.kind,id:contact.id},channel:channel.value,language:language.value,subject:subject.value,body:bodyText.value};}
    async function save(){
     if(saving||!alive(view.scope))return;saving=true;buttons();note.textContent=t('busy');
     try{const data=payload(),key=JSON.stringify(data);if(saveAttempt?.key!==key)saveAttempt={key,id:root.crypto.randomUUID()};
      const res=await call('save',{...data,commandId:saveAttempt.id});if(!alive(view.scope))return;
      current=res.message;contact=current.recipient;dirty=false;saveAttempt=null;sendAttempt=null;preview();note.textContent=t('saved');await load();
     }catch(error){if(alive(view.scope))problem(note,error);}finally{saving=false;if(alive(view.scope))buttons();}
    }
    async function transmit(){
     if(saving||dirty||!current||!alive(view.scope))return;saving=true;buttons();note.textContent=t('busy');
     const action=current.channel==='email'?'send':'prepare';sendAttempt??=root.crypto.randomUUID();
     try{const res=await call(action,{id:current.id,version:current.version,commandId:sendAttempt});if(!alive(view.scope))return;
      current=res.message;note.textContent=t(current.status);prepared.replaceChildren();
      if(current.status==='prepared')shareControls(prepared,current,view.scope);
      if(current.status==='uncertain')prepared.append(el('p','wf-mail-warning',t('uncertainNote')));
      await load();
     }catch(error){if(alive(view.scope))problem(note,error);}finally{saving=false;if(alive(view.scope))buttons();}
    }
    function buttons(){actions.replaceChildren();const frozen=current&&!['draft','prepared'].includes(current.status);
     for(const node of [kind,search,people,channel,language,pattern,subject,bodyText])node.disabled=!!frozen||saving;
     if(frozen)return;
     const saveButton=button('save',save,'wf-mail-primary');saveButton.disabled=saving||!contact;actions.append(saveButton);
     if(can('export')&&current&&['draft','prepared'].includes(current.status)){
      const sendButton=button(current.channel==='email'?'send':'prepare',transmit,'wf-mail-primary');sendButton.disabled=saving||dirty||current.channel==='email'&&service.provider?.configured!==true;actions.append(sendButton);
     }
    }
    form.append(field(t('source'),kind),field(t('find'),search),button('find',find),field(t('recipient'),people),recipient,
     field(t('channel'),channel),field(t('language'),language),field(t('templates'),pattern),field(t('subject'),subject),field(t('body'),bodyText),note,actions,prepared);
    form.onsubmit=event=>{event.preventDefault();save();};view.content.append(form);patterns();buttons();
    if(sourceHint){try{const res=await call('recipient',{source:sourceHint});if(alive(view.scope)){contact=res.contact;const option=el('option','',contact.company||contact.name);option.value=JSON.stringify(sourceHint);people.append(option);people.value=option.value;preview();buttons();}}catch(error){if(alive(view.scope))problem(note,error);}}
    else if(sourceKinds.length)await find();
   }
   function confirmDelete(ids){
    if(!can('delete'))return;const view=modal(t('remove')),note=el('p');view.content.append(el('p','',t('deleteConfirm')),note);
    const commandId=root.crypto.randomUUID(),remove=button('confirm',async()=>{remove.disabled=true;
     try{await call('delete',{ids,commandId});if(alive(view.scope)){close();await load();}}catch(error){if(alive(view.scope)){problem(note,error);remove.disabled=false;}}
    },'wf-mail-danger');view.content.append(remove);
   }
   function manageTemplates(existing){
    if(!can('edit'))return;const view=modal(t('templates')),form=el('form','wf-mail-form'),name=input(existing?.name||'',80),
     language=select(core.locales.map(k=>[k,k]),existing?.language||locale()),subject=input(existing?.subject||'',200),body=area(existing?.body||''),note=el('p');
    if(!existing)for(const item of templates){const row=el('div','wf-mail-actions');row.append(el('span','',item.name+' · '+item.language),button('edit',()=>manageTemplates(item)));view.content.append(row);}
    form.append(field(t('templateName'),name),field(t('language'),language),field(t('subject'),subject),field(t('body'),body),el('small','wf-mail-muted',t('templateHint')),note);
    const id=existing?.id||root.crypto.randomUUID();let attempt=null,busy=false;
    async function save(){if(busy)return;busy=true;
     const data={id,version:existing?.version||0,name:name.value,language:language.value,subject:subject.value,body:body.value},key=JSON.stringify(data);
     if(attempt?.key!==key)attempt={key,id:root.crypto.randomUUID()};
     try{await call('template.save',{...data,commandId:attempt.id});if(alive(view.scope)){close();await load();}}catch(error){if(alive(view.scope))problem(note,error);}finally{busy=false;}}
    form.onsubmit=event=>{event.preventDefault();save();};form.append(button('templateSave',save,'wf-mail-primary'));
    if(existing&&can('delete')){const commandId=root.crypto.randomUUID();form.append(button('remove',async()=>{
     try{await call('template.delete',{id,version:existing.version,commandId});if(alive(view.scope)){close();await load();}}catch(error){if(alive(view.scope))problem(note,error);}
    }));}
    view.content.append(form);
   }
   paint();load().then(()=>{if(!disposed&&params.source&&can('edit'))compose(params.source);});
   return {dispose(){disposed=true;generation++;close();container.replaceChildren();},updateLanguage(){close();paint();},hasUnsavedChanges:()=>!!dialog};
  }
 });
})(typeof window==='object'?window:globalThis);
