export function localDOM(){
 class Element{
   constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attrs={};this.listeners={};this.dataset={};this.ownText='';this.value='';this.disabled=false;this.open=false;
     this.classList={add:(...names)=>{this.className=[...new Set([...(this.className||'').split(/\s+/).filter(Boolean),...names])].join(' ');},
       remove:(...names)=>{this.className=(this.className||'').split(/\s+/).filter(x=>!names.includes(x)).join(' ');}};}
   get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('');}
   set textContent(value){this.ownText=String(value??'');this.children=[];}
   get options(){return this.children.filter(x=>x.tagName==='OPTION');}
   querySelectorAll(selector){
     if(!['dialog[open]','dialog[data-file-id][open]'].includes(selector))throw new Error('Unexpected module DOM selector '+selector);
     return this.children.flatMap(child=>[...(child.tagName==='DIALOG'&&child.open&&(selector==='dialog[open]'||child.dataset.fileId)?[child]:[]),...child.querySelectorAll(selector)]);
   }
   removeAttribute(key){delete this.attrs[key];}
   get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
   get firstElementChild(){return this.children[0]||null;}get lastElementChild(){return this.children[this.children.length-1]||null;}
   get childElementCount(){return this.children.length;}get isConnected(){return !!this.parentElement||this.tagName==='BODY';}
   append(...children){for(const child of children){const item=typeof child==='string'?Object.assign(new Element('#text'),{textContent:child}):child;item.parentElement=this;this.children.push(item);}}
   prepend(...items){for(const item of items.reverse()){item.parentElement=this;this.children.unshift(item);}}
   insertBefore(item,before){item.parentElement=this;const index=this.children.indexOf(before);if(index<0)this.children.push(item);else this.children.splice(index,0,item);}
   replaceChildren(...items){for(const x of this.children)x.parentElement=null;this.children=[];this.ownText='';this.append(...items);}
   remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
   setAttribute(key,value){this.attrs[key]=value;}getAttribute(key){return this.attrs[key];}
   addEventListener(key,fn){(this.listeners[key]||=[]).push(fn);}removeEventListener(key,fn){this.listeners[key]=(this.listeners[key]||[]).filter(x=>x!==fn);}
   contains(item){return !!item&&(this===item||this.children.some(x=>x.contains(item)));}
   async fire(type){const event={type,target:this,preventDefault(){}};for(const fn of this.listeners[type]||[])await fn(event);await this['on'+type]?.(event);}
   showModal(){this.open=true;}close(){this.open=false;this.fire('close');}reportValidity(){return true;}
 }
 const body=new Element('body'),doc=new Element('document');doc.body=body;doc.documentElement={lang:'en'};doc.createElement=t=>new Element(t);
 doc.createTextNode=value=>Object.assign(new Element('#text'),{textContent:value});
 return {doc,body};
}
