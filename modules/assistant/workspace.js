(function(root){
  'use strict';
  const C=root.WFAssistantCore,registry=root.WFModules;
  if(!C||!registry)return;
  const emptyKey={search:'noSearch',checks:'noChecks',report:'noReport',chat:'noChat'};
  const eligibleDocs=['products','customers','invoices'];
  function mount({container,api,lang='ar',params={}}){
    const doc=container.ownerDocument||document,session=api.getSession(),scope=C.scopeKey(session);
    if(!scope||!api.can('assistant.view'))throw Error('AUTH_REQUIRED');
    const receiptStorage='wow.assistant.requests.'+[session.workspaceId,session.userId,session.sessionVersion].join('.');
    let language=lang,state=null,rooms=null,mode='',generation=0,roomGeneration=0,disposed=false;
    let preview=null,answer=null,busy='',notice='',expiryTimer,focusDirty=false,loadingRooms=false,expiredRequest=null;
    const draft={query:'',source:'all',month:new Date().toISOString().slice(0,7),roomId:'',focus:''};
    const checked=new Set(),pending=new Map();
    function el(tag,cls,value){
      const node=doc.createElement(tag);
      if(cls)node.className=cls;if(value!=null)node.textContent=String(value);
      return node;
    }
    const tr=k=>C.t(k,language);
    const main=el('section','wf-assistant'),stateBar=el('div','wf-ai-state'),nav=el('div','wf-ai-modes'),
      form=el('form','wf-ai-form wf-ops-card'),status=el('p','wf-ai-status'),output=el('section','wf-ai-output');
    nav.setAttribute('role','group');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    main.append(stateBar,nav,form,status,output);container.replaceChildren(main);
    const alive=()=>!disposed&&C.scopeKey(api.getSession())===scope&&api.can('assistant.view');
    const grants=()=>Object.fromEntries(Object.entries(C.permissions).map(([source,perm])=>[source,!!state?.sources?.[source]&&api.can(perm)]));
    const same=id=>alive()&&generation===id;
    function resetEvidence(){
      ++generation;root.clearTimeout(expiryTimer);preview=null;answer=null;checked.clear();busy='';notice='';output.replaceChildren();
    }
    async function request(action,payload={}){
      if(!alive())throw Error('AUTH_REQUIRED');
      const result=await api.request(action,payload);
      if(!alive())throw Error('AUTH_REQUIRED');
      return result;
    }
    function showError(error){
      const key=C.errorKey(error?.code||error?.message);
      if(['denied','changed','expired'].includes(key)){
        resetEvidence();
        if(key==='denied'){rooms=null;++roomGeneration;loadingRooms=false;draft.roomId='';}
      }
      notice=key;busy='';draw();
    }
    function btn(label,click,cls=''){
      const node=el('button','btn '+cls,label);node.type='button';
      node.addEventListener('click',()=>{if(!node.disabled&&alive())Promise.resolve().then(click).catch(error=>{if(alive())showError(error);});});
      return node;
    }
    function field(caption,control){
      const node=el('label','wf-ai-field');node.append(el('span','',caption),control);return node;
    }
    function select(id,options,value,onChange){
      const node=el('select');node.dataset.field=id;
      for(const [key,label] of options){const item=el('option','',label);item.value=key;node.append(item);}
      node.value=value;node.disabled=!!busy;
      node.addEventListener('change',()=>onChange(node.value));return node;
    }
    function input(id,type,max){
      const node=el('input');node.dataset.field=id;node.type=type;node.maxLength=max;node.value=draft[id];node.disabled=!!busy;
      node.addEventListener('input',()=>{
        draft[id]=node.value;resetEvidence();drawOutput();drawStatus();
      });
      return node;
    }
    function spec(){
      if(mode==='chat')return {mode,roomId:draft.roomId};
      if(mode==='report')return {mode,month:draft.month};
      return mode==='search'?{mode,source:draft.source,query:draft.query.trim()}:{mode,source:draft.source};
    }
    function armExpiry(){
      root.clearTimeout(expiryTimer);
      if(!preview)return;
      const expires=preview.rows.filter(r=>r.expiresAt).map(r=>Date.parse(r.expiresAt)).filter(Number.isFinite);
      const delay=Math.max(0,Math.min(60000,...expires.map(at=>at-Date.now())));
      expiryTimer=root.setTimeout(()=>{if(!alive())return;resetEvidence();notice='fresh';draw();},delay);
    }
    async function inspect(){
      if(busy||!mode)return;
      if(expiredRequest){forget(expiredRequest);expiredRequest=null;}
      resetEvidence();const id=generation;busy='loading';draw();
      try{
        const result=await request('assistant.inspect',spec());
        if(!same(id))return;
        if(result.rows.some(row=>!grants()[row.source]))throw Error('ACCESS_DENIED');
        preview={fingerprint:result.fingerprint,rows:result.rows,more:result.more};answer=null;
        for(const row of preview.rows)checked.add(row.ref);
        busy='';draw();armExpiry();
      }catch(error){if(same(id))showError(error);}
    }
    form.addEventListener('submit',event=>{event.preventDefault();if(alive())inspect();});
    // Only digests and random UUIDs survive a tab reload. A lost acknowledgment reuses the same reservation.
    function receipts(){
      try{
        const parsed=JSON.parse(root.sessionStorage.getItem(receiptStorage)||'[]');
        for(const [k,id] of Array.isArray(parsed)?parsed:[]){
          if(/^[a-f0-9]{64}$/.test(k)&&typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id))pending.set(k,id);
        }
      }catch{}
    }
    receipts();
    function persist(){
      while(pending.size>32)pending.delete(pending.keys().next().value);
      try{root.sessionStorage.setItem(receiptStorage,JSON.stringify([...pending]));}catch{}
    }
    function forget(key){pending.delete(key);persist();}
    async function remember(payload){
      const bytes=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
      const digest=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(!alive())throw Error('AUTH_REQUIRED');
      const id=pending.get(digest)||root.crypto.randomUUID();
      pending.set(digest,id);persist();return {digest,id};
    }
    async function analyze(){
      if(busy||!preview||!checked.size||!state?.provider?.configured)return;
      const id=++generation,data={...spec(),fingerprint:preview.fingerprint,
        refs:preview.rows.filter(r=>checked.has(r.ref)).map(r=>r.ref),lang:language,focus:draft.focus.trim()};
      busy='working';answer=null;notice='';draw();
      let receipt;
      try{
        receipt=await remember(data);if(!same(id))return;
        const result=await request('assistant.generate',{...data,requestId:receipt.id});
        if(!same(id))return;
        if(result.fingerprint!==preview?.fingerprint)throw Error('AI_EVIDENCE_CHANGED');
        answer=result.answer;busy='';focusDirty=false;
        if(!result.cached)state.usedToday=Math.min(state.dailyLimit,state.usedToday+1);
        // The server confirmed a real response for this account. A fresh status read supplies the authoritative date.
        draw();
        try{const next=await request('assistant.status');if(same(id)){state=next;drawState();}}catch{}
      }catch(error){
        if(!same(id))return;
        const key=C.errorKey(error?.code||error?.message);
        if(receipt&&key==='upstream')forget(receipt.digest);
        if(receipt&&key==='expired')expiredRequest=receipt.digest;
        showError(error);
      }
    }
    async function loadRooms(){
      if(loadingRooms||rooms||!grants().chat)return;
      const run=++roomGeneration;loadingRooms=true;drawForm();
      try{
        const result=await request('assistant.rooms');if(!alive()||run!==roomGeneration)return;
        rooms=result.rooms;
        if(!rooms.some(r=>r.id===draft.roomId))draft.roomId='';
        loadingRooms=false;draw();
      }catch(error){if(alive()&&run===roomGeneration){loadingRooms=false;showError(error);}}
    }
    async function initialize(){
      resetEvidence();const id=generation;busy='loading';draw();
      try{
        const next=await request('assistant.status');if(!same(id))return;
        state=next;const available=C.modes(grants());
        mode=available.includes(params.mode)?params.mode:available[0]||'';
        if(mode==='chat'&&typeof params.roomId==='string')draft.roomId=params.roomId;
        busy='';draw();if(mode==='chat')await loadRooms();
      }catch(error){if(same(id))showError(error);}
    }
    function changeMode(next){
      if(next===mode)return;
      resetEvidence();mode=next;draw();if(mode==='chat')loadRooms();
    }
    function drawState(){
      stateBar.replaceChildren();stateBar.hidden=!state;
      if(!state)return;
      const configured=state.provider?.configured===true;
      const first=el('p','wf-ai-provider',tr(configured?'aiReady':'aiOff'));
      if(configured&&state.provider.lastSuccessAt){
        const when=new Date(state.provider.lastSuccessAt);
        if(Number.isFinite(when.valueOf()))first.append(el('small','',tr('verified')+' · '+when.toLocaleString(language)));
      }
      stateBar.append(first);
      if(configured)stateBar.append(el('span','wf-ai-quota',tr('quota')+' · '+state.usedToday+' / '+state.dailyLimit));
    }
    function drawForm(){
      nav.replaceChildren();form.replaceChildren();
      const allowed=grants(),available=C.modes(allowed);
      nav.hidden=!available.length;form.hidden=!available.length;nav.setAttribute('aria-label',tr('title'));
      if(!available.length)return;
      if(!available.includes(mode))mode=available[0];
      for(const key of available){
        const node=btn(tr(key),()=>changeMode(key),'wf-ai-mode');
        node.setAttribute('aria-pressed',String(mode===key));node.disabled=!!busy;nav.append(node);
      }
      form.append(el('p','wf-ai-help',tr(mode+'Help')));
      const fields=el('div','wf-ai-fields');form.append(fields);
      if(mode==='chat'){
        if(rooms&&!rooms.some(r=>r.id===draft.roomId))draft.roomId='';
        const options=[['',tr('pick')],...(rooms||[]).map(room=>[room.id,room.name||tr(room.kind)])];
        const chooser=select('roomId',options,draft.roomId,value=>{draft.roomId=value;resetEvidence();draw();});
        chooser.required=true;chooser.disabled=!!busy||loadingRooms||!rooms?.length;fields.append(field(tr('room'),chooser));
        if(!rooms&&!loadingRooms&&!busy)fields.append(btn(tr('retry'),loadRooms));
        if(rooms&&!rooms.length)fields.append(el('p','wf-ai-help',tr('noRooms')),btn(tr('open'),()=>api.open('chat')));
      }else if(mode==='report'){
        const node=input('month','month',7);node.required=true;fields.append(field(tr('month'),node));
      }else{
        const options=['all',...eligibleDocs.filter(source=>allowed[source])].map(key=>[key,tr(key)]);
        if(!options.some(([key])=>key===draft.source))draft.source='all';
        fields.append(field(tr('source'),select('source',options,draft.source,value=>{draft.source=value;resetEvidence();draw();})));
        if(mode==='search'){
          const term=input('query','search',80);term.required=true;term.minLength=2;fields.append(field(tr('query'),term));
        }
      }
      const run=el('button','btn wf-ai-primary',tr('run'));run.type='submit';run.disabled=!!busy||(mode==='chat'&&(!rooms||!draft.roomId));
      fields.append(run);
    }
    function drawStatus(){
      status.replaceChildren();status.hidden=false;
      if(busy||notice)status.textContent=tr(busy||notice);
      else if(state&&!C.modes(grants()).length)status.textContent=tr('noSource');
      else status.hidden=true;
      if(!state&&!busy)status.append(btn(tr('retry'),initialize));
    }
    function gotoSource(row){
      if(!grants()[row.source])return;
      const args=row.source==='chat'?{roomId:draft.roomId}:row.source==='finance'?{tab:'reports'}:{};
      api.open(C.routes[row.source],args);
    }
    function jump(ref){
      const target=output.querySelector('[data-ref="'+ref+'"]');
      target?.focus?.();target?.scrollIntoView?.({block:'nearest'});
    }
    function reference(ref){return btn(ref,()=>jump(ref),'wf-ai-ref');}
    function heading(row){
      if(row.source==='finance')return row.currency+' · '+row.month;
      if(row.source==='chat')return row.title||tr('chat');
      return row.title||tr(row.source);
    }
    function evidenceCard(row){
      const card=el('article','wf-ai-card');card.dataset.ref=row.ref;card.tabIndex=-1;
      const title=el('div','wf-ai-card-title');
      if(state.provider.configured){
        const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=checked.has(row.ref);checkbox.disabled=!!busy;
        checkbox.setAttribute('aria-label',tr('selected')+' · '+row.ref+' · '+heading(row));
        checkbox.addEventListener('change',()=>{
          checkbox.checked?checked.add(row.ref):checked.delete(row.ref);answer=null;drawOutput();
        });title.append(checkbox);
      }
      title.append(el('bdi','wf-ai-code',row.ref),el('h3','',heading(row)));card.append(title);
      if(row.source==='finance'){
        const list=el('dl','wf-ai-values');
        for(const key of ['inflow','outflow','net','entries']){
          const value=key==='entries'?new Intl.NumberFormat(language).format(BigInt(row.entries)):C.amount(row[key],row.currency,language);
          const cell=el('div');cell.append(el('dt','',tr(key)),el('dd','',value));list.append(cell);
        }
        card.append(list,el('p','wf-ai-finding',tr(row.finding)));
      }else if(row.source==='chat'){
        card.append(el('p','wf-ai-excerpt',row.text),el('small','',[
          new Date(row.at).toLocaleString(language),tr('record')+' '+row.record,row.truncated?tr('clipped'):''].filter(Boolean).join(' · ')));
      }else{
        const desc=[tr(row.source),tr('record')+' '+row.record,row.detail,row.barcode?tr('barcode')+' '+row.barcode:''];
        card.append(el('small','',desc.filter(Boolean).join(' · ')));
        if(row.finding!=='match')card.append(el('p','wf-ai-finding',tr(row.finding)));
      }
      card.append(btn(tr('open'),()=>gotoSource(row),'wf-ai-link'));return card;
    }
    function drawAnswer(){
      const panel=el('section','wf-ai-answer wf-ops-card');
      panel.append(el('h3','',tr(mode==='chat'?'summary':'highlights')));
      if(!answer.notes.length)panel.append(el('p','',tr('insufficient')));
      for(const note of answer.notes){
        const piece=el('div','wf-ai-note');
        if(mode==='chat'){piece.append(el('span','',note.summary));for(const ref of note.refs)piece.append(reference(ref));}
        else{
          const row=preview.rows.find(r=>r.ref===note.ref);if(!row)continue;
          const desc=row.source==='finance'?tr(row.finding)+' '+C.amount(row.net,row.currency,language):
            [heading(row),row.finding==='match'?row.detail:tr(row.finding)].filter(Boolean).join(' · ');
          piece.append(el('span','',desc),reference(row.ref));
        }
        panel.append(piece);
      }
      return panel;
    }
    function drawOutput(){
      output.replaceChildren();if(!preview)return;
      output.append(el('h2','wf-ai-output-title',tr('evidence')+' · '+new Intl.NumberFormat(language).format(preview.rows.length)));
      if(!preview.rows.length){output.append(el('p','wf-ai-empty',tr(emptyKey[mode])));return;}
      if(mode==='chat'){
        const questions=preview.rows.filter(row=>/[?؟？]/u.test(row.text));
        if(questions.length){const line=el('p','wf-ai-note',tr('questions'));for(const row of questions)line.append(reference(row.ref));output.append(line);}
      }
      const grid=el('div','wf-ai-evidence');for(const row of preview.rows)grid.append(evidenceCard(row));output.append(grid);
      if(preview.more)output.append(el('p','wf-ai-help',tr('more')));
      if(state.provider.configured){
        const model=el('div','wf-ops-card wf-ai-analysis'),focus=el('textarea');
        focus.rows=2;focus.maxLength=240;focus.dataset.field='focus';focus.value=draft.focus;focus.disabled=!!busy;
        focus.addEventListener('input',()=>{draft.focus=focus.value;focusDirty=!!draft.focus.trim();answer=null;output.querySelector('.wf-ai-answer')?.remove();});
        const send=btn(tr('send'),analyze,'wf-ai-primary');send.disabled=!!busy||!checked.size;
        model.append(field(tr('focus'),focus),el('p','wf-ai-help',tr('share')),el('small','',tr('selected')+' · '+checked.size+' / '+preview.rows.length),send);
        output.append(model);
      }
      if(answer)output.append(drawAnswer());
    }
    function draw(){if(!alive())return;main.dir=language==='ar'?'rtl':'ltr';drawState();drawForm();drawStatus();drawOutput();}
    function conceal(){
      if(!alive()){dispose();return;}
      resetEvidence();rooms=null;++roomGeneration;loadingRooms=false;notice='fresh';draw();
    }
    function visibility(){
      if(doc.hidden){conceal();return;}
      if(!alive()){dispose();return;}
      if(state&&mode==='chat'&&!rooms)loadRooms();
    }
    function rights(){
      if(!alive()){dispose();return;}
      if(preview?.rows.some(row=>!grants()[row.source])){conceal();return;}
      if(rooms&&!grants().chat){conceal();return;}
    }
    function dispose(){
      if(disposed)return;disposed=true;resetEvidence();++roomGeneration;
      root.removeEventListener('wf-cloud-session-change',rights);root.removeEventListener('wf-account-access-change',rights);
      root.removeEventListener('offline',conceal);doc.removeEventListener('visibilitychange',visibility);
      state=rooms=null;draft.focus='';draft.query='';draft.roomId='';pending.clear();main.remove();
    }
    doc.addEventListener('visibilitychange',visibility);
    root.addEventListener('offline',conceal);root.addEventListener('wf-cloud-session-change',rights);root.addEventListener('wf-account-access-change',rights);
    initialize();
    return {dispose,updateLanguage(next){
      const pick=C.locales.includes(next)?next:'en';if(pick===language)return;
      if(busy==='working'){++generation;busy='';}
      language=pick;answer=null;draw();
    },hasUnsavedChanges(){return focusDirty||busy==='working';}};
  }
  registry.register({id:'assistant',permission:'assistant.view',icon:'review',
    title:Object.fromEntries(C.locales.map(lang=>[lang,C.t('title',lang)])),mount});
})(typeof window==='object'?window:globalThis);
