(function(root){
  'use strict';
  const C=root.WFFileCore;if(!C)return;
  const {el,button,field,input,options}=C;
  const words={...C.errors,
    all:['All files','كل الملفات','Tüm dosyalar','Tous les fichiers','Все файлы'],archive:['Archive','الأرشيف','Arşiv','Archives','Архив'],
    folders:['Folders','المجلدات','Klasörler','Dossiers','Папки'],allFolders:['All folders','كل المجلدات','Tüm klasörler','Tous les dossiers','Все папки'],
    unfiled:['Without folder','بلا مجلد','Klasörsüz','Sans dossier','Без папки'],newFolder:['New folder','مجلد جديد','Yeni klasör','Nouveau dossier','Новая папка'],
    search:['Search files','بحث في الملفات','Dosya ara','Rechercher un fichier','Поиск файлов'],kind:['File type','نوع الملف','Dosya türü','Type de fichier','Тип файла'],
    any:['All types','كل الأنواع','Tüm türler','Tous les types','Все типы'],sort:['Sort','الترتيب','Sırala','Tri','Сортировка'],
    new:['Newest first','الأحدث أولًا','En yeni','Plus récents','Сначала новые'],old:['Oldest first','الأقدم أولًا','En eski','Plus anciens','Сначала старые'],
    name:['Name','الاسم','Ad','Nom','Название'],nameDesc:['Name Z–A','الاسم تنازليًا','Ad Z–A','Nom Z–A','Название Я–А'],small:['Smallest first','الأصغر أولًا','En küçük','Plus petits','Сначала маленькие'],
    large:['Largest first','الأكبر أولًا','En büyük','Plus grands','Сначала большие'],grid:['Grid','شبكة','Izgara','Grille','Сетка'],list:['List','قائمة','Liste','Liste','Список'],
    upload:['Upload files','رفع ملفات','Dosya yükle','Importer des fichiers','Загрузить файлы'],drop:['Drop files here','أفلت الملفات هنا','Dosyaları buraya bırakın','Déposez les fichiers ici','Перетащите файлы сюда'],
    used:['Personal storage','مساحة الملفات الشخصية','Kişisel depolama','Stockage personnel','Личное хранилище'],download:['Download','تنزيل','İndir','Télécharger','Скачать'],
    delete:['Delete','حذف','Sil','Supprimer','Удалить'],rename:['Rename','إعادة تسمية','Yeniden adlandır','Renommer','Переименовать'],save:['Save','حفظ','Kaydet','Enregistrer','Сохранить'],
    move:['Move','نقل','Taşı','Déplacer','Переместить'],restore:['Restore','استعادة','Geri yükle','Restaurer','Восстановить'],selected:['Selected','محدد','Seçili','Sélection','Выбрано'],
    selectAll:['Select page','تحديد الصفحة','Sayfayı seç','Sélectionner la page','Выбрать страницу'],clear:['Clear selection','إلغاء التحديد','Seçimi temizle','Effacer la sélection','Снять выделение'],
    previous:['Previous','السابق','Önceki','Précédent','Назад'],next:['Next','التالي','Sonraki','Suivant','Далее'],empty:['No files in this view.','لا توجد ملفات في هذا العرض.','Bu görünümde dosya yok.','Aucun fichier dans cette vue.','В этом разделе нет файлов.'],
    smart:['Smart compression','ضغط ذكي','Akıllı sıkıştırma','Compression intelligente','Умное сжатие'],original:['Original quality','الجودة الأصلية','Özgün kalite','Qualité d’origine','Исходное качество'],
    quality:['Upload quality','جودة الرفع','Yükleme kalitesi','Qualité d’importation','Качество загрузки'],size:['Size','الحجم','Boyut','Taille','Размер'],date:['Uploaded','تاريخ الرفع','Yüklendi','Importé le','Дата загрузки'],
    saved:['Space saved','المساحة الموفرة','Kazanılan alan','Espace économisé','Сэкономлено'],downloads:['Downloads','مرات التنزيل','İndirme sayısı','Téléchargements','Скачивания'],
    share:['Share','مشاركة','Paylaş','Partager','Поделиться'],shareTime:['Anyone with these links can download for five minutes.','يمكن لمن يملك الروابط التنزيل خلال خمس دقائق.','Bu bağlantılara sahip herkes beş dakika boyunca indirebilir.','Toute personne disposant de ces liens peut télécharger pendant cinq minutes.','Ссылки позволяют скачать файлы в течение пяти минут.'],
    copy:['Copy links','نسخ الروابط','Bağlantıları kopyala','Copier les liens','Копировать ссылки'],copied:['Copied','تم النسخ','Kopyalandı','Copié','Скопировано'],accepted:['Uploaded','تم الرفع','Yüklendi','Importé','Загружено'],
    deleteAsk:['Permanently delete the selected files?','هل تريد حذف الملفات المحددة نهائيًا؟','Seçilen dosyalar kalıcı olarak silinsin mi?','Supprimer définitivement les fichiers sélectionnés ?','Удалить выбранные файлы безвозвратно?'],
    folderAsk:['Delete this folder? Its files will move to Without folder.','حذف المجلد ونقل ملفاته إلى «بلا مجلد»؟','Bu klasör silinip dosyaları Klasörsüz bölümüne taşınsın mı?','Supprimer ce dossier et déplacer ses fichiers vers Sans dossier ?','Удалить папку и переместить файлы в раздел «Без папки»?'],
    image:['Images','الصور','Resimler','Images','Изображения'],video:['Videos','الفيديو','Videolar','Vidéos','Видео'],audio:['Audio','الصوت','Ses','Audio','Аудио'],pdf:['PDF','PDF','PDF','PDF','PDF'],
    document:['Documents','المستندات','Belgeler','Documents','Документы'],archiveType:['Archives','ملفات مضغوطة','Sıkıştırılmış dosyalar','Fichiers compressés','Архивы'],other:['Other','أخرى','Diğer','Autres','Другие'],
    downloadOnly:['Download to open this file.','نزّل الملف لفتحه.','Açmak için dosyayı indirin.','Téléchargez le fichier pour l’ouvrir.','Скачайте файл, чтобы открыть его.'],
    noPreview:['Preview unavailable for this file type.','المعاينة غير متاحة لهذا النوع من الملفات.','Bu dosya türü önizlenemiyor.','Aucun aperçu pour ce type de fichier.','Предпросмотр этого типа файлов недоступен.'],
    loading:['Loading…','جار التحميل…','Yükleniyor…','Chargement…','Загрузка…']
  };
  const title={en:'My files',ar:'ملفاتي',tr:'Dosyalarım',fr:'Mes fichiers',ru:'Мои файлы'};
  const icons={image:'▧',video:'▶',audio:'♫',pdf:'PDF',document:'▤',archive:'ZIP',other:'◇'};
  function mount({container,api,lang}){
    let language=lang||'en',active=true,requestNo=0,pollBusy=false,searchTimer,busy=false,view='grid',snapshot=null;
    const ui=C.surface(container,api,()=>language,words),{t,run,dialog}=ui,selected=new Map(),pendingIds=new Map();
    const thumbs=new Map(),imageQueue=[];let imageWorkers=0;
    const observer=root.IntersectionObserver?new root.IntersectionObserver(events=>{
      for(const event of events)if(event.isIntersecting){observer.unobserve(event.target);imageQueue.push(event.target);}paintImages();
    }):null;
    async function paintImages(){while(active&&imageQueue.length&&imageWorkers<4){
      const img=imageQueue.shift();if(!img.isConnected)continue;imageWorkers++;
      (async()=>{const id=img.dataset.fileId,record=snapshot?.files.find(f=>f.id===id);if(!record)return;
        let result=thumbs.get(id);
        if(!result||result.expiresAt<Date.now()+3000){
          if(snapshot?._sync?.source==='device'&&root.navigator.onLine===false){const entry=await api.localFiles?.get?.(id);if(!entry?.blob||entry.digest!==record.digest)return;
            result={url:URL.createObjectURL(entry.blob),expiresAt:Infinity,local:true};
          }else {const handle=await req('open',{fileId:id});result={url:C.authorizedUrl(handle.url),expiresAt:Date.parse(handle.expiresAt)};}
          if(!active){if(result.local)URL.revokeObjectURL(result.url);return;}thumbs.set(id,result);
        }
        if(img.isConnected)img.src=result.url;
      })().catch(()=>{}).finally(()=>{imageWorkers--;paintImages();});
    }}
    const filters={query:'',sort:'new',kind:null,folderId:null,unfiled:false,archived:false,offset:0};
    const app=el('section',null,'wf-files'),head=el('header',null,'wf-files-head'),tools=el('div',null,'wf-files-tools'),quota=el('div',null,'wf-files-quota'),
      drop=el('div',null,'wf-files-drop'),bar=el('div',null,'wf-files-bar'),entries=el('div'),pager=el('div',null,'wf-files-pager'),status=el('p',null,'wf-files-status');
    status.setAttribute('role','status');container.append(app);app.append(head,tools,drop,status,bar,entries,pager);
    const req=(action,data)=>api.request('files.'+action,data),canEdit=()=>api.can('files.edit'),canDelete=()=>api.can('files.delete');
    const canExport=()=>api.can('files.export');
    function requireExport(){if(!active||!canExport())throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED'});}
    const kinds=['image','video','audio','pdf','document','archive','other'];
    const kindLabel=k=>t(k==='archive'?'archiveType':k);
    const folders=()=>snapshot?.folders||[],folderOptions=()=>[['',t('unfiled')],...folders().map(f=>[f.id,f.name])];
    const act=(label,fn,cls)=>button(label,run(fn),cls);
    function invalidate(){
      requestNo++;snapshot=null;selected.clear();app.classList.add('is-denied');folderSelect?.replaceChildren();entries.replaceChildren();bar.replaceChildren();pager.replaceChildren();quota.replaceChildren();
      for(const d of container.querySelectorAll('dialog[open]'))d.close();status.textContent=t('denied');
    }
    async function refresh(cleanup=false){
      const ticket=++requestNo;
      try{const data=await req('list',{...filters,cleanup});if(!active||ticket!==requestNo)return;
        const unchanged=snapshot?._deltaState?.revision&&snapshot._deltaState.revision===data._deltaState?.revision;snapshot=data;app.classList.remove('is-denied');const old=folderSelect.value;folderSelect.replaceChildren(...options([['all',t('allFolders')],...folderOptions()],old).options);
        folderSelect.value=filters.folderId??(filters.unfiled?'':'all');status.textContent=data._sync?.source==='device'?t('device')+' · '+new Date(data._sync.cachedAt).toLocaleString(language):'';
        if(!data._sync?.stale)for(const d of container.querySelectorAll('dialog[data-file-id][open]'))if(!data.files.some(f=>f.id===d.dataset.fileId))d.close();
        if(data.count>0&&filters.offset>=data.count){filters.offset=Math.floor((data.count-1)/60)*60;refresh();return;}if(!unchanged)draw();
      }catch(e){if(active&&ticket===requestNo){if(e.status===401||e.status===403||e.code==='ACCESS_DENIED')invalidate();else status.textContent=t(e.code==='OFFLINE_NOT_CACHED'?'uncached':e.code==='NETWORK'?'offline':'failed');}}
    }
    function resetFilter(change){Object.assign(filters,change,{offset:0});selected.clear();refresh();}
    let folderSelect;
    function toolbar(){
      head.replaceChildren();head.append(quota);const commands=el('div',null,'wf-files-actions');
      if(canEdit())commands.append(act(t('newFolder'),()=>nameDialog('folder.create')),act(t('upload'),()=>picker.click(),'wf-collab-primary'));
      head.append(commands);tools.replaceChildren();
      const search=input(filters.query,160);search.type='search';search.placeholder=t('search');search.setAttribute('aria-label',t('search'));
      search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>resetFilter({query:search.value}),230);});
      folderSelect=options([['all',t('allFolders')],...folderOptions()],filters.folderId??(filters.unfiled?'':'all'));
      folderSelect.onchange=()=>resetFilter({folderId:folderSelect.value&&folderSelect.value!=='all'?folderSelect.value:null,unfiled:folderSelect.value===''});
      const type=options([['',t('any')],...kinds.map(k=>[k,kindLabel(k)])],filters.kind);type.onchange=()=>resetFilter({kind:type.value||null});
      const sort=options(['new','old','name','nameDesc','small','large'].map(k=>[k,t(k)]),filters.sort);sort.onchange=()=>resetFilter({sort:sort.value});
      const arch=options([['0',t('all')],['1',t('archive')]],filters.archived?'1':'0');arch.onchange=()=>resetFilter({archived:arch.value==='1'});
      tools.append(search,field(t('folders'),folderSelect),field(t('kind'),type),field(t('sort'),sort),arch,
        act(t(view==='grid'?'list':'grid'),()=>{view=view==='grid'?'list':'grid';toolbar();draw();}));
      arch.setAttribute('aria-label',t('archive'));drop.replaceChildren(el('span',t('drop')));drop.hidden=!canEdit();
    }
    function nameDialog(action,row){
      const {d,body}=dialog(action==='folder.create'?t('newFolder'):t('rename')),form=el('form'),value=input(row?.name||'',action.startsWith('folder')?100:180);
      value.required=true;const save=el('button',t('save'),'wf-collab-primary');save.type='submit';form.append(field(t('name'),value),save);body.append(form);
      form.onsubmit=run(async e=>{e.preventDefault();save.disabled=true;try{await req(action,{name:value.value,...(row?{[action==='rename'?'fileId':'folderId']:row.id}:{})});d.close();await refresh();}finally{save.disabled=false;}});
      value.focus();
    }
    async function mutate(action,data){await req(action,data);selected.clear();await refresh(action==='delete');}
    function confirmDelete(rows){
      const {d,body}=dialog(t('delete'));body.append(el('p',t('deleteAsk')+' ('+rows.length+')'),act(t('delete'),async()=>{await mutate('delete',{ids:rows.map(f=>f.id)});d.close();},'wf-collab-danger'));
    }
    function move(rows){
      const {d,body}=dialog(t('move')),choice=options(folderOptions(),rows[0]?.folderId);
      body.append(field(t('folders'),choice),act(t('move'),async()=>{await mutate('move',{ids:rows.map(f=>f.id),folderId:choice.value||null});d.close();}));
    }
    async function stored(f){
      const entry=await api.localFiles?.get?.(f.id);
      if(!entry?.blob||entry.digest!==f.digest)throw Object.assign(Error('OFFLINE_NOT_CACHED'),{code:'OFFLINE_NOT_CACHED'});return entry.blob;
    }
    async function readBlob(f,download){
      try{
        const handle=await req('open',{fileId:f.id,download}),blob=await C.downloadBlob(handle,ui.signal);
        if(handle.digest!==f.digest)throw Error('INVALID_RESPONSE');
        if(download&&active&&api.localFiles){
          try{await api.localFiles.put(f.id,{blob,fileName:f.name,contentType:handle.mime,digest:handle.digest});}
          catch(error){if(!active||error?.status===401||error?.status===403)throw error;api.notify?.(t('uncached'),'info');}
        }
        return blob;
      }catch(error){
        if(!active||!['NETWORK','OFFLINE_NOT_CACHED'].includes(error?.code)&&!(error instanceof TypeError&&root.navigator.onLine===false))throw error;
        return stored(f);
      }
    }
    async function download(rows){
      if(!rows.length)return;
      requireExport();
      const load=f=>readBlob(f,true);
      if(rows.length===1){const blob=await load(rows[0]);requireExport();C.save(blob,rows[0].name);return;}
      const out=await C.zip(rows.map(f=>({name:f.name,load:()=>load(f)})),{onEntry:n=>{if(active)status.textContent=t('download')+' '+n+' / '+rows.length;}});
      requireExport();C.save(out,'Mark-Robot-files.zip');status.textContent='';
    }
    async function share(rows){
      requireExport();
      const urls=[];
      try{for(const row of rows){const h=await req('share',{fileId:row.id});urls.push(C.authorizedUrl(h.url));}}
      catch(e){
        if(!['OFFLINE_NOT_CACHED','NETWORK'].includes(e?.code)||!root.navigator.canShare)throw e;
        const local=[];for(const f of rows)local.push(new File([await stored(f)],f.name,{type:f.mime}));
        if(!active||!root.navigator.canShare({files:local}))throw e;
        requireExport();const {body}=dialog(t('share'));body.append(act(t('share'),()=>{requireExport();return root.navigator.share({files:local});}));return;
      }
      if(!active)return;requireExport();const links=urls.join('\n'),{body}=dialog(t('share'));body.append(el('p',t('shareTime')));
      const area=el('textarea');area.readOnly=true;area.value=links;area.setAttribute('aria-label',t('copy'));body.append(area);
      if(root.navigator.clipboard)body.append(act(t('copy'),async()=>{await root.navigator.clipboard.writeText(links);api.notify?.(t('copied'),'success');}));
      if(root.navigator.share)body.append(act(t('share'),()=>root.navigator.share({title:title[language],text:links})));
      const wa=el('a','WhatsApp');wa.href='https://wa.me/?text='+encodeURIComponent(links);wa.target='_blank';wa.rel='noopener noreferrer';body.append(wa);
    }
    function actions(rows,where){
      if(canExport())where.append(act(rows.length>1?'ZIP · '+t('download'):t('download'),()=>download(rows)),act(t('share'),()=>share(rows)));
      if(canEdit()){
        if(rows.length===1)where.append(act(t('rename'),()=>nameDialog('rename',rows[0])));
        where.append(act(t('move'),()=>move(rows)),act(t(filters.archived?'restore':'archive'),()=>mutate('archive',{ids:rows.map(f=>f.id),archived:!filters.archived})));
      }
      if(canDelete())where.append(act(t('delete'),()=>confirmDelete(rows),'wf-collab-danger'));
    }
    async function preview(f){
      const {d,body}=dialog(f.name),media=el('div',null,'wf-files-media'),details=el('dl'),ops=el('div',null,'wf-files-actions');
      d.dataset.fileId=f.id;for(const [key,value] of [['size',C.humanBytes(f.bytes,language)],['date',new Date(f.createdAt).toLocaleString(language)],['folders',folders().find(x=>x.id===f.folderId)?.name||t('unfiled')],['downloads',f.downloads],['saved',C.humanBytes(f.originalBytes-f.bytes,language)]])details.append(el('dt',t(key)),el('dd',String(value)));
      body.append(media,details,ops);actions([f],ops);
      if(!['image','audio','video','pdf'].includes(f.kind)){media.textContent=t(canExport()?'downloadOnly':'noPreview');return;}
      const blob=await readBlob(f,false);if(!active||!d.open)return;const objectUrl=URL.createObjectURL(blob);
      const node=el(({image:'img',video:'video',audio:'audio',pdf:'iframe'})[f.kind]);if(f.kind==='pdf'){node.setAttribute('sandbox','');node.title=f.name;}
      if(f.kind==='image')node.alt=f.name;
      if(f.kind==='audio'||f.kind==='video'){node.controls=true;node.preload='metadata';if(!canExport())node.setAttribute('controlsList','nodownload');}
      node.referrerPolicy='no-referrer';node.src=objectUrl;media.append(node);
      d.addEventListener('close',()=>{node.removeAttribute('src');if(typeof node.load==='function')node.load();URL.revokeObjectURL(objectUrl);},{once:true});
    }
    function drawSelection(){
      bar.replaceChildren();if(!snapshot)return;
      if(snapshot.files.length)bar.append(act(t('selectAll'),()=>{for(const f of snapshot.files){if(selected.size>=100)break;selected.set(f.id,f);}draw();}));
      if(selected.size){bar.append(el('b',t('selected')+' '+selected.size),act(t('clear'),()=>{selected.clear();draw();}));actions(Array.from(selected.values()),bar);}
      else if(filters.folderId){
        const f=folders().find(x=>x.id===filters.folderId);if(f&&canEdit())bar.append(act(t('rename'),()=>nameDialog('folder.rename',f)));
        if(f&&canDelete())bar.append(act(t('delete'),()=>{const {d,body}=dialog(f.name);body.append(el('p',t('folderAsk')),act(t('delete'),async()=>{await req('folder.delete',{folderId:f.id});d.close();resetFilter({folderId:null});},'wf-collab-danger'));}));
      }
    }
    function draw(){
      if(!snapshot)return;quota.replaceChildren(el('b',t('used')),el('span',C.humanBytes(snapshot.used,language)+' / '+C.humanBytes(snapshot.quota,language)));
      const meter=el('progress');meter.value=snapshot.used;meter.max=snapshot.quota;meter.setAttribute('aria-label',t('used'));quota.append(meter);drawSelection();
      observer?.disconnect();imageQueue.length=0;entries.replaceChildren();entries.className='wf-files-entries '+view;
      if(!snapshot.files.length)entries.append(el('p',t('empty'),'wf-collab-empty'));
      for(const f of snapshot.files){
        const row=el('article',null,'wf-file-entry'),check=el('input');check.type='checkbox';check.checked=selected.has(f.id);check.setAttribute('aria-label',t('selected')+' '+f.name);
        check.onchange=()=>{if(check.checked&&selected.size<100)selected.set(f.id,f);else {selected.delete(f.id);check.checked=false;}drawSelection();};
        const open=act('',()=>preview(f),'wf-file-open'),icon=el('span',icons[f.kind]||icons.other,'wf-file-icon');icon.setAttribute('aria-hidden','true');
        if(f.kind==='image'&&observer){const thumb=el('img');thumb.alt='';thumb.referrerPolicy='no-referrer';thumb.loading='lazy';thumb.dataset.fileId=f.id;icon.append(thumb);observer.observe(thumb);}
        const info=el('span');info.append(el('b',f.name),el('small',kindLabel(f.kind)+' · '+C.humanBytes(f.bytes,language)));open.append(icon,info);row.append(check,open);entries.append(row);
      }
      pager.replaceChildren();if(snapshot.count>60){const prev=act(t('previous'),()=>{filters.offset=Math.max(0,filters.offset-60);return refresh();}),next=act(t('next'),()=>{filters.offset+=60;return refresh();});
        prev.disabled=filters.offset===0;next.disabled=filters.offset+60>=snapshot.count;pager.append(prev,el('span',(filters.offset+1)+'–'+Math.min(filters.offset+60,snapshot.count)+' / '+snapshot.count),next);}
    }
    const picker=el('input');picker.type='file';picker.multiple=true;picker.hidden=true;app.append(picker);
    function uploadDialog(files){
      if(!files.length||busy||!canEdit())return;const {d,body}=dialog(t('upload')),choice=options(folderOptions(),filters.folderId),quality=options([['smart',t('smart')],['original',t('original')]],'smart');
      const lines=el('ul',null,'wf-files-upload-list'),progress=el('progress'),send=act(t('upload'),upload,'wf-collab-primary');
      progress.max=files.length;progress.value=0;const results=files.map(f=>{const line=el('li',f.name);lines.append(line);return line;});
      body.append(field(t('folders'),choice),field(t('quality'),quality),lines,progress,send);
      async function upload(){
        if(busy)return;busy=true;send.disabled=true;choice.disabled=true;quality.disabled=true;
        try{for(const [i,file] of files.entries()){
          if(!active)break;const key=[file.name,file.size,file.lastModified,choice.value,quality.value].join('|'),requestId=pendingIds.get(key)||root.crypto.randomUUID();
          pendingIds.set(key,requestId);results[i].textContent=file.name+' · '+t('loading');
          try{const prepared=await C.prepare(file,quality.value),data=await C.base64(prepared.blob);if(!active)break;
            const receipt=await req('upload',{requestId,name:prepared.name,mime:prepared.blob.type,originalBytes:prepared.originalBytes,folderId:choice.value||null,data});
            results[i].textContent=file.name+' · '+t(receipt.queued?'queued':'accepted');if(!receipt.queued)pendingIds.delete(key);else await pendingUploads();
          }catch(e){results[i].textContent=file.name+' · '+t(e.message==='MEDIA_TOO_LARGE'?'limit':'failed');ui.notice(e);}
          progress.value=i+1;
        }}finally{busy=false;if(active)await refresh();}
      }
    }
    picker.onchange=()=>{uploadDialog(Array.from(picker.files||[]));picker.value='';};
    drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};drop.ondragleave=()=>drop.classList.remove('over');
    drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');uploadDialog(Array.from(e.dataTransfer?.files||[]));};
    toolbar();status.textContent=t('loading');refresh(true);
    let lastConnection=String(root.navigator.onLine);
    const unsubscribe=api.subscribeConnection?.(state=>{const marker=String(state?.online??state?.connection??state?.status??root.navigator.onLine);
      if(marker!==lastConnection){lastConnection=marker;if(active&&!busy)refresh();}});
    const sync=el('div',null,'wf-files-status');sync.setAttribute('role','status');app.insertBefore(sync,bar);
    async function pendingUploads(){if(!api.listOutbox)return;const items=await api.listOutbox();if(!active)return;sync.replaceChildren();
      for(const item of items.filter(x=>x.action==='files.upload'))sync.append(el('p',(item.fileName||t('upload'))+' · '+t(item.status==='pending'?'queued':'failed')));}
    const offReceipts=api.subscribeReceipts?.(receipt=>{if(active&&receipt?.action==='files.upload'){run(pendingUploads)();if(receipt.status==='posted')refresh();else ui.notice({code:receipt.errorCode||'CONFLICT'});}});
    run(pendingUploads)();
    const timer=setInterval(async()=>{if(!active||pollBusy||busy||root.document.hidden)return;pollBusy=true;try{await refresh();}finally{pollBusy=false;}},9000);
    return {dispose(){active=false;observer?.disconnect();for(const img of thumbs.values())if(img.local)URL.revokeObjectURL(img.url);thumbs.clear();imageQueue.length=0;unsubscribe?.();offReceipts?.();clearInterval(timer);clearTimeout(searchTimer);selected.clear();pendingIds.clear();snapshot=null;ui.dispose();app.remove();},
      updateLanguage(value){language=value;toolbar();draw();},hasUnsavedChanges:()=>busy};
  }
  const definition={id:'files',title,permission:'files.view',icon:'folder',mount};root.WFFiles=definition;root.WFModules?.register(definition);
})(globalThis);
