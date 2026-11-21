(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(globalThis,require('./core.js'));
  else root.WFGalleryExports=factory(root,root.WFGalleryCore);
})(typeof window==='object'?window:globalThis,function(root,core){
  'use strict';
  function safeName(value){return String(value||'WOW').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').replace(/^\.+|\.+$/g,'').slice(0,110)||'WOW';}
  function dimsText(item,presentation,lang){
    const parts=[item.name,core.t('dims',lang)];
    for(const dim of item.dims||[]){
      const axes=[dim.l,dim.w,dim.h].filter(v=>v!=null&&String(v)!=='');
      if(axes.length)parts.push([dim.name,axes.join(' × ')+' cm',dim.weight?dim.weight+' kg':''].filter(Boolean).join(' · '));
    }
    if(item.weight && Number(item.weight)>0)parts.push(core.t('weight',lang)+' '+item.weight+' kg');
    for(const field of presentation?.fields||[]){
      const value=item.specs?.[field.id];
      if(field.visible!==false && value)parts.push(field.label+' '+value+(field.unit?' '+field.unit:''));
    }
    return parts.join('\n');
  }
  function makeDocument(orders,{lang='ar',personal=false,profile={},only=null}={}){
    const text=key=>core.t(key,lang);
    const rows=[];
    for(const order of orders){
      for(const item of order.items||[]){
        if(only && (order.id!==only.orderId||core.typed(item.productId)!==core.typed(only.productId)))continue;
        if(personal&&!only&&(item.hidden||item.showInPrint===false))continue;
        const quantity=personal?(order.status==='cancelled'?0:item.quantity-item.sold):item.quantity;
        const price=personal?(item.showRetail&&item.retailMinor!=null?item.retailMinor:item.showBase?item.priceMinor:null):item.priceMinor;
        const prices=[];
        if(personal&&item.showBase)prices.push(text('base')+' '+core.money(item.priceMinor,item.currency,lang));
        if(personal&&item.showRetail&&item.retailMinor!=null)prices.push(text('retail')+' '+core.money(item.retailMinor,item.currency,lang));
        const counts=personal?[text('purchased')+' '+item.quantity,text('sold')+' '+item.sold,text('remaining')+' '+quantity].join(' · '):'';
        rows.push({orderId:order.id,productId:item.productId,hasImage:item.hasImage,name:item.name,collection:item.collection,
          quantity,priceMinor:price,currency:item.currency,details:[personal?order.number:'',counts,...prices].filter(Boolean).join(' · ')});
      }
    }
    const first=orders[0]||{};
    return {lang,title:personal?text('personalStock'):text('order')+' '+(first.number||''),company:personal?profile.name||root.WFAppIdentity?.current?.().name||'WOW Furniture':root.WFAppIdentity?.current?.().name||'WOW Furniture',
      phone:personal?profile.phone||'':'',logoId:personal?profile.logoId||null:null,meta:personal?'':[first.customer,first.createdAt?new Date(first.createdAt).toLocaleDateString(lang):'',first.status?text(first.status):''].filter(Boolean).join(' · '),
      note:personal?'':first.note||'',footer:personal?profile.footer||'':'',rows,totals:core.totals(rows)};
  }
  function linkDownload(blob,name){
    const url=URL.createObjectURL(blob),link=root.document.createElement('a');
    link.href=url;link.download=safeName(name);root.document.body.append(link);link.click();link.remove();
    root.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function imageFrom(url){
    return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('IMAGE_UNAVAILABLE'));img.src=url;});
  }
  function fit(ctx,image,x,y,w,h){
    const ratio=Math.min(w/image.naturalWidth,h/image.naturalHeight);
    const rw=image.naturalWidth*ratio,rh=image.naturalHeight*ratio;
    ctx.drawImage(image,x+(w-rw)/2,y+(h-rh)/2,rw,rh);
  }
  function sizedData(img,w=240,h=160){
    const c=root.document.createElement('canvas');c.width=w;c.height=h;
    const context=c.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,w,h);fit(context,img,0,0,w,h);return c.toDataURL('image/jpeg',0.88);
  }
  function wrap(ctx,text,maxWidth){
    const lines=[];let line='';
    for(const word of String(text||'').split(/\s+/)){
      if(!word)continue;
      if(line&&ctx.measureText(line+' '+word).width>maxWidth){lines.push(line);line='';}
      if(ctx.measureText(word).width>maxWidth){
        for(const character of [...word]){if(line&&ctx.measureText(line+character).width>maxWidth){lines.push(line);line='';}line+=character;}
      }else line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);return lines;
  }
  async function drawDocument(model,source,active){
    const pages=[];let canvas,ctx,y;const rtl=model.lang==='ar',W=900,H=1273,pad=46;
    const align=rtl?'right':'left',ax=rtl?W-pad:pad,colors={ink:'#183346',sub:'#435869',line:'#d4dfe4'};
    const text=key=>core.t(key,model.lang);
    function drawLine(str,x,lineY,style='20px Arial',color=colors.ink,max=780){
      ctx.font=style;ctx.fillStyle=color;ctx.textAlign=align;ctx.direction=rtl?'rtl':'ltr';ctx.fillText(str,x,lineY,max);
    }
    const logo=model.logoId?await imageFrom(await source({assetId:model.logoId})):null;
    function begin(){
      canvas=root.document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
      const tx=logo?(rtl?ax-100:ax+100):ax;
      if(logo)fit(ctx,logo,rtl?W-pad-82:pad,28,80,72);
      drawLine(model.company,tx,59,'bold 27px Arial');drawLine(model.title,tx,98,'bold 24px Arial');
      drawLine([model.phone,model.meta].filter(Boolean).join(' · '),ax,133,'17px Arial',colors.sub);
      ctx.fillStyle=colors.line;ctx.fillRect(pad,151,W-2*pad,2);y=172;
    }
    function finish(){
      drawLine(String(pages.length+1),rtl?pad+28:W-pad-28,H-31,'15px Arial',colors.sub,40);
      drawLine(model.footer,ax,H-31,'15px Arial',colors.sub,690);
      pages.push(canvas.toDataURL('image/jpeg',0.89));canvas.width=1;canvas.height=1;
    }
    function ensure(height){if(y+height>H-75){finish();begin();}}
    function lines(value,style='19px Arial',lineHeight=27){
      ctx.font=style;
      for(const line of wrap(ctx,value,W-pad*2)){ensure(lineHeight);drawLine(line,ax,y+lineHeight-6,style);y+=lineHeight;}
    }
    begin();
    for(const row of model.rows){
      if(!active())throw new Error('AUTH_REQUIRED');
      const count=text('quantity')+' '+row.quantity;
      const price=row.priceMinor==null?'':core.money(row.priceMinor,row.currency,model.lang)+' × '+row.quantity+' = '+core.money(BigInt(row.priceMinor)*BigInt(row.quantity),row.currency,model.lang);
      ctx.font='bold 21px Arial';const names=wrap(ctx,row.name,650);
      ctx.font='16px Arial';const info=wrap(ctx,[row.collection,row.details].filter(Boolean).join(' · '),650);
      const high=Math.max(99,54+names.length*26+info.length*22);ensure(high);
      const photoX=rtl?W-pad-105:pad,bodyX=rtl?ax-124:ax+124;
      if(row.hasImage){const image=await imageFrom(await source({productId:row.productId,orderId:row.orderId}));fit(ctx,image,photoX,y+4,105,85);}
      let top=y+23;for(const name of names){drawLine(name,bodyX,top,'bold 21px Arial',colors.ink,650);top+=26;}
      for(const detail of info){drawLine(detail,bodyX,top,'16px Arial',colors.sub,650);top+=22;}
      drawLine([count,price].filter(Boolean).join(' · '),bodyX,top,'18px Arial',colors.ink,650);
      y+=high;ctx.fillStyle=colors.line;ctx.fillRect(pad,y-4,W-2*pad,1);
    }
    y+=12;for(const [currency,amount] of model.totals)lines(text('total')+' '+core.money(amount,currency,model.lang),'bold 20px Arial');
    if(model.note)lines(text('note')+' '+model.note);
    finish();if(!active())throw new Error('AUTH_REQUIRED');return pages;
  }
  function pdfBlob(jpegs){
    if(!jpegs.length)throw new Error('EMPTY_DOCUMENT');
    const enc=new TextEncoder(),chunks=[],offsets=[0];let size=0;
    const add=value=>{const data=typeof value==='string'?enc.encode(value):value;chunks.push(data);size+=data.length;};
    function object(id,body){offsets[id]=size;add(id+' 0 obj\n');for(const part of body)add(part);add('\nendobj\n');}
    add('%PDF-1.4\n');
    object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
    object(2,['<< /Type /Pages /Count '+jpegs.length+' /Kids ['+jpegs.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>']);
    jpegs.forEach((uri,i)=>{
      const base=3+i*3,data=Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0));
      const draw='q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      object(base,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(base+1)+' 0 R >> >> /Contents '+(base+2)+' 0 R >>']);
      object(base+1,['<< /Type /XObject /Subtype /Image /Width 900 /Height 1273 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+data.length+' >>\nstream\n',data,'\nendstream']);
      object(base+2,['<< /Length '+draw.length+' >>\nstream\n'+draw+'\nendstream']);
    });
    const xref=size;add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
    for(const value of offsets.slice(1))add(String(value).padStart(10,'0')+' 00000 n \n');
    add('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
    return new Blob(chunks,{type:'application/pdf'});
  }
  async function workbook(model,source,active){
    const text=key=>core.t(key,model.lang),rows=[],images=[];
    const add=(...values)=>rows.push({cells:values.map(value=>({value}))});
    rows.push({cells:[{value:model.company,span:6,title:true}]},{cells:[{value:model.title,span:6,title:true}]});
    add(model.meta,model.phone);if(model.logoId){const logo=await imageFrom(await source({assetId:model.logoId}));images.push({uri:sizedData(logo),row:0,col:5,width:62,height:34,name:model.company});}
    const headers=['image','model','quantity','currency','price','total'].map(k=>({value:text(k),header:true}));
    rows.push({cells:headers});
    for(const row of model.rows){
      if(!active())throw new Error('AUTH_REQUIRED');
      if(row.hasImage){
        const image=await imageFrom(await source({productId:row.productId,orderId:row.orderId}));
        images.push({uri:sizedData(image),row:rows.length,col:0,width:75,height:49,x:2,y:2,name:row.name});
      }
      const extended=row.priceMinor==null?null:BigInt(row.priceMinor)*BigInt(row.quantity);
      rows.push({height:55,cells:[{value:''},{value:[row.name,row.details].filter(Boolean).join('\n')},{value:row.quantity},{value:row.currency},
        {value:row.priceMinor==null?'':row.priceMinor/100,format:'#,##0.00'},{value:extended==null?'':extended<=BigInt(Number.MAX_SAFE_INTEGER)?Number(extended)/100:core.money(extended,row.currency,model.lang),format:'#,##0.00'}]});
    }
    for(const [currency,value] of model.totals)add(text('total'),currency,core.money(value,currency,model.lang));
    if(model.note)add(text('note'),model.note);if(model.footer)add(model.footer);
    if(!active())throw new Error('AUTH_REQUIRED');
    return root.wfMakeExcelWorkbook({lang:model.lang,columns:6,firstItemRow:5,rows,images});
  }
  async function printPages(pages,active){
    if(!active())throw new Error('AUTH_REQUIRED');
    const frame=root.document.createElement('iframe');frame.title='WOW';frame.style.cssText='position:fixed;width:1px;height:1px;border:0;inset:0;opacity:0;pointer-events:none';
    root.document.body.append(frame);const doc=frame.contentDocument;
    const style=doc.createElement('style');style.textContent='@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;break-after:page}img:last-child{break-after:auto}';doc.head.append(style);
    try{
      await Promise.all(pages.map(src=>new Promise((resolve,reject)=>{const img=doc.createElement('img');img.onload=resolve;img.onerror=reject;img.src=src;doc.body.append(img);})));
      if(!active())throw new Error('AUTH_REQUIRED');
      frame.contentWindow.onafterprint=()=>frame.remove();frame.contentWindow.focus();frame.contentWindow.print();root.setTimeout(()=>frame.remove(),60000);
    }catch(error){frame.remove();throw error;}
  }
  async function exportDocument(kind,model,source,active){
    if(!model.rows.length)throw new Error('INVALID_EMPTY_DOCUMENT');
    const name=safeName(model.title),check=()=>{if(!active())throw new Error('AUTH_REQUIRED');};
    if(kind==='excel'){const file=await workbook(model,source,active);check();linkDownload(file,name+'.xlsx');return;}
    const pages=await drawDocument(model,source,active);check();
    if(kind==='print'){await printPages(pages,active);return;}
    const result=pdfBlob(pages),filename=name+'.pdf';
    if(kind==='share'&&root.navigator?.share){
      const file=new File([result],filename,{type:'application/pdf'});
      if(root.navigator.canShare?.({files:[file]})){await root.navigator.share({title:model.title,files:[file]});return;}
    }
    linkDownload(result,filename);
  }
  async function downloadProducts(products,settings,lang,readBlob,active){
    if(!products.length)throw new Error('INVALID_EMPTY_DOCUMENT');
    const files=[];
    for(const [index,p] of products.entries()){
      if(!active())throw new Error('AUTH_REQUIRED');
      const folder=String(index+1).padStart(3,'0')+'-'+safeName(p.name);
      files.push([folder+'/dimensions.txt',dimsText(p,settings,lang)]);
      if(p.hasImage){
        const blob=await readBlob({productId:p.productId}),ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/svg+xml':'svg'})[blob.type];
        if(!ext)throw new Error('IMAGE_UNAVAILABLE');
        files.push([folder+'/'+safeName(p.name)+'.'+ext,new Uint8Array(await blob.arrayBuffer())]);
      }
    }
    if(!active())throw new Error('AUTH_REQUIRED');
    linkDownload(new Blob([root.wfExcelZip(files)],{type:'application/zip'}),'WOW-Gallery.zip');
  }
  return Object.freeze({safeName,dimsText,makeDocument,linkDownload,pdfBlob,exportDocument,downloadProducts});
});
