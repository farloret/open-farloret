import { newChatId, isChatId } from './chat-id.js';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png','image/jpeg','image/webp','image/gif']);
const TEXT_TYPES = new Set([
  'text/plain','text/markdown','text/csv','text/html','text/css','text/xml',
  'text/javascript','application/json','application/xml','application/javascript',
  'application/x-yaml','text/yaml'
]);
const TEXT_SUFFIX = /\.(txt|md|markdown|csv|json|js|mjs|ts|tsx|jsx|html|css|xml|log|ini|cfg|yaml|yml|py|sh|java|c|cpp|h|rs|go|toml|sql)$/i;
const memory = new Map();
let connection;

export function imageAttachment(value) {
  return IMAGE_TYPES.has(String(value?.type || '').toLowerCase());
}
export function textAttachment(value) {
  return TEXT_TYPES.has(String(value?.type || '').toLowerCase()) ||
    TEXT_SUFFIX.test(String(value?.name || ''));
}
export function fileSizeLabel(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(bytes<10240?1:0) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}
export function attachmentMeta(item) {
  return {id:item.id,name:item.name,type:item.type,size:item.size};
}
/** Reject untrusted payloads before retaining bytes or forwarding them to a model. */
export function validatedAttachment(value) {
  if (!value || !isChatId(value.id) ||
      typeof value.name !== 'string' || !value.name.trim() ||
      value.name.length > 180 ||
      typeof value.type !== 'string' || value.type.length > 100 ||
      !Number.isInteger(value.size) || value.size < 0 || value.size > MAX_FILE_BYTES) return null;
  if (typeof value.dataUrl !== 'string') return null;
  const mime = value.type.toLowerCase() || 'application/octet-stream';
  const expected = 'data:' + mime + ';base64,';
  if (!value.dataUrl.startsWith(expected) ||
      value.dataUrl.length > 4_200_000 ||
      !/^[a-zA-Z0-9+/]*={0,2}$/.test(value.dataUrl.slice(expected.length))) return null;
  const bytes = value.dataUrl.slice(expected.length);
  if (Math.floor(bytes.length * 3 / 4) - (bytes.endsWith('==')?2:bytes.endsWith('=')?1:0) !== value.size) return null;
  return {id:value.id.toLowerCase(),name:value.name,type:mime,size:value.size,dataUrl:value.dataUrl};
}
export function validatedAttachments(items) {
  if (!Array.isArray(items)) return [];
  if (items.length > MAX_FILES) return [];
  const result = items.map(validatedAttachment);
  if (result.some(x=>!x) || result.reduce((n,x)=>n+x.size,0)>MAX_TOTAL_BYTES) return [];
  return result;
}
export function attachmentMetas(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0,MAX_FILES).flatMap(item => {
    if (!item || !isChatId(item.id) || typeof item.name!=='string') return [];
    return [{
      id:item.id.toLowerCase(),
      name:item.name.slice(0,180),
      type:typeof item.type==='string'?item.type.slice(0,100):'',
      size:Number.isInteger(item.size)?Math.max(0,Math.min(item.size,MAX_FILE_BYTES)):0
    }];
  });
}
function readDataUrl(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(reader.error || new Error('File could not be read'));
    reader.readAsDataURL(file);
  });
}
export async function encodeFile(file) {
  if (!file || typeof file.name !== 'string') throw new Error('Invalid file');
  if (file.size > MAX_FILE_BYTES) throw new Error(file.name+' exceeds the 3 MB per-file limit');
  const type=(file.type||'application/octet-stream').toLowerCase();
  if (type.length>100) throw new Error('Invalid file type');
  const name=file.name.slice(0,180) || 'Unnamed file';
  const dataUrl=await readDataUrl(file);
  const attachment=validatedAttachment({id:newChatId(),name,type,size:file.size,
    dataUrl:dataUrl.replace(/^data:.*?;base64,/, 'data:'+type+';base64,')});
  if (!attachment) throw new Error(name+' could not be added');
  return attachment;
}
function db() {
  if (connection) return connection;
  connection = new Promise((resolve,reject)=>{
    if (typeof indexedDB==='undefined') {reject(new Error('IndexedDB unavailable'));return;}
    const request=indexedDB.open('open-farloret-attachments-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  return connection;
}
export async function storeAttachments(attachments) {
  for (const item of attachments) memory.set(item.id,item);
  const database=await db();
  await new Promise((resolve,reject)=>{
    const transaction=database.transaction('files','readwrite');
    for (const item of attachments) transaction.objectStore('files').put(item);
    transaction.oncomplete=resolve;
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error||new Error('File storage failed'));
  });
}
export async function loadAttachment(id) {
  if (!isChatId(id)) return null;
  if (memory.has(id)) return memory.get(id);
  try {
    const database=await db();
    return await new Promise((resolve,reject)=>{
      const request=database.transaction('files','readonly').objectStore('files').get(id);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error);
    });
  } catch {return null;}
}
export function decodeAttachment(item) {
  const validated=validatedAttachment(item);
  if (!validated) return null;
  const value=validated.dataUrl.slice(validated.dataUrl.indexOf(',')+1);
  const binary=atob(value);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:validated.type});
}

const NS='http://www.w3.org/2000/svg';
function icon(id,sprite){
  const svg=document.createElementNS(NS,'svg');
  svg.classList.add('ui-icon');svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS(NS,'use');
  use.setAttribute('href',sprite+'#'+id);
  svg.append(use);return svg;
}

export function makeAttachmentInspector(sprite='./assets/ui-icons.svg') {
  const dialog=document.createElement('dialog');
  dialog.className='attachment-inspector';
  dialog.setAttribute('aria-label','File preview');
  const heading=document.createElement('div');
  heading.className='attachment-inspector-header';
  const title=document.createElement('strong');
  const close=document.createElement('button');
  close.type='button';close.className='attachment-inspector-close';
  close.setAttribute('aria-label','Close preview');
  close.append(icon('close',sprite));
  heading.append(title,close);
  const content=document.createElement('div');
  content.className='attachment-inspector-content';
  const download=document.createElement('a');
  download.className='attachment-inspector-download';
  download.textContent='Download file';
  dialog.append(heading,content,download);
  document.body.append(dialog);
  let activeURL=null;
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.addEventListener('close',()=>{
    if(activeURL) URL.revokeObjectURL(activeURL);
    activeURL=null;content.replaceChildren();download.removeAttribute('href');
  });

  async function show(input) {
    const item=input.dataUrl ? input : await loadAttachment(input.id);
    if(!item){throw new Error('File content is not available in this browser');}
    const blob=decodeAttachment(item);
    if(!blob)throw new Error('File content is invalid');
    if(dialog.open)dialog.close();
    activeURL=URL.createObjectURL(blob);
    title.textContent=item.name+' · '+fileSizeLabel(item.size);
    download.href=activeURL;
    download.download=item.name;
    content.replaceChildren();
    if(imageAttachment(item)){
      const image=document.createElement('img');
      image.className='attachment-inspector-image';
      image.src=activeURL;image.alt=item.name;
      content.append(image);
    }else if(textAttachment(item) && item.size <= MAX_FILE_BYTES){
      const pre=document.createElement('pre');
      pre.textContent=(await blob.text()).slice(0,100000);
      content.append(pre);
    }else if(item.type==='application/pdf'){
      const viewer=document.createElement('iframe');
      viewer.title='PDF preview · '+item.name;
      viewer.src=activeURL;viewer.className='attachment-inspector-pdf';
      content.append(viewer);
    }else{
      const empty=document.createElement('p');
      empty.className='attachment-inspector-empty';
      empty.textContent='Preview unavailable for this file type. You can still download it.';
      content.append(empty);
    }
    dialog.showModal();
  }
  return {show};
}

export function renderAttachmentTiles(container,attachments,{
  sprite='./assets/ui-icons.svg', inspector, removable=false, onRemove, getContent=loadAttachment
}={}) {
  container.replaceChildren();
  for(const record of attachments||[]){
    const tile=document.createElement('div');
    tile.className='attachment-tile'+(imageAttachment(record)?' attachment-tile-image':'');
    const open=document.createElement('button');
    open.type='button';open.className='attachment-tile-open';
    open.title='Preview '+record.name;
    if(imageAttachment(record)){
      const img=document.createElement('img');
      img.className='attachment-thumb';img.alt='';
      if(record.dataUrl)img.src=record.dataUrl;
      else getContent(record.id).then(item=>{
        if(item && tile.isConnected)img.src=item.dataUrl;
      });
      open.append(img);
    }else {
      const mark=document.createElement('span');
      mark.className='attachment-file-mark';
      mark.append(icon('file',sprite));
      open.append(mark);
    }
    const details=document.createElement('span');
    details.className='attachment-tile-details';
    const name=document.createElement('span');name.className='attachment-tile-name';
    name.textContent=record.name;name.title=record.name;
    const size=document.createElement('span');size.className='attachment-tile-size';
    size.textContent=fileSizeLabel(record.size);
    details.append(name,size);open.append(details);
    open.addEventListener('click',async ()=>{
      try{await inspector.show(record.dataUrl?record:await getContent(record.id)||record);}
      catch(error){window.alert(error.message);}
    });
    tile.append(open);
    if(removable){
      const remove=document.createElement('button');
      remove.type='button';remove.className='attachment-remove';
      remove.title='Remove '+record.name;remove.setAttribute('aria-label','Remove '+record.name);
      remove.append(icon('close',sprite));
      remove.addEventListener('click',()=>onRemove?.(record.id));
      tile.append(remove);
    }
    container.append(tile);
  }
  container.hidden=attachments.length===0;
}

export function createAttachmentController({
  composer, trigger, menu, fileInput, imageInput, preview, dropOverlay,
  sprite='./assets/ui-icons.svg', inspector, onChange=()=>{}, onError=()=>{}
}){
  let queued=[];
  let reading=Promise.resolve();
  const notify=()=>onChange(queued.length);
  const paint=()=>renderAttachmentTiles(preview,queued,{sprite,inspector,removable:true,
    onRemove:id=>{queued=queued.filter(x=>x.id!==id);paint();notify();}});
  const open=()=>{menu.hidden=false;trigger.setAttribute('aria-expanded','true')};
  const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false')};
  const add=files=>{
    const list=Array.from(files||[]);
    reading=reading.then(async()=>{
      const selected=queued.reduce((n,x)=>n+x.size,0);
      const total=list.reduce((n,x)=>n+x.size,0);
      if(queued.length+list.length>MAX_FILES)throw new Error('Up to '+MAX_FILES+' files per message');
      if(selected+total>MAX_TOTAL_BYTES)throw new Error('Attachments exceed the 10 MB message limit');
      for(const file of list){
        const attachment=await encodeFile(file);
        queued.push(attachment);
      }
      paint();notify();
    }).catch(error=>onError(error.message));
    return reading;
  };
  trigger.addEventListener('click',()=>menu.hidden?open():close());
  menu.querySelector('[data-pick-file]').addEventListener('click',()=>{close();fileInput.click()});
  menu.querySelector('[data-pick-image]').addEventListener('click',()=>{close();imageInput.click()});
  fileInput.addEventListener('change',()=>{add(fileInput.files);fileInput.value=''});
  imageInput.addEventListener('change',()=>{add(imageInput.files);imageInput.value=''});
  document.addEventListener('pointerdown',event=>{
    if(!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && !menu.hidden)close()});
  let depth=0;
  document.addEventListener('dragenter',event=>{
    if(!event.dataTransfer?.types?.includes('Files'))return;
    event.preventDefault();depth++;dropOverlay.hidden=false;
  });
  document.addEventListener('dragover',event=>{
    if(!event.dataTransfer?.types?.includes('Files'))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  });
  document.addEventListener('dragleave',event=>{
    if(!event.dataTransfer?.types?.includes('Files'))return;
    depth=Math.max(0,depth-1);
    if(depth===0)dropOverlay.hidden=true;
  });
  document.addEventListener('drop',event=>{
    if(!event.dataTransfer?.types?.includes('Files'))return;
    event.preventDefault();depth=0;dropOverlay.hidden=true;
    add(event.dataTransfer.files);
  });
  composer.addEventListener('paste',event=>{
    const images=Array.from(event.clipboardData?.files||[]).filter(file=>imageAttachment(file));
    if(images.length){event.preventDefault();add(images)}
  });
  paint();
  return {
    get count(){return queued.length},
    pending:()=>queued.slice(),
    add,
    clear(){queued=[];paint();notify()},
    async take(){await reading;const list=queued.slice();queued=[];paint();notify();return list;},
    whenReady:()=>reading
  };
}
