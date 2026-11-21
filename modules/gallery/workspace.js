(function(root){
  'use strict';
  const core=root.WFGalleryCore,exportsApi=root.WFGalleryExports,registry=root.WFModules,doc=root.document;
  if(!core||!exportsApi||!registry||!doc||root.WFGallery)return;
  const statuses=['pending','manufacturing','ready','delivered','cancelled'];
  const routes={gallery:['gallery','gallery.view','images'],'gallery-orders':['orders','orders.view','clipboard-list'],
    'my-orders':['mine','myorders.view','package-open'],'gallery-studio':['studio','gallery.edit','sliders-horizontal']};
  const error=code=>Object.assign(new Error(code),{code});
  function el(tag,cls='',text){
    const node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;
  }
  function field(title,node){
    const wrap=el('label','wfg-field');wrap.append(el('span','',title),node);return wrap;
  }
  function input(value='',type='text',maxLength=180){
    const node=el('input');node.type=type;node.value=value??'';node.maxLength=maxLength;return node;
  }
  function numeric(value,min,max,step=1){
    const node=input(value,'number');node.min=min;node.max=max;node.step=step;return node;
  }
  function textArea(value='',limit=1200){const node=el('textarea');node.rows=3;node.maxLength=limit;node.value=value;return node;}
  function select(items,value){
    const node=el('select');for(const [id,caption] of items){const option=el('option','',caption);option.value=id;node.append(option);}
    node.value=value??'';return node;
  }
  function toggle(label,checked=false){
    const node=input('','checkbox');node.checked=checked;const wrap=el('label','wfg-check');wrap.append(node,doc.createTextNode(label));return {wrap,node};
  }
  const cell=(key,value)=>{const box=el('div','wfg-stat');box.append(el('span','',key),el('strong','',value));return box;};
  const enumPairs=(items,label)=>items.map(item=>[item,label(item)]);
  function filenameExtension(type){return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/svg+xml':'svg'}[type];}
  function mount({route,container,api,lang='ar',params={}}){
    const startSession=api.getSession(),scope=core.scopeKey(startSession);
    if(!scope)throw error('AUTH_REQUIRED');
    let language=lang,disposed=false,loading=false,generation=0,query='',category=String(params.collection||''),inStock=false,view='grid',limit=36,
      tab=route==='gallery-studio'?'stockAdmin':'orders',statusFilter='',showHidden=false,slideIndex=0,slideTimer=0,pollTimer=0,dirty=false,previewMode=false;
    let products=[],orders=[],settings=core.presentation(),profile={version:0},cart=new Map(),cartNote='',sharePanel=null;
    const selected=new Set(),draft=new Map(),dialogs=new Set(),objectUrls=new Set(),imageCache=new Map(),pending=new Map();
    const abort=new AbortController(),main=el('div','wfg-workspace'),status=el('p','wfg-status'),body=el('div','wfg-body');
    status.setAttribute('aria-live','polite');status.setAttribute('role','status');main.append(status,body);container.replaceChildren(main);
    const text=key=>core.t(key,language),can=key=>api.can(key);
    const alive=()=>!disposed&&core.scopeKey(api.getSession())===scope;
    const assertActive=()=>{if(!alive())throw error('AUTH_REQUIRED');};
    const music=['gallery','gallery-studio'].includes(route)?root.WFGalleryMusic?.mount({container:main,api,lang,permission:routes[route][1]}):null;
    const cartStorage=core.cartKey(startSession);
    const localRead=key=>{try{return root.localStorage.getItem(key);}catch{return null;}};
    const localWrite=(key,value)=>{try{if(value==null)root.localStorage.removeItem(key);else root.localStorage.setItem(key,value);}catch{/* Keep current-tab cart available. */}};
    try{const previous=JSON.parse(localRead(cartStorage)||'{}');cart=core.normalizeCart(previous.lines);cartNote=String(previous.note||'').slice(0,1200);}catch{}
    const saveCart=()=>{if(!alive())return;localWrite(cartStorage,cart.size?JSON.stringify({lines:[...cart.values()],note:cartNote}):null);};
    function showError(reason){
      if(disposed||reason?.name==='AbortError')return;
      const queued=reason?.code==='GALLERY_PENDING';status.textContent=core.userError(reason,language);status.dataset.type=queued?'pending':'error';api.notify?.(status.textContent,queued?'in':'er');
    }
    function button(label,handler,kind=''){
      const node=el('button','btn wfg-button '+kind,label);node.type='button';
      node.addEventListener('click',async()=>{
        if(node.disabled||!alive())return;node.disabled=true;
        try{await handler(node);}catch(reason){showError(reason);}finally{node.disabled=false;}
      });return node;
    }
    const group=(...children)=>{const node=el('div','wfg-actions');node.append(...children.filter(Boolean));return node;};
    const request=async(action,payload={})=>{assertActive();const result=await api.request(action,payload);assertActive();return result;};
    async function pages(action,values={}){
      const rows=[];let offset=0,first={};let more=true;
      while(more){
        const part=await request(action,{...values,offset,limit:100});
        if(!Array.isArray(part.items)||part.hasMore&&!part.items.length)throw error('INVALID_RESPONSE');
        if(!offset)first=part;if(part.cached===true||part.fromCache===true||part.offline===true)first={...first,cached:true};rows.push(...part.items);offset+=part.items.length;more=part.hasMore===true;
      }
      return {...first,items:rows};
    }
    async function command(action,payload,slot=action){
      const bytes=new TextEncoder().encode(JSON.stringify(payload));
      const digest=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      assertActive();const remember=cartStorage+'.cmd.'+slot;let saved;
      try{saved=JSON.parse(localRead(remember)||'null')||pending.get(remember);}catch{saved=pending.get(remember);}
      if(saved && saved.digest!==digest && action!=='gallery.image.upload'){
        const previous=await request('gallery.command.review',{priorAction:action,priorId:saved.nonce});
        pending.delete(remember);localWrite(remember,null);
        if(previous.completed){await load(true);throw error('PREVIOUS_CHANGE_SAVED');}
      }
      const nonce=saved?.digest===digest?saved.nonce:root.crypto.randomUUID();
      const next={digest,nonce};pending.set(remember,next);localWrite(remember,JSON.stringify(next));
      try{
        const response=await request(action,{...payload,commandId:nonce});
        if(response?.queued===true||response?.pending===true)throw error('GALLERY_PENDING');
        pending.delete(remember);localWrite(remember,null);return response;
      }catch(reason){
        if([400,403,404,409,422].includes(reason?.status)){pending.delete(remember);localWrite(remember,null);}
        throw reason;
      }
    }
    async function load(silent=false){
      if(disposed||loading)return;loading=true;const run=++generation;
      if(!silent){status.textContent=text('loading');status.dataset.type='';}
      try{
        let cached=false;
        if(route==='gallery'||route==='gallery-studio'){
          const result=await pages('gallery.snapshot',{manage:route==='gallery-studio'});
          if(!alive()||run!==generation)return;products=result.items;settings=core.presentation(result.presentation);cached=result.cached===true;
        }else{
          const result=await pages(route==='my-orders'?'gallery.personal':'gallery.orders',route==='gallery-orders'?{scope:'staff'}:{});
          if(!alive()||run!==generation)return;orders=result.items;profile=result.print||{version:0};cached=result.cached===true;
        }
        if(!alive()||run!==generation)return;
        status.textContent=cached?text('savedCopy'):'';status.dataset.type=cached?'pending':'';
        if(!silent||(!dialogs.size&&!dirty&&!main.contains(doc.activeElement)))render();
      }catch(reason){if(!silent)showError(reason);if(!body.childElementCount&&alive())body.append(button(text('retry'),()=>load()));}
      finally{loading=false;}
    }
    async function changed(action,payload,modal,slot){
      if(modal?.busy)return; if(modal)modal.busy=true;
      try{
        const result=await command(action,payload,slot);assertActive();if(modal)modal.close();
        await load();api.notify?.(text('saved'),'ok');return result;
      }finally{if(modal)modal.busy=false;}
    }
    async function readBlob(ref){
      const {url}=await request('gallery.image',ref);if(!url)throw error('IMAGE_UNAVAILABLE');
      const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:abort.signal});assertActive();
      if(!response.ok)throw error('IMAGE_UNAVAILABLE');
      const blob=await response.blob();assertActive();
      if(!filenameExtension(blob.type)||blob.size>8*1024*1024)throw error('IMAGE_UNAVAILABLE');
      return blob;
    }
    function imageUrl(ref){
      const id=JSON.stringify(ref);
      if(!imageCache.has(id))imageCache.set(id,readBlob(ref).then(blob=>{assertActive();const url=URL.createObjectURL(blob);objectUrls.add(url);return url;}).catch(reason=>{imageCache.delete(id);throw reason;}));
      return imageCache.get(id);
    }
    const lazy=new Map();
    const observer=root.IntersectionObserver?new root.IntersectionObserver(entries=>{for(const hit of entries){if(hit.isIntersecting){observer.unobserve(hit.target);lazy.get(hit.target)?.();lazy.delete(hit.target);}}},{rootMargin:'100px'}):null;
    function photo(ref,alt,available=true){
      const img=el('img','wfg-photo');img.alt=alt||'';img.loading='lazy';img.decoding='async';
      img.src=root.WFAppIdentity?.sources?.().logo||'./assets/wow-furniture-logo.png';
      if(available){
        const assign=async()=>{try{const url=await imageUrl(ref);if(alive()&&img.isConnected)img.src=url;}catch{img.dataset.unavailable='true';}};
        if(observer){lazy.set(img,assign);observer.observe(img);}else queueMicrotask(assign);
      }
      return img;
    }
    function dialog(title){
      const node=el('dialog','wfg-dialog');node.setAttribute('aria-label',title);const header=el('header','wfg-dialog-head'),content=el('div','wfg-dialog-body');
      const state={node,content,busy:false,dirty:false,close(){node.close();}};
      const close=button(text('close'),()=>state.close(),'wfg-quiet');
      header.append(el('h3','',title),close);node.append(header,content);main.append(node);dialogs.add(state);
      node.addEventListener('close',()=>{dialogs.delete(state);node.remove();});
      node.addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
      node.addEventListener('input',()=>{state.dirty=true;});node.showModal();return state;
    }
    function assetField(caption,initial,purpose){
      const holder=el('div','wfg-asset-field'),file=input('','file'),picker=field(caption,file);file.accept='image/png,image/jpeg,image/webp';
      let value=initial||null,busy=false;
      const sample=el('div','wfg-asset-preview');
      const redraw=()=>{sample.replaceChildren();if(value)sample.append(photo({assetId:value},caption));};
      const camera=input('','file');camera.accept=file.accept;camera.setAttribute('capture','environment');
      async function upload(event){
        const chosen=event.target.files?.[0];if(!chosen)return;
        if(chosen.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(chosen.type)){showError(error('INVALID_IMAGE'));return;}
        file.disabled=true;camera.disabled=true;busy=true;
        try{
          const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(chosen);});
          const uploaded=await command('gallery.image.upload',{purpose,data},'image.'+purpose);assertActive();value=uploaded.assetId;redraw();
        }catch(reason){showError(reason);}finally{file.disabled=false;camera.disabled=false;busy=false;}
      }
      file.addEventListener('change',upload);camera.addEventListener('change',upload);
      holder.append(picker,field(text('camera'),camera),sample,button(text('remove'),()=>{value=null;file.value='';camera.value='';redraw();},'wfg-quiet'));redraw();
      return {holder,get value(){if(busy)throw error('INVALID_IMAGE');return value;}};
    }
    const money=(n,c)=>core.money(n,c,language),showDate=value=>value?new Date(value).toLocaleDateString(language):'';
    function render(){
      if(!alive())return;
      sharePanel?.dispose();sharePanel=null;
      if(slideTimer){root.clearInterval(slideTimer);slideTimer=0;}
      if(observer){for(const target of lazy.keys())if(!target.isConnected){observer.unobserve(target);lazy.delete(target);}}
      body.replaceChildren();
      if(route==='gallery'||previewMode)catalog();
      else if(route==='gallery-studio')studio();
      else if(route==='gallery-orders')adminOrders();
      else personal();
    }
    function tabs(entries){
      const bar=el('div','wfg-tabs');bar.setAttribute('role','group');
      for(const [id,key] of entries){
        const toggler=button(text(key),()=>{tab=id;query='';category='';statusFilter='';limit=36;render();},tab===id?'wfg-active':'');
        toggler.setAttribute('aria-pressed',String(tab===id));bar.append(toggler);
      }
      return bar;
    }
    function findControls(draw,{collections=[],stock=false,statusesFilter=false}={}){
      const bar=el('div','wfg-filters'),search=input(query,'search',160);search.setAttribute('aria-label',text('search'));search.placeholder=text('search');
      search.addEventListener('input',()=>{query=search.value;limit=36;draw();});bar.append(search);
      if(collections.length){
        const chooser=select([['',text('all')],...collections.map(c=>[c,categoryLabel(c)])],category);
        chooser.setAttribute('aria-label',text('category'));chooser.addEventListener('change',()=>{category=chooser.value;limit=36;draw();});bar.append(chooser);
      }
      if(statusesFilter){
        const chooser=select([['',text('all')],...enumPairs(statuses,text)],statusFilter);
        chooser.setAttribute('aria-label',text('status'));chooser.addEventListener('change',()=>{statusFilter=chooser.value;limit=36;draw();});bar.append(chooser);
      }
      if(stock){const control=toggle(text('onlyStock'),inStock);control.node.onchange=()=>{inStock=control.node.checked;draw();};bar.append(control.wrap);}
      return bar;
    }
    function categoryLabel(value){
      return root.WFProductCategories?.label?.(value,language)||value||'—';
    }
    function matches(...values){
      const token=query.trim().toLocaleLowerCase(language);
      return !token||values.some(v=>String(v??'').toLocaleLowerCase(language).includes(token));
    }
    function pageEnd(parent,total,redraw){
      if(total>limit)parent.append(button(text('next')+' ('+Math.min(36,total-limit)+')',()=>{limit+=36;redraw();},'wfg-more'));
    }
    function addToCart(product,qty){
      if(!Number.isSafeInteger(qty)||qty<0||qty>product.stock)throw error('INVALID_STOCK_QUANTITY');
      const id=core.typed(product.productId);
      if(qty&&!cart.has(id)&&cart.size>=100)throw error('INVALID_CART_LIMIT');
      if(qty)cart.set(id,{productId:product.productId,quantity:qty});else cart.delete(id);
      saveCart();
    }
    function openCollection(value){category=value||'';query='';limit=36;render();}
    function heroAndCards(){
      const visible=(items)=>items.filter(x=>x.visible!==false);const slides=visible(settings.slides),cards=visible(settings.cards);
      if(settings.logoId||settings.tagline){
        const head=el('div','wfg-brand');if(settings.logoId)head.append(photo({assetId:settings.logoId},text('logo')));
        if(settings.tagline)head.append(el('p','',settings.tagline));body.append(head);
      }
      if(slides.length){
        const hero=el('section','wfg-hero');hero.setAttribute('aria-label',text('slides'));
        const paint=()=>{if(!alive())return;hero.replaceChildren();const slide=slides[slideIndex%slides.length];
          if(slide.imageId)hero.append(photo({assetId:slide.imageId},slide.title));
          const panel=el('div','wfg-hero-copy');panel.append(el('h3','',slide.title));
          for(const str of [slide.subtitle,slide.description,slide.priceLabel])if(str)panel.append(el('p','',str));
          const nav=group(button(slide.buttonText||text('category'),()=>openCollection(slide.collection),'wfg-primary'));
          if(slides.length>1){nav.append(button('‹',()=>advance(-1)),button('›',()=>advance(1)));nav.children[1].setAttribute('aria-label',text('previous'));nav.children[2].setAttribute('aria-label',text('next'));}
          panel.append(nav);hero.append(panel);
        };
        const advance=delta=>{slideIndex=(slideIndex+delta+slides.length)%slides.length;paint();};
        let touchX=null;hero.onpointerdown=e=>{touchX=e.clientX;};hero.onpointerup=e=>{if(touchX!=null&&Math.abs(e.clientX-touchX)>65)advance(e.clientX<touchX?1:-1);touchX=null;};
        paint();body.append(hero);
        if(settings.autoplay&&slides.length>1&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)slideTimer=root.setInterval(()=>{
          if(!doc.hidden&&!dialogs.size&&!hero.contains(doc.activeElement))advance(1);
        },settings.interval*1000);
      }
      if(cards.length){
        const grid=el('div','wfg-collections');
        for(const card of cards){const cardButton=button('',()=>openCollection(card.collection),'wfg-collection');
          if(card.imageId)cardButton.append(photo({assetId:card.imageId},''));
          const info=el('span','wfg-collection-info');info.append(el('strong','',card.title));
          for(const str of [card.subtitle,card.description,card.countLabel,card.buttonText])if(str)info.append(el('span','',str));
          cardButton.append(info);grid.append(cardButton);
        }body.append(grid);
      }
    }
    function catalog(){
      if(previewMode)body.append(button(text('studio'),()=>{previewMode=false;render();},'wfg-quiet'));
      heroAndCards();
      const active=products.filter(p=>p.published),collections=[...new Set(active.map(p=>p.collection).filter(Boolean))];
      const area=el('div'),toolbar=el('div','wfg-toolbar');
      function draw(){
        area.replaceChildren();toolbar.replaceChildren();
        const visible=active.filter(p=>(!category||p.collection===category)&&(!inStock||p.stock>0)&&matches(p.name,categoryLabel(p.collection),p.badge));
        const opts=group(button(text(view==='grid'?'list':'grid'),()=>{view=view==='grid'?'list':'grid';draw();}));
        if(can('gallery.export')&&!previewMode){
          opts.append(button(text('selectAll'),()=>{for(const p of visible)selected.add(core.typed(p.productId));draw();}),
            button(text('clear'),()=>{selected.clear();draw();}),
            button(text('download')+' ZIP ('+selected.size+')',()=>exportsApi.downloadProducts(active.filter(p=>selected.has(core.typed(p.productId))),settings,language,readBlob,alive)));
          opts.lastElementChild.disabled=!selected.size;
        }
        if(can('myorders.edit')&&!previewMode){const count=[...cart.values()].reduce((n,line)=>n+line.quantity,0);
          opts.append(button(text('cart')+' ('+count+')',()=>cartDialog(draw),'wfg-primary'));}
        toolbar.append(opts);
        if(!visible.length){area.append(el('p','wfg-empty',text(active.length?'empty':'noProducts')));return;}
        const grid=el('div','wfg-products'+(view==='list'?' wfg-list':''));
        for(const item of visible.slice(0,limit)){
          const card=el('article','card wfg-product'),open=button('',()=>lightbox(visible,item),'wfg-image-button');
          open.setAttribute('aria-label',text('preview')+' '+item.name);open.append(photo({productId:item.productId},item.name,item.hasImage));
          card.append(open);const info=el('div','wfg-product-info');info.append(el('small','',categoryLabel(item.collection)),el('h3','',item.name));
          if(item.badge)info.append(el('p','wfg-badge',item.badge));
          if(item.stock>0&&item.stock<=3)info.append(el('p','wfg-badge wfg-low-stock',text('lowStock')));
          info.append(el('strong','wfg-price',item.priceMinor==null?text('noPrice'):money(item.priceMinor,item.currency)),
            el('p','wfg-stock',item.stock?text('available')+' '+item.stock:text('out')));
          const controls=group(button(text('dims'),()=>specDialog(item)));
          if(can('gallery.export')&&!previewMode){
            const pick=toggle(text('select'),selected.has(core.typed(item.productId)));
            pick.node.addEventListener('change',()=>{const id=core.typed(item.productId);if(pick.node.checked)selected.add(id);else selected.delete(id);draw();});controls.append(pick.wrap);
          }
          if(can('myorders.edit')&&!previewMode){
            const existing=cart.get(core.typed(item.productId))?.quantity||0;
            const buy=button(text('add')+(existing?' · '+existing:''),()=>{addToCart(item,existing+1);draw();},'wfg-primary');
            buy.disabled=item.stock<=existing||item.priceMinor==null;controls.append(buy);
          }
          info.append(controls);card.append(info);grid.append(card);
        }
        area.append(grid);pageEnd(area,visible.length,draw);
      }
      body.append(findControls(draw,{collections,stock:true}),toolbar,area);draw();
      if(settings.footer)body.append(el('footer','wfg-footer',settings.footer));
    }
    function specDialog(item){
      const modal=dialog(item.name);modal.content.append(el('pre','wfg-specs',exportsApi.dimsText(item,settings,language)));
      if(can('gallery.export'))modal.content.append(button(text('download')+' TXT',()=>exportsApi.linkDownload(
        new Blob([exportsApi.dimsText(item,settings,language)],{type:'text/plain;charset=utf-8'}),item.name+'-dimensions.txt')));
    }
    function lightbox(list,item){
      const modal=dialog(text('preview'));let index=list.indexOf(item),start;
      const paint=()=>{const product=list[index];modal.content.replaceChildren();const image=photo({productId:product.productId},product.name,product.hasImage);
        const frame=el('div','wfg-lightbox');frame.append(image);frame.onpointerdown=e=>{start=e.clientX;};frame.onpointerup=e=>{if(start!=null&&Math.abs(e.clientX-start)>60)move(e.clientX<start?1:-1);start=null;};
        const action=group(button(text('previous'),()=>move(-1)),button(text('next'),()=>move(1)),button(text('dims'),()=>specDialog(product)));
        if(can('gallery.export')&&product.hasImage)action.append(button(text('download'),async()=>{const blob=await readBlob({productId:product.productId});assertActive();exportsApi.linkDownload(blob,product.name+'.'+filenameExtension(blob.type));}));
        modal.content.append(frame,el('h4','',product.name),action);
      };
      const move=delta=>{index=(index+delta+list.length)%list.length;paint();};paint();
      modal.node.onkeydown=e=>{if(e.key==='ArrowRight')move(1);else if(e.key==='ArrowLeft')move(-1);};
    }
    function cartDialog(redraw){
      if(!can('myorders.edit'))throw error('ACCESS_DENIED');
      const modal=dialog(text('cart'));
      const paint=()=>{
        modal.content.replaceChildren();const lines=core.stockRows(products,cart);
        if(!lines.length){modal.content.append(el('p','wfg-empty',text('empty')));return;}
        const list=el('div','wfg-lines');
        for(const line of lines){const row=el('div','wfg-line'),desc=el('div');
          desc.append(el('strong','',line.product?.name||String(line.productId)),el('small','',line.product?money(line.priceMinor,line.currency):text('out')));
          if(!line.available)desc.append(el('small','wfg-warning',text('stockChanged')));
          const qty=numeric(line.quantity,1,line.product?.stock||0);qty.setAttribute('aria-label',text('quantity')+' '+(line.product?.name||''));
          qty.onchange=()=>{try{const n=qty.valueAsNumber;if(!line.product)throw error('INVALID_STOCK_QUANTITY');addToCart(line.product,n);paint();redraw();}catch(e){showError(e);}};
          row.append(desc,qty,button(text('remove'),()=>{cart.delete(core.typed(line.productId));saveCart();paint();redraw();},'wfg-quiet'));list.append(row);
        }
        modal.content.append(list);const sums=el('div','wfg-stats');
        for(const [currency,units] of core.totals(lines))sums.append(cell(text('total'),money(units,currency)));
        const notes=textArea(cartNote);notes.oninput=()=>{cartNote=notes.value;saveCart();};
        const consent=toggle(text('accepted'));const confirm=button(text('place'),async()=>{
          if(modal.busy||!consent.node.checked)return;modal.busy=true;
          try{
            const latest=core.stockRows(products,cart);if(!latest.length||latest.some(row=>!row.available))throw error('INVALID_STOCK_QUANTITY');
            const response=await command('gallery.order.place',{accepted:true,items:latest.map(row=>({productId:row.productId,quantity:row.quantity,priceMinor:row.priceMinor,currency:row.currency})),note:cartNote});
            cart.clear();cartNote='';saveCart();modal.close();api.notify?.(response.number+' · '+text('saved'),'ok');await load();
            if(can('myorders.view'))api.open('my-orders',{orderId:response.orderId});
          }finally{modal.busy=false;}
        },'wfg-primary');
        consent.node.onchange=()=>{confirm.disabled=!consent.node.checked||lines.some(row=>!row.available);};
        confirm.disabled=true;
        modal.content.append(sums,field(text('note'),notes),consent.wrap,group(confirm,button(text('clear'),()=>{
          if(root.confirm(text('clearCart'))){cart.clear();cartNote='';saveCart();paint();redraw();}
        })));
      };paint();
    }
    function showDoc(model,section){
      const modal=dialog(model.title),summary=el('div','wfg-doc-preview');
      summary.append(el('h3','',model.company),el('p','',model.meta));if(model.phone)summary.append(el('p','',model.phone));
      if(model.logoId)summary.prepend(photo({assetId:model.logoId},text('logo')));
      for(const row of model.rows){const line=el('div','wfg-doc-row');
        if(row.hasImage)line.append(photo({orderId:row.orderId,productId:row.productId},''));
        const values=el('div');values.append(el('strong','',row.name),el('small','',row.details||row.collection),
          el('p','',[text('quantity')+' '+row.quantity,row.priceMinor!=null?money(row.priceMinor,row.currency):''].filter(Boolean).join(' · ')));
        line.append(values);summary.append(line);
      }
      for(const [currency,value] of model.totals)summary.append(el('strong','',text('total')+' '+money(value,currency)));
      for(const value of [model.note,model.footer])if(value)summary.append(el('p','',value));
      const tools=group();
      if(can(section+'.print'))tools.append(button(text('print'),()=>exportsApi.exportDocument('print',model,imageUrl,alive)));
      if(can(section+'.export'))for(const kind of ['pdf','excel','share'])tools.append(button(text(kind),()=>exportsApi.exportDocument(kind,model,imageUrl,alive)));
      modal.content.append(summary,tools);
    }
    function orderCard(order,section){
      const card=el('article','card wfg-order');const head=el('div','wfg-card-head'),name=el('div');
      name.append(el('small','',showDate(order.createdAt)),el('h3','',order.number));
      head.append(name,el('span','wfg-badge',text(order.status)));card.append(head,el('p','',order.customer));
      const list=el('ul','wfg-order-items');for(const item of order.items)list.append(el('li','',item.name+' × '+item.quantity));card.append(list);
      const sums=el('div','wfg-stats');for(const [currency,units] of core.totals(order.items))sums.append(cell(text('total'),money(units,currency)));card.append(sums);
      if(order.note)card.append(el('p','',order.note));if(order.customerNote)card.append(el('p','',text('customerNote')+' · '+order.customerNote));if(order.adminNote)card.append(el('p','',text('adminNote')+' · '+order.adminNote));
      const buttons=group(button(text('preview'),()=>showDoc(exportsApi.makeDocument([order],{lang:language}),section)));
      if(section==='orders'&&can('orders.edit'))buttons.append(button(text('edit'),()=>orderEditor(order)));
      if(section==='orders'&&can('orders.delete'))buttons.append(button(text('archive'),async()=>{
        if(root.confirm(text('confirmArchive')))await changed('gallery.order.update',{orderId:order.id,version:order.version,archive:true},null,'archive.'+order.id);
      },'wfg-quiet'));
      card.append(buttons);return card;
    }
    function renderOrders(section){
      const area=el('div');
      const draw=()=>{area.replaceChildren();const filtered=orders.filter(order=>(!statusFilter||order.status===statusFilter)&&matches(order.number,order.customer,order.note,...order.items.map(item=>item.name)));
        const grid=el('div','wfg-order-grid');for(const order of filtered.slice(0,limit))grid.append(orderCard(order,section));
        if(!filtered.length)grid.append(el('p','wfg-empty',text('empty')));area.append(grid);pageEnd(area,filtered.length,draw);
      };
      body.append(findControls(draw,{statusesFilter:true}),area);draw();
    }
    function adminOrders(){renderOrders('orders');}
    async function orderEditor(order){
      const modal=dialog(order.number),form=el('form','wfg-form'),statusInput=select(enumPairs(statuses,text),order.status),note=textArea(order.adminNote||'',1500),customerNote=textArea(order.customerNote||'',1500);
      const lines=order.items.map(line=>({...line})),list=el('div','wfg-lines');
      const draw=()=>{list.replaceChildren();for(const [index,line] of lines.entries()){
        const row=el('div','wfg-line'),qty=numeric(line.quantity,1,1000000);qty.setAttribute('aria-label',text('quantity')+' '+line.name);qty.required=true;
        qty.oninput=()=>{line.quantity=qty.valueAsNumber;};
        row.append(el('strong','',line.name),qty,button(text('remove'),()=>{lines.splice(index,1);draw();}));list.append(row);
      }};
      form.append(field(text('status'),statusInput),list,field(text('customerNote'),customerNote),field(text('adminNote'),note));modal.content.append(form);draw();
      if(can('gallery.view')){
        const catalog=(await pages('gallery.snapshot')).items;if(!modal.node.open||!alive())return;
        const models=select([['','—'],...catalog.filter(p=>p.priceMinor!=null).map(p=>[core.typed(p.productId),p.name])],'');
        const add=button(text('add'),()=>{const p=catalog.find(product=>core.typed(product.productId)===models.value);if(!p)return;
          const existing=lines.find(line=>core.typed(line.productId)===core.typed(p.productId));if(existing)existing.quantity++;else lines.push({...p,quantity:1});draw();});
        form.insertBefore(group(field(text('model'),models),add),note.parentElement);
      }
      form.append(button(text('save'),async()=>{
        if(!form.reportValidity())return;if(!lines.length)throw error('INVALID_ORDER');
        await changed('gallery.order.update',{orderId:order.id,version:order.version,status:statusInput.value,adminNote:note.value,customerNote:customerNote.value,
          items:lines.map(line=>({productId:line.productId,quantity:line.quantity,priceMinor:line.priceMinor,currency:line.currency}))},modal,'order.'+order.id);
      },'wfg-primary'));
      form.onsubmit=e=>e.preventDefault();
    }
    function personal(){
      body.append(tabs([['orders','orderList'],['inventory','personalStock']]));
      if(tab==='orders'){renderOrders('myorders');return;}
      const tools=group();
      if(can('myorders.edit'))tools.append(button(text('printSettings'),printSettings));
      if(can('myorders.print')||can('myorders.export'))tools.append(button(text('preview'),()=>showDoc(exportsApi.makeDocument(orders,{lang:language,personal:true,profile}),'myorders')));
      const hide=toggle(text('showHidden'),showHidden),area=el('div');
      function draw(){area.replaceChildren();const entries=orders.flatMap(order=>order.items.map(item=>({order,item}))).filter(({order,item})=>
        (!item.hidden||showHidden)&&(!statusFilter||order.status===statusFilter)&&matches(item.name,item.collection,order.number));
        const summary=el('div','wfg-stats'),purchased=entries.reduce((n,x)=>n+(x.order.status==='cancelled'?0:x.item.quantity),0),sold=entries.reduce((n,x)=>n+x.item.sold,0);
        summary.append(cell(text('purchased'),purchased),cell(text('sold'),sold),cell(text('remaining'),purchased-sold));area.append(summary);
        const grid=el('div','wfg-order-grid');for(const {order,item} of entries.slice(0,limit)){
          const card=el('article','card wfg-order');const top=el('div','wfg-holding-head');if(item.hasImage)top.append(photo({productId:item.productId,orderId:order.id},''));
          const desc=el('div');desc.append(el('small','',order.number+' · '+text(order.status)),el('h3','',item.name));if(order.deliveredAt)desc.append(el('small','',showDate(order.deliveredAt)));top.append(desc);
          const stats=el('div','wfg-stats');stats.append(cell(text('purchased'),item.quantity),cell(text('sold'),item.sold),cell(text('remaining'),order.status==='cancelled'?0:item.quantity-item.sold));
          card.append(top,stats);if(item.showBase)card.append(el('small','',text('base')+' · '+money(item.priceMinor,item.currency)));if(item.showRetail&&item.retailMinor!=null)card.append(el('small','',text('retail')+' · '+money(item.retailMinor,item.currency)));
          const actions=group(button(text('sales'),()=>salesLog(order,item)));
          if(can('myorders.edit')){const sell=button(text('sale'),()=>saleForm(order,item),'wfg-primary');sell.disabled=!['ready','delivered'].includes(order.status)||item.sold>=item.quantity;actions.append(sell,button(text('edit'),()=>linePreferences(order,item)));}
          if(can('myorders.print')||can('myorders.export'))actions.append(button(text('printOne'),()=>showDoc(exportsApi.makeDocument([order],{lang:language,personal:true,profile,only:{orderId:order.id,productId:item.productId}}),'myorders')));
          card.append(actions);grid.append(card);
        }if(!entries.length)grid.append(el('p','wfg-empty',text('empty')));area.append(grid);pageEnd(area,entries.length,draw);
      }
      hide.node.onchange=()=>{showHidden=hide.node.checked;draw();};tools.append(hide.wrap);
      body.append(tools,findControls(draw,{statusesFilter:true}),area);draw();
    }
    function saleForm(order,item){
      const modal=dialog(text('sale')+' · '+item.name),form=el('form','wfg-form'),count=numeric(1,1,item.quantity-item.sold),
        price=numeric((item.retailMinor??item.priceMinor)/100,0,999999999.99,0.01),buyer=input('','text',120),phone=input('','tel',50),note=textArea('',800);
      count.required=true;price.required=true;
      const summary=el('strong');const update=()=>{const n=core.minor(price.value);summary.textContent=n==null?'':text('total')+' '+money(BigInt(n)*BigInt(Number.isSafeInteger(count.valueAsNumber)?count.valueAsNumber:0),item.currency);};
      count.oninput=price.oninput=update;update();
      form.append(field(text('quantity'),count),field(text('retail')+' · '+item.currency,price),field(text('buyer'),buyer),field(text('phone'),phone),field(text('note'),note),summary,
        button(text('save'),async()=>{if(!form.reportValidity())return;const units=core.minor(price.value);if(units==null)throw error('INVALID_PRICE');
          await changed('gallery.sale',{orderId:order.id,productId:item.productId,quantity:count.valueAsNumber,priceMinor:units,buyer:buyer.value,phone:phone.value,note:note.value},modal,'sale.'+order.id+'.'+core.typed(item.productId));
        },'wfg-primary'));
      form.onsubmit=e=>e.preventDefault();modal.content.append(form);
    }
    async function salesLog(order,item){
      const modal=dialog(text('sales')+' · '+item.name);modal.content.append(el('p','',text('loading')));
      const draw=async()=>{const result=await pages('gallery.sales',{orderId:order.id,productId:item.productId});if(!modal.node.open||!alive())return;
        modal.content.replaceChildren();if(!result.items.length)modal.content.append(el('p','wfg-empty',text('empty')));
        for(const sale of result.items){const entry=el('div','wfg-sale');entry.append(el('strong','',[sale.buyer,showDate(sale.createdAt)].filter(Boolean).join(' · ')),
          el('p','',sale.quantity+' × '+money(sale.priceMinor,item.currency)),el('small','',[sale.phone,sale.note].filter(Boolean).join(' · ')));
          if(sale.reversedAt)entry.append(el('small','',text('reversed')));
          else if(can('myorders.edit'))entry.append(button(text('reverse'),async()=>{if(!root.confirm(text('confirmReverse')))return;
            await command('gallery.sale.reverse',{saleId:sale.id},'reverse.'+sale.id);await draw();await load();}));
          modal.content.append(entry);
        }
      };await draw();
    }
    function linePreferences(order,item){
      const modal=dialog(item.name),price=numeric(item.retailMinor==null?'':item.retailMinor/100,0,999999999.99,.01),
        showBase=toggle(text('showBase'),item.showBase),showRetail=toggle(text('showRetail'),item.showRetail),showInPrint=toggle(text('showPrint'),item.showInPrint),hidden=toggle(text('hide'),item.hidden);
      const margin=el('p');price.oninput=()=>{const n=core.minor(price.value);margin.textContent=n==null?'':text('profit')+' · '+money(n-item.priceMinor,item.currency);};price.oninput();
      modal.content.append(field(text('retail')+' · '+item.currency,price),margin,showBase.wrap,showRetail.wrap,showInPrint.wrap,hidden.wrap,
        button(text('save'),async()=>{const n=price.value===''?null:core.minor(price.value);if(price.value&&n==null)throw error('INVALID_PRICE');
          await changed('gallery.preferences',{target:'line',orderId:order.id,productId:item.productId,version:item.preferenceVersion,retailMinor:n,showBase:showBase.node.checked,
            showRetail:showRetail.node.checked,showInPrint:showInPrint.node.checked,hidden:hidden.node.checked},modal,'line.'+order.id+'.'+core.typed(item.productId));
        },'wfg-primary'));
    }
    function printSettings(){
      const modal=dialog(text('printSettings')),name=input(profile.name,'text',150),phone=input(profile.phone,'tel',60),foot=textArea(profile.footer||'',360),logo=assetField(text('logo'),profile.logoId,'print');
      modal.content.append(field(text('company'),name),field(text('phone'),phone),field(text('footer'),foot),logo.holder,
        button(text('save'),()=>changed('gallery.preferences',{target:'print',version:profile.version,name:name.value,phone:phone.value,footer:foot.value,logoId:logo.value},modal,'print'),'wfg-primary'));
    }
    function studio(){
      body.append(tabs([['stockAdmin','stockAdmin'],['cards','cards'],['slides','slides'],['fields','fields'],['brand','brand']]));
      const actions=group(button(text('preview'),()=>{previewMode=true;category='';query='';render();}));
      if(can('products.edit'))actions.append(button(text('products'),()=>api.open('products')));
      body.append(actions);
      if(tab==='stockAdmin'){stockManager();return;}
      if(tab==='brand'){brandSettings();return;}
      const kind=tab;
      const controls=group(button(text('add'),()=>presentationEditor(kind,null),'wfg-primary'));
      if(kind==='slides')controls.append(button(text('autoplay'),()=>{
        const modal=dialog(text('autoplay')),auto=toggle(text('autoplay'),settings.autoplay),delay=numeric(settings.interval,2,60);
        modal.content.append(auto.wrap,field(text('interval'),delay),button(text('save'),()=>savePresentation({...settings,autoplay:auto.node.checked,interval:delay.valueAsNumber},modal),'wfg-primary'));
      }));
      body.append(controls);const grid=el('div','wfg-collections');
      for(const [index,item] of settings[kind].entries()){
        const card=el('article','card wfg-studio-card');if(item.imageId)card.append(photo({assetId:item.imageId},item.title));
        card.append(el('h3','',item.title||item.label),el('small','',[item.collection,item.unit,item.subtitle].filter(Boolean).join(' · ')));
        const visibility=toggle(text('visible'),item.visible!==false);
        visibility.node.onchange=async()=>{visibility.node.disabled=true;try{
          const next=settings[kind].map(x=>x.id===item.id?{...x,visible:visibility.node.checked}:x);await savePresentation({...settings,[kind]:next});
        }catch(reason){showError(reason);visibility.node.checked=item.visible!==false;}finally{visibility.node.disabled=false;}};
        const move=async(step)=>{const next=[...settings[kind]],i=index+step;if(i<0||i>=next.length)return;
          [next[index],next[i]]=[next[i],next[index]];await savePresentation({...settings,[kind]:next});};
        const up=button(text('moveUp'),()=>move(-1)),down=button(text('moveDown'),()=>move(1));up.disabled=!index;down.disabled=index===settings[kind].length-1;
        card.append(visibility.wrap,group(button(text('edit'),()=>presentationEditor(kind,item)),up,down,button(text('remove'),async()=>{
          if(root.confirm(text('remove')+' · '+(item.title||item.label)+'?'))await savePresentation({...settings,[kind]:settings[kind].filter(x=>x.id!==item.id)});
        },'wfg-quiet')));grid.append(card);
      }
      if(!settings[kind].length)grid.append(el('p','wfg-empty',text('empty')));body.append(grid);
    }
    async function savePresentation(value,modal){
      const {version,...clean}=value;return changed('gallery.presentation',{version,value:clean},modal,'presentation');
    }
    function stockManager(){
      const area=el('div'),collections=[...new Set(products.map(p=>p.collection).filter(Boolean))];
      function draw(){area.replaceChildren();
        if(draft.size)area.append(group(button(text('saveStock')+' ('+draft.size+')',async()=>{
          const changes=[...draft.values()];
          await command('gallery.stock',{rows:changes},'stock');draft.clear();dirty=false;await load();api.notify?.(text('saved'),'ok');
        },'wfg-primary'),button(text('clear'),()=>{draft.clear();dirty=false;draw();})));
        const filtered=products.filter(p=>(!category||p.collection===category)&&matches(p.name,p.collection,p.badge)),grid=el('div','wfg-stock-list');
        for(const p of filtered.slice(0,limit)){
          const current=draft.get(core.typed(p.productId))||p,row=el('div','card wfg-stock-row');
          row.append(photo({productId:p.productId},'',p.hasImage));const desc=el('div');
          desc.append(el('strong','',p.name),el('small','',[categoryLabel(current.collection||p.collection),current.published?text('publish'):''].filter(Boolean).join(' · ')));
          row.append(desc,el('span','',text('stock')+' '+current.stock),button(text('edit'),()=>stockEditor(p,draw)));grid.append(row);
        }
        if(!filtered.length)grid.append(el('p','wfg-empty',text('empty')));area.append(grid);pageEnd(area,filtered.length,draw);
      }
      body.append(findControls(draw,{collections}),area);draw();
    }
    function stockEditor(p,draw){
      const key=core.typed(p.productId),previous=draft.get(key);
      const current=previous||{...p,priceMinor:p.customPrice?p.priceMinor:null},modal=dialog(p.name),form=el('form','wfg-form'),
        stock=numeric(current.stock,0,1000000),publication=toggle(text('publish'),current.published),primary=toggle(text('primaryPrice'),current.priceMinor==null),
        price=numeric(current.priceMinor==null?'':current.priceMinor/100,0,999999999.99,0.01),currency=select(enumerate(['USD','TRY','EUR','SYP']),current.currency),
        collection=input(current.collection,'text',80),badge=input(current.badge,'text',100),specInputs=[];
      function enumerate(values){return values.map(x=>[x,x]);}
      stock.required=true;const enable=()=>{price.disabled=primary.node.checked;price.required=!primary.node.checked;currency.disabled=primary.node.checked;};primary.node.onchange=enable;enable();
      form.append(publication.wrap,field(text('stock'),stock),primary.wrap,field(text('price'),price),field(text('currency'),currency),field(text('category'),collection),field(text('badge'),badge));
      for(const definition of settings.fields){const value=input(current.specs?.[definition.id]||'','text',160);form.append(field([definition.label,definition.unit].filter(Boolean).join(' · '),value));specInputs.push([definition.id,value]);}
      form.append(button(text('save'),()=>{
        if(!form.reportValidity())return;
        const units=primary.node.checked?null:core.minor(price.value);if(!primary.node.checked&&units==null)throw error('INVALID_PRICE');
        const specs={...current.specs};for(const [id,node] of specInputs){if(node.value.trim())specs[id]=node.value.trim();else delete specs[id];}
        if(!previous&&draft.size>=100)throw error('INVALID_GALLERY_INPUT');
        draft.set(key,{productId:p.productId,version:previous?.version??p.version,stock:stock.valueAsNumber,published:publication.node.checked,
          priceMinor:units,currency:primary.node.checked?'USD':currency.value,collection:collection.value,badge:badge.value,specs});
        dirty=true;modal.close();draw();
      },'wfg-primary'));
      form.onsubmit=e=>e.preventDefault();modal.content.append(form);
    }
    function presentationEditor(kind,item){
      const modal=dialog(text(kind)),form=el('form','wfg-form'),visible=toggle(text('visible'),item?.visible!==false);
      const keys=kind==='fields'?['label','unit']:['title','subtitle','description','countLabel','buttonText','priceLabel','collection'];
      const labels={label:'title',collection:'category'},limits={label:80,title:120,subtitle:160,description:400,countLabel:60,buttonText:80,priceLabel:80,collection:80,unit:30};
      const values={};for(const key of keys){
        const node=key==='description'?textArea(item?.[key]||'',limits[key]):input(item?.[key]||'','text',limits[key]);values[key]=node;
        if(['label','title'].includes(key))node.required=true;form.append(field(text(labels[key]||key),node));
      }
      const icon=kind==='fields'?select([['ruler','↔'],['weight','kg'],['box','□'],['length','↔'],['width','↕'],['height','↥'],['tag','#']],item?.icon||'ruler'):null;
      if(icon)form.append(field(text('icon'),icon));
      const image=kind==='fields'?null:assetField(text('image'),item?.imageId,'presentation');if(image)form.append(image.holder);form.append(visible.wrap);
      const id=item?.id||root.crypto.randomUUID();
      form.append(button(text('save'),async()=>{
        if(!form.reportValidity())return;
        const record={id,visible:visible.node.checked};
        for(const [key,node] of Object.entries(values))record[key]=node.value;
        if(image)record.imageId=image.value;if(icon)record.icon=icon.value;
        const next=item?settings[kind].map(x=>x.id===item.id?record:x):[...settings[kind],record];
        await savePresentation({...settings,[kind]:next},modal);
      },'wfg-primary'));form.onsubmit=e=>e.preventDefault();modal.content.append(form);
    }
    function brandSettings(){
      const form=el('form','card wfg-form wfg-brand-form'),tag=input(settings.tagline,'text',160),foot=textArea(settings.footer,240),title=input(settings.ogTitle,'text',140),
        description=textArea(settings.ogDescription,300),logo=assetField(text('logo'),settings.logoId,'presentation'),social=assetField(text('socialImage'),settings.ogImageId,'presentation');
      form.oninput=()=>{dirty=true;sharePanel?.draftChanged();};form.onchange=()=>{dirty=true;sharePanel?.draftChanged();};
      form.append(field(text('tagline'),tag),field(text('footer'),foot),logo.holder,field(text('socialTitle'),title),field(text('socialDesc'),description),social.holder,
        button(text('save'),async()=>{await savePresentation({...settings,tagline:tag.value,footer:foot.value,ogTitle:title.value,ogDescription:description.value,logoId:logo.value,ogImageId:social.value});dirty=false;},'wfg-primary'));
      form.onsubmit=e=>e.preventDefault();body.append(form);
      if(root.WFGalleryPublicShare&&startSession.currentAccount?.role==='owner'){
        const publication=el('div');body.append(publication);
        sharePanel=root.WFGalleryPublicShare.mount({container:publication,api,locale:()=>language,isDirty:()=>dirty});
      }
    }
    const refresh=()=>{if(!doc.hidden&&!dialogs.size&&!dirty&&alive()&&!main.contains(doc.activeElement))load(true);};
    pollTimer=root.setInterval(refresh,25000);root.addEventListener('online',refresh);doc.addEventListener('visibilitychange',refresh);
    let opened=false;
    load().then(()=>{if(!alive()||opened)return;opened=true;
      if(params.orderId){const order=orders.find(o=>o.id===params.orderId);if(order)showDoc(exportsApi.makeDocument([order],{lang:language}),route==='gallery-orders'?'orders':'myorders');}
      if(params.productId!=null&&route==='gallery'){const visible=products.filter(p=>p.published),product=visible.find(p=>core.typed(p.productId)===core.typed(params.productId));if(product)lightbox(visible,product);}
    });
    return {dispose(){
      if(disposed)return;disposed=true;++generation;abort.abort();root.clearInterval(slideTimer);root.clearInterval(pollTimer);
      music?.dispose();
      sharePanel?.dispose();sharePanel=null;
      root.removeEventListener('online',refresh);doc.removeEventListener('visibilitychange',refresh);
      observer?.disconnect();lazy.clear();for(const modal of dialogs){if(modal.node.open)modal.node.close();modal.node.remove();}dialogs.clear();
      for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();imageCache.clear();selected.clear();draft.clear();pending.clear();cart.clear();products=[];orders=[];main.remove();
    },updateLanguage(next){language=typeof next==='string'?next:api.locale?.()||doc.documentElement.lang||language;
      music?.updateLanguage(language);
      if(!dialogs.size&&!dirty)render();},hasUnsavedChanges(){return dirty||[...dialogs].some(modal=>modal.dirty||modal.busy);}};
  }
  root.WFGallery=Object.freeze({mount});
  for(const [route,[titleKey,permission,icon]] of Object.entries(routes)){
    registry.register({id:route,title:Object.fromEntries(core.locales.map(lang=>[lang,core.t(titleKey,lang)])),permission,icon,mount});
  }
})(typeof window==='object'?window:globalThis);
