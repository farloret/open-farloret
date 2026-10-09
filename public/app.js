import { createModelPicker } from './model-picker.js';
const $=id=>document.getElementById(id);
const modelPicker=createModelPicker({
  root:$('model-picker'),
  spriteUrl:'/assets/ui-icons.svg',
  footerText:'Choose a model from your configured provider.',
  onChange(value){try{if(value)localStorage.setItem('farloret_model',value)}catch{}}
});
let current=null, chats=[], messages=[], pending=false;
const api=async(path,options={})=>{const res=await fetch('/api'+path,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const json=await res.json();if(!res.ok)throw Error(json.error||'Request failed');return json};
function updateMessages(){const root=$('messages');root.replaceChildren();$('welcome').hidden=messages.length>0;for(const m of messages){const node=document.createElement('article');node.className='message '+m.role;const role=document.createElement('div');role.className='role';role.textContent=m.role==='user'?'You':modelPicker.getValue()||'Assistant';const content=document.createElement('div');content.textContent=m.content;node.append(role,content);root.append(node)}$('conversation').scrollTop=$('conversation').scrollHeight}
async function refresh(){try{chats=(await api('/chats')).chats;const q=$('search').value.toLowerCase();$('chats').replaceChildren();for(const chat of chats.filter(c=>c.title.toLowerCase().includes(q))){const btn=document.createElement('button');btn.textContent=chat.title;btn.className=chat.id===current?'selected':'';btn.onclick=()=>open(chat.id);btn.oncontextmenu=async e=>{e.preventDefault();if(confirm('Delete this conversation?')){await api('/chats/'+chat.id,{method:'DELETE'});if(current===chat.id){current=null;messages=[];updateMessages()}refresh()}};$('chats').append(btn)}}catch(e){console.error(e)}}
async function open(id){current=id;messages=(await api('/chats/'+id)).chat.messages;updateMessages();refresh();if(innerWidth<720)$('sidebar').classList.add('hidden')}
function newChat(){current=null;messages=[];updateMessages();refresh();$('prompt').focus();if(innerWidth<720)$('sidebar').classList.add('hidden')}
async function models(){
  modelPicker.setStatus('Connecting to provider…');
  try{
    const response=await api('/models');
    const names=Array.isArray(response.models)?response.models:[];
    let preferred='';
    try{preferred=localStorage.getItem('farloret_model')||''}catch{}
    modelPicker.setItems(names.map(name=>({value:name,label:name,description:'Available from your provider'})),preferred);
    if(!names.length)modelPicker.setStatus('No models found. Install a model in Ollama or configure a provider.');
  }catch(error){
    modelPicker.setItems([]);
    modelPicker.setStatus('Provider offline. Start Ollama or check your API connection.');
  }
}
function getText(event){event.preventDefault();send()}
async function send(){if(pending)return;const value=$('prompt').value.trim(),model=modelPicker.getValue();if(!value||!model){if(!model)alert('Connect an Ollama or OpenAI-compatible provider and select a model.');return}pending=true;$('send').disabled=true;$('prompt').value='';try{if(!current){const c=(await api('/chats',{method:'POST'})).chat;current=c.id;await api('/chats/'+current,{method:'PATCH',body:JSON.stringify({title:value.slice(0,52)})})}messages.push({role:'user',content:value},{role:'assistant',content:''});updateMessages();await refresh();const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:messages.slice(0,-1)})});if(!response.ok){const err=await response.json();throw Error(err.error||'Model request failed')}const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';while(true){const {done,value:chunk}=await reader.read();if(done)break;buffer+=decoder.decode(chunk,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){if(!line.startsWith('data: '))continue;const data=line.slice(6);if(data==='[DONE]')continue;try{messages[messages.length-1].content+=JSON.parse(data).choices?.[0]?.delta?.content||'';updateMessages()}catch{}}}await api('/chats/'+current,{method:'PATCH',body:JSON.stringify({messages})})}catch(err){messages[messages.length-1].content+='\nError: '+err.message;updateMessages()}finally{pending=false;$('send').disabled=false}}
$('composer').addEventListener('submit',getText);$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});$('new').onclick=newChat;$('search').oninput=refresh;$('collapse').onclick=()=>$('sidebar').classList.add('hidden');$('expand').onclick=()=>$('sidebar').classList.remove('hidden');const updateThemeIcon=()=>{$('theme').querySelector('use').setAttribute('href','/assets/ui-icons.svg#'+(document.body.classList.contains('dark')?'theme-sun':'theme-moon'))};$('theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('farloret_dark',document.body.classList.contains('dark')?'1':'0');updateThemeIcon()};if(localStorage.getItem('farloret_dark')==='1')document.body.classList.add('dark');updateThemeIcon();if(innerWidth<720)$('sidebar').classList.add('hidden');for(const btn of document.querySelectorAll('[data-prompt]'))btn.onclick=()=>{$('prompt').value=btn.dataset.prompt;$('prompt').focus()};models();refresh();