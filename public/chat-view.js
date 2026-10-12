import {renderAttachmentTiles,loadAttachment} from './attachments.js';

const NS='http://www.w3.org/2000/svg';
function svg(name,sprite){
  const el=document.createElementNS(NS,'svg');
  el.classList.add('ui-icon');el.setAttribute('viewBox','0 0 24 24');
  el.setAttribute('aria-hidden','true');
  const use=document.createElementNS(NS,'use');use.setAttribute('href',sprite+'#'+name);
  el.append(use);return el;
}
function action(name,label,sprite,handler){
  const b=document.createElement('button');b.type='button';b.className='turn-action';
  b.title=label;b.setAttribute('aria-label',label);
  const span=document.createElement('span');span.textContent=label;
  b.append(svg(name,sprite),span);b.addEventListener('click',handler);return b;
}
function safeUrl(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}
  catch{return null}
}
function inlineMarkdown(content,parent){
  const regex=/(\*\*[^*\n]+\*\*|\x60[^\x60\n]+\x60|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
  let at=0;
  for(const m of content.matchAll(regex)){
    if(m.index>at)parent.append(document.createTextNode(content.slice(at,m.index)));
    const token=m[0];
    if(token.startsWith('**')){const el=document.createElement('strong');el.textContent=token.slice(2,-2);parent.append(el)}
    else if(token.startsWith(String.fromCharCode(96))){const el=document.createElement('code');el.textContent=token.slice(1,-1);parent.append(el)}
    else{
      const match=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const link=match&&safeUrl(match[2]);
      if(link){const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener noreferrer';a.textContent=match[1];parent.append(a)}
      else parent.append(document.createTextNode(token));
    }
    at=m.index+token.length;
  }
  if(at<content.length)parent.append(document.createTextNode(content.slice(at)));
}
export function renderAssistantText(content,container){
  container.replaceChildren();
  const text=String(content||'');
  const fences=/^\x60{3}([^\n]*)\n([\s\S]*?)(?:\n\x60{3}(?=\n|$)|$)/gm;
  let at=0;
  function prose(str){
    for(const segment of str.trim().split(/\n{2,}/)){
      if(!segment.trim())continue;
      const match=segment.match(/^#{1,3} +([^\n]+)$/);
      const node=document.createElement(match?'h3':'p');
      node.className='turn-paragraph';
      inlineMarkdown(match?match[1]:segment,node);
      container.append(node);
    }
  }
  for(const m of text.matchAll(fences)){
    prose(text.slice(at,m.index));
    const pre=document.createElement('pre');pre.className='turn-code-block';
    const head=document.createElement('div');head.className='turn-code-header';
    const language=document.createElement('span');language.textContent=m[1].trim().slice(0,30)||'Code';
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy code';
    const text=m[2].trimEnd();
    copy.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(text);copy.textContent='Copied'}catch{copy.textContent='Copy unavailable'}
    });
    const code=document.createElement('code');code.textContent=text;
    head.append(language,copy);pre.append(head,code);container.append(pre);
    at=m.index+m[0].length;
  }
  prose(text.slice(at));
  if(!text.trim()){const wait=document.createElement('span');wait.className='turn-pending';wait.textContent='Thinking…';container.append(wait)}
}

export function createChatView({root,logo,sprite,inspector,getAttachment=loadAttachment,onEdit=async()=>{},onRegenerate=null,onError=()=>{},isBusy=()=>false}){
  let reading=-1,readingControl=null;
  function stopSpeech(){
    const old=readingControl;reading=-1;readingControl=null;
    if('speechSynthesis' in window)window.speechSynthesis.cancel();
    if(old){old.setAttribute('aria-pressed','false');old.querySelector('span').textContent='Read aloud'}
  }
  function speak(index,text,control){
    if(!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined'){
      onError('Read aloud is not supported in this browser');return;
    }
    if(reading===index){stopSpeech();return;}
    stopSpeech();
    if(!text.trim())return;
    const u=new SpeechSynthesisUtterance(text.slice(0,14000));
    reading=index;readingControl=control;
    control.setAttribute('aria-pressed','true');
    control.querySelector('span').textContent='Stop';
    u.onend=()=>{if(reading===index)stopSpeech()};
    u.onerror=()=>{if(reading===index)stopSpeech()};
    window.speechSynthesis.speak(u);
  }
  function edit(index,text,row){
    if(isBusy())return;
    const bubble=row.querySelector('.turn-user-content');
    const original=bubble.textContent;
    bubble.replaceChildren();
    const input=document.createElement('textarea');
    input.className='turn-edit-field';input.value=text;input.rows=4;
    const buttons=document.createElement('div');buttons.className='turn-edit-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='turn-cancel';cancel.textContent='Cancel';
    const save=document.createElement('button');save.type='button';save.className='turn-save';save.textContent='Save & submit';
    const restore=()=>{bubble.replaceChildren();bubble.textContent=original};
    cancel.addEventListener('click',restore);
    save.addEventListener('click',async()=>{
      if(!input.value.trim()){onError('Message cannot be empty');return;}
      save.disabled=true;
      try{await onEdit(index,input.value)}catch(e){onError(e.message);save.disabled=false;}
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();restore()}
      if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();save.click()}
    });
    buttons.append(cancel,save);bubble.append(input,buttons);
    input.focus();
  }
  function render(messages){
    root.replaceChildren();
    for(let i=0;i<messages.length;i++){
      const msg=messages[i];
      if(!['user','assistant'].includes(msg?.role))continue;
      const row=document.createElement('section');row.className='chat-turn '+msg.role;
      const inner=document.createElement('div');inner.className='turn-inner';
      if(msg.role==='assistant'){
        const avatar=document.createElement('img');avatar.src=logo;avatar.alt='';avatar.className='turn-avatar';
        inner.append(avatar);
      }
      const stack=document.createElement('div');stack.className='turn-stack';
      const content=document.createElement('div');
      content.className=msg.role==='user'?'turn-user-content':'turn-assistant-content';
      if(msg.role==='assistant')renderAssistantText(msg.content,content);
      else content.textContent=msg.content||'';
      stack.append(content);
      if(Array.isArray(msg.attachments)&&msg.attachments.length){
        const gallery=document.createElement('div');gallery.className='turn-attachments';
        renderAttachmentTiles(gallery,msg.attachments,{sprite,inspector,getContent:getAttachment});
        stack.append(gallery);
      }
      if(Array.isArray(msg.sources)&&msg.sources.length){
        const sources=document.createElement('div');sources.className='turn-sources';
        const title=document.createElement('strong');title.textContent='Sources';sources.append(title);
        for(const s of msg.sources){
          const href=safeUrl(s.url);if(!href)continue;
          const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';
          link.textContent=s.title||new URL(href).hostname;sources.append(link);
        }
        stack.append(sources);
      }
      const toolbar=document.createElement('div');toolbar.className='turn-actions';
      if(msg.role==='user'){
        toolbar.append(action('edit','Edit',sprite,()=>edit(i,msg.content,row)));
      }else if(msg.content?.trim()){
        if(onRegenerate)toolbar.append(action('regenerate','Regenerate',sprite,async()=>{
          if(isBusy())return;
          try{await onRegenerate(i)}catch(e){onError(e.message)}
        }));
        toolbar.append(action('copy','Copy',sprite,async e=>{
          try{await navigator.clipboard.writeText(msg.content);e.currentTarget.querySelector('span').textContent='Copied'}
          catch{onError('Copy requires clipboard permission')}
        }));
        const read=action('volume','Read aloud',sprite,e=>speak(i,msg.content,e.currentTarget));
        read.setAttribute('aria-pressed',String(reading===i));
        if(reading===i){read.querySelector('span').textContent='Stop';readingControl=read;}
        toolbar.append(read);
      }
      if(toolbar.childElementCount)stack.append(toolbar);
      inner.append(stack);row.append(inner);root.append(row);
    }
    const pane=root.closest('.conversation')||root.closest('#conversation');
    if(pane)pane.scrollTop=pane.scrollHeight;
  }
  return {render,stopSpeech};
}
