(function(root){
  'use strict';
  const maxBytes=8*1024*1024;
  const baseName=value=>String(value||'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').replace(/^\.+/,'').slice(0,180)||'file';
  const crcTable=Uint32Array.from({length:256},(_,index)=>{
    let value=index;for(let bit=0;bit<8;bit++)value=value&1?(value>>>1)^0xedb88320:value>>>1;return value>>>0;
  });
  const crc32=bytes=>{let crc=0xffffffff;for(const value of bytes)crc=(crc>>>8)^crcTable[(crc^value)&255];return (crc^0xffffffff)>>>0;};
  function uniqueName(original,used){
    const cleaned=baseName(original),dot=cleaned.lastIndexOf('.'),stem=dot>0?cleaned.slice(0,dot):cleaned,suffix=dot>0?cleaned.slice(dot):'';
    let value=cleaned,number=2;while(used.has(value.toLowerCase()))value=stem+' ('+(number++)+')'+suffix;
    used.add(value.toLowerCase());return value;
  }
  function header(size){const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);return {bytes,u16:(at,n)=>view.setUint16(at,n,true),u32:(at,n)=>view.setUint32(at,n,true)};}
  async function zip(entries,{compress=false,onEntry}={}){
    const parts=[],directory=[],names=new Set(),encoder=new TextEncoder();
    let offset=0,centralSize=0,count=0;
    for await(const entry of entries){
      const blob=entry.blob??await entry.load(),filename=encoder.encode(uniqueName(entry.name,names));
      const bytes=new Uint8Array(await blob.arrayBuffer()),crc=crc32(bytes);
      let payload=blob,method=0;
      if(compress&&root.CompressionStream){
        try{const packed=await new Response(blob.stream().pipeThrough(new root.CompressionStream('deflate-raw'))).blob();
          if(packed.size<blob.size){payload=packed;method=8;}}catch{/* STORE works without native DEFLATE. */}
      }
      const local=header(30);local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x0800);local.u16(8,method);local.u16(12,33);
      local.u32(14,crc);local.u32(18,payload.size);local.u32(22,blob.size);local.u16(26,filename.length);
      const central=header(46);central.u32(0,0x02014b50);central.u16(4,20);central.u16(6,20);central.u16(8,0x0800);central.u16(10,method);
      central.u16(14,33);central.u32(16,crc);central.u32(20,payload.size);central.u32(24,blob.size);central.u16(28,filename.length);central.u32(42,offset);
      parts.push(local.bytes,filename,payload);directory.push(central.bytes,filename);centralSize+=46+filename.length;offset+=30+filename.length+payload.size;
      count++;onEntry?.(count);
    }
    if(!count||count>65535||offset+centralSize>0xffffffff)throw Error('INVALID_ARCHIVE');
    const end=header(22);end.u32(0,0x06054b50);end.u16(8,count);end.u16(10,count);end.u32(12,centralSize);end.u32(16,offset);
    return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
  }
  async function prepare(file,quality){
    if(!file.size||file.size>64*1024*1024)throw Error('INVALID_MEDIA');
    const originalBytes=file.size,filename=baseName(file.name);let blob=file,outputName=filename;
    if(quality==='smart'&&/^image\/(jpeg|png|webp)$/i.test(file.type)&&root.createImageBitmap){
      let image;
      try{image=await root.createImageBitmap(file);const scale=Math.min(1,2000/Math.max(image.width,image.height));
        const canvas=root.document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        const candidate=await new Promise(resolve=>canvas.toBlob(resolve,file.type,0.82));if(candidate?.size<blob.size)blob=candidate;
      }catch{/* The original remains available if a decoder cannot open this image. */}finally{image?.close?.();}
    }else if(quality==='smart'&&file.size>100*1024&&!/^(image|audio|video)\//.test(file.type)&&!/(?:zip|7z|gz|rar|pdf|docx|xlsx|pptx)$/i.test(filename)){
      const packed=await zip([{name:filename,blob:file}],{compress:true});if(packed.size<file.size*0.95){blob=packed;outputName=filename.slice(0,175)+'.zip';}
    }
    if(blob.size>maxBytes)throw Error('MEDIA_TOO_LARGE');
    return {blob,name:outputName,originalBytes};
  }
  function base64(blob){
    if(!blob.size||blob.size>maxBytes)return Promise.reject(Error('MEDIA_TOO_LARGE'));
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(Error('READ_FAILED'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);
    });
  }
  function authorizedUrl(value){
    const url=new URL(value),config=root.WOW_CLOUD_CONFIG;
    if(!config?.projectUrl||url.protocol!=='https:'||url.origin!==new URL(config.projectUrl).origin||!url.pathname.startsWith('/storage/v1/object/sign/wow-files/')||url.username||url.password)throw Error('INVALID_RESPONSE');
    return url.href;
  }
  async function downloadBlob(handle,signal){
    const response=await root.fetch(authorizedUrl(handle.url),{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal,redirect:'error'});
    if(!response.ok)throw Error('DOWNLOAD_FAILED');return response.blob();
  }
  function save(blob,filename){
    const url=URL.createObjectURL(blob),a=root.document.createElement('a');
    a.href=url;a.download=baseName(filename);root.document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const locales=['en','ar','tr','fr','ru'];
  function translator(dict,getLanguage){return key=>dict[key]?.[Math.max(0,locales.indexOf(getLanguage()))]??key;}
  function humanBytes(size,lang='en'){
    const units=['B','KiB','MiB','GiB'];let n=Number(size)||0,i=0;while(n>=1024&&i<3){n/=1024;i++;}
    return new Intl.NumberFormat(lang,{maximumFractionDigits:i?1:0}).format(n)+' '+units[i];
  }
  const el=(tag,text,cls)=>{const node=root.document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=text;if(cls)node.className=cls;return node;};
  function button(label,click,cls){const e=el('button',label,cls);e.type='button';e.addEventListener('click',click);return e;}
  function options(rows,selected){const e=el('select');for(const [value,label] of rows){const option=el('option',label);option.value=value;e.append(option);}e.value=selected??'';return e;}
  function field(label,input){const node=el('label',null,'wf-collab-field');node.append(el('span',label),input);return node;}
  function input(value='',max=180){const e=el('input');e.value=value;e.maxLength=max;return e;}
  // Each instance owns its dialogs, requests and transient private data.
  function surface(container,api,getLang,words){
    let alive=true;
    const controller=new AbortController(),t=translator(words,getLang),dialogs=new Set();
    function notice(e){
      if(!alive||e?.name==='AbortError')return;
      const code=e?.code||e?.message||'ERROR';
      const key=({NETWORK:'offline',OFFLINE_NOT_CACHED:'uncached',ACCESS_DENIED:'denied',PERMISSION_DENIED:'denied',AUTH_REQUIRED:'denied',SESSION_REVOKED:'denied',
        INVALID_STORAGE_QUOTA:'quotaError',INVALID_MEDIA:'invalid',MEDIA_TOO_LARGE:'limit',RATE_LIMITED:'rate',CONFLICT:'conflict'})[code]||'failed';
      api.notify?.(t(key),'error');
    }
    function run(fn){return async(...args)=>{try{await fn(...args);}catch(e){notice(e);}};}
    function dialog(title){
      const d=el('dialog',null,'wf-collab-dialog'),head=el('header'),body=el('div',null,'wf-collab-dialog-body');
      head.append(el('h3',title),button(t('close'),()=>d.close()));d.append(head,body);container.append(d);dialogs.add(d);
      d.addEventListener('close',()=>{dialogs.delete(d);d.remove();},{once:true});d.showModal();return {d,body};
    }
    function dispose(){alive=false;controller.abort();for(const d of dialogs)d.close();dialogs.clear();}
    return {t,run,notice,dialog,dispose,signal:controller.signal,alive:()=>alive};
  }
  const errors={uncached:['This item has no copy on this device.','لا توجد نسخة من هذا العنصر على الجهاز.','Bu öğenin bu cihazda kopyası yok.','Aucune copie sur cet appareil.','На устройстве нет копии.'],
    device:['Device copy','نسخة الجهاز','Cihaz kopyası','Copie sur l’appareil','Копия на устройстве'],
    queued:['Waiting for cloud sync','بانتظار المزامنة السحابية','Bulut eşitlemesi bekleniyor','En attente de synchronisation','Ожидание синхронизации'],
    close:['Close','إغلاق','Kapat','Fermer','Закрыть'],
    offline:['Connection lost. Reconnect to continue.','انقطع الاتصال. أعد الاتصال للمتابعة.','Bağlantı kesildi. Yeniden bağlanın.','Connexion perdue. Reconnectez-vous.','Соединение потеряно. Подключитесь снова.'],
    denied:['Access has changed.','تغيرت صلاحية الوصول.','Erişim değişti.','Les droits d’accès ont changé.','Права доступа изменились.'],
    quotaError:['Storage limit reached.','بلغت حد التخزين.','Depolama sınırına ulaşıldı.','Limite de stockage atteinte.','Достигнут лимит хранилища.'],
    limit:['Each uploaded file can be up to 8 MiB.','الحد الأقصى للملف المرفوع 8 MiB.','Yükleme sınırı dosya başına 8 MiB.','Chaque fichier est limité à 8 Mio.','Размер файла ограничен 8 МиБ.'],
    invalid:['This file could not be accepted.','تعذر قبول هذا الملف.','Bu dosya kabul edilmedi.','Ce fichier a été refusé.','Файл не принят.'],
    rate:['Too many requests. Try again shortly.','طلبات كثيرة. حاول بعد قليل.','Çok fazla istek. Biraz sonra deneyin.','Trop de demandes. Réessayez bientôt.','Слишком много запросов. Повторите позже.'],
    conflict:['That name or change already exists.','الاسم أو التغيير موجود مسبقًا.','Bu ad veya değişiklik zaten var.','Ce nom ou cette modification existe déjà.','Это название или изменение уже существует.'],
    failed:['The operation could not be completed.','تعذر إكمال العملية.','İşlem tamamlanamadı.','L’opération a échoué.','Не удалось завершить операцию.']};
  const api={baseName,crc32,zip,prepare,base64,authorizedUrl,downloadBlob,save,maxBytes,translator,humanBytes,el,button,field,input,options,surface,errors};
  root.WFFileCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
