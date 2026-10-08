import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const PORT=Number(process.env.PORT||3000);
const HERE=dirname(fileURLToPath(import.meta.url));
const HOST=process.env.HOST||'127.0.0.1';
const DATA=new Map();
const apiBase=(process.env.OPENAI_BASE_URL||'http://127.0.0.1:11434/v1').replace(/\/$/,'');
const apiKey=process.env.OPENAI_API_KEY||'';
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2e6)throw Error('Request too large')}return JSON.parse(raw)}
http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'");
  const url=new URL(req.url||'/', 'http://localhost');
  try{
    if(url.pathname.startsWith('/api/')){
      if(req.method!=='GET'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Cross-origin request blocked'});
      if(url.pathname==='/api/status')return send(res,200,{stage:'scarlet',ok:true,configured:!!apiKey||apiBase.includes('11434')});
      if(url.pathname==='/api/chats'){
        if(req.method==='GET')return send(res,200,{chats:[...DATA.values()].map(({id,title,updatedAt})=>({id,title,updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt)});
        if(req.method==='POST'){const id=crypto.randomUUID();const chat={id,title:'New conversation',messages:[],updatedAt:Date.now()};DATA.set(id,chat);return send(res,201,{chat})}
      }
      const match=url.pathname.match(/^\/api\/chats\/([a-f0-9-]+)$/);
      if(match){const chat=DATA.get(match[1]);if(!chat)return send(res,404,{error:'Chat not found'});if(req.method==='GET')return send(res,200,{chat});if(req.method==='DELETE'){DATA.delete(chat.id);return send(res,200,{ok:true})}if(req.method==='PATCH'){const patch=await body(req);if(typeof patch.title==='string')chat.title=patch.title.slice(0,120);if(Array.isArray(patch.messages))chat.messages=patch.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-100);chat.updatedAt=Date.now();return send(res,200,{chat})}}
      if(url.pathname==='/api/models'&&req.method==='GET'){const upstream=await fetch(apiBase+'/models',{headers:apiKey?{Authorization:'Bearer '+apiKey}:{},signal:AbortSignal.timeout(7000)});if(!upstream.ok)return send(res,502,{error:'Model discovery failed'});const models=await upstream.json();return send(res,200,{models:(models.data||[]).map(m=>m.id)})}
      if(url.pathname==='/api/chat'&&req.method==='POST'){
        const input=await body(req);if(typeof input.model!=='string'||!Array.isArray(input.messages)||input.messages.length>100)return send(res,400,{error:'Invalid chat payload'});
        const upstream=await fetch(apiBase+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',...(apiKey?{Authorization:'Bearer '+apiKey}:{})},body:JSON.stringify({model:input.model,messages:input.messages,stream:true})});
        if(!upstream.ok)return send(res,upstream.status,{error:(await upstream.text()).slice(0,2000)});
        res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','x-accel-buffering':'no'});
        for await(const chunk of upstream.body)res.write(chunk);
        return res.end();
      }
      return send(res,404,{error:'Unknown endpoint'});
    }
    const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
    const name=assets[url.pathname];if(!name){res.writeHead(404);return res.end('Not found')}
    res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
    return res.end(await readFile(join(HERE,'public',name)));
  }catch(err){if(!res.headersSent)return send(res,500,{error:err.message});res.end()}
}).listen(PORT,HOST,()=>console.log('Open Farloret Scarlet running at http://'+HOST+':'+PORT));