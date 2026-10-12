import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isChatId } from './public/chat-id.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.FARLORET_DATA_DIR || join(ROOT, '.data');
const CHATS_FILE = join(DATA_DIR, 'chats.json');
const API_BASE = (process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const API_KEY = process.env.OPENAI_API_KEY || '';
const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const DATA = new Map();
const ID_PATH = /^\/api\/chats\/([0-9a-f-]+)$/i;
const ASSETS = {
  '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js',
  '/styles.css': 'styles.css', '/model-picker.js': 'model-picker.js',
  '/model-picker.css': 'model-picker.css', '/composer-toolbar.css': 'composer-toolbar.css',
  '/chat-id.js': 'chat-id.js', '/chat-search.js': 'chat-search.js',
  '/assets/scarlet-logo.png': 'assets/scarlet-logo.png',
  '/assets/ui-icons.svg': 'assets/ui-icons.svg'
};
let writing = Promise.resolve();

async function load() {
  try {
    const chats = JSON.parse(await readFile(CHATS_FILE, 'utf8'));
    if (!Array.isArray(chats)) return;
    for (const chat of chats.slice(-3000)) {
      if (!chat || !isChatId(chat.id) || !Array.isArray(chat.messages)) continue;
      DATA.set(chat.id.toLowerCase(), {
        id: chat.id.toLowerCase(),
        title: typeof chat.title === 'string' ? chat.title.slice(0,120) : 'New conversation',
        updatedAt: Number(chat.updatedAt) || 0,
        messages: chat.messages.filter(m =>
          m && ['user','assistant'].includes(m.role) && typeof m.content === 'string'
        ).slice(-100).map(m => ({
          role: m.role, content: m.content.slice(0,50000),
          ...(m.sources && Array.isArray(m.sources) ? { sources: safeSources(m.sources) } : {})
        }))
      });
    }
  } catch(error) {
    if (error.code !== 'ENOENT') console.error('Could not read conversations:', error);
  }
}

function persist() {
  const snapshot = JSON.stringify([...DATA.values()]);
  const job = async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const temp = join(DATA_DIR, 'chats.' + randomUUID() + '.tmp');
    await writeFile(temp, snapshot, {mode:0o600});
    await rename(temp, CHATS_FILE);
  };
  writing = writing.catch(error => console.error('Previous save failed:', error)).then(job);
  return writing;
}

function safeSources(items) {
  return items.slice(0,7).flatMap(source => {
    try {
      const uri = new URL(String(source.url));
      if (!['http:','https:'].includes(uri.protocol)) return [];
      return [{
        url: uri.href.slice(0,1000),
        title: String(source.title || uri.hostname).slice(0,160),
        description: String(source.description || '').slice(0,700)
      }];
    } catch { return []; }
  });
}

function respond(res, code, value) {
  res.writeHead(code, {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store'});
  res.end(JSON.stringify(value));
}

async function requestJSON(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}

function searchChats(query) {
  const needle = String(query || '').trim().toLocaleLowerCase().slice(0,120);
  return [...DATA.values()].filter(chat =>
    !needle || chat.title.toLocaleLowerCase().includes(needle) ||
      chat.messages.some(m => m.content.toLocaleLowerCase().includes(needle))
  ).map(chat => {
    const matched = chat.messages.find(m => !needle || m.content.toLocaleLowerCase().includes(needle));
    return {
      id:chat.id, title:chat.title, updatedAt:chat.updatedAt,
      preview: matched?.content.slice(0,200) || '',
      starred:false
    };
  }).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100);
}

async function braveSearch(query) {
  if (!BRAVE_KEY) throw new Error('BRAVE_SEARCH_API_KEY is not configured');
  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.searchParams.set('q', query.slice(0,500));
  endpoint.searchParams.set('count','5');
  endpoint.searchParams.set('safesearch','moderate');
  const response = await fetch(endpoint, {
    headers:{'accept':'application/json','X-Subscription-Token':BRAVE_KEY},
    signal: AbortSignal.timeout(13000)
  });
  if (!response.ok) throw new Error('Search provider returned HTTP ' + response.status);
  const json = await response.json();
  return safeSources(Array.isArray(json?.web?.results) ? json.web.results : []);
}

await load();

const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'");
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host) {
        return respond(res,403,{error:'Cross-origin request blocked'});
      }
      if (url.pathname === '/api/status' && req.method === 'GET') {
        return respond(res,200,{
          stage:'scarlet',ok:true,configured:!!API_KEY||API_BASE.includes('11434'),
          webSearch:!!BRAVE_KEY
        });
      }
      if (url.pathname === '/api/chats' && req.method === 'GET') {
        return respond(res,200,{chats:searchChats('')});
      }
      if (url.pathname === '/api/chats' && req.method === 'POST') {
        const id = randomUUID();
        const chat = {id,title:'New conversation',messages:[],updatedAt:Date.now()};
        DATA.set(id,chat);
        await persist();
        return respond(res,201,{chat});
      }
      if (url.pathname === '/api/chats/search' && req.method === 'GET') {
        return respond(res,200,{chats:searchChats(url.searchParams.get('q'))});
      }
      const match = url.pathname.match(ID_PATH);
      if (match && isChatId(match[1])) {
        const chat = DATA.get(match[1].toLowerCase());
        if (!chat) return respond(res,404,{error:'Chat not found'});
        if (req.method === 'GET') return respond(res,200,{chat});
        if (req.method === 'DELETE') {
          DATA.delete(chat.id);
          await persist();
          return respond(res,200,{ok:true});
        }
        if (req.method === 'PATCH') {
          const changes = await requestJSON(req);
          if (typeof changes.title === 'string') chat.title = changes.title.trim().slice(0,120) || chat.title;
          if (Array.isArray(changes.messages)) chat.messages = changes.messages.filter(m =>
            m && ['user','assistant'].includes(m.role) && typeof m.content === 'string'
          ).slice(-100).map(m => ({
            role:m.role,content:m.content.slice(0,50000),
            ...(Array.isArray(m.sources)?{sources:safeSources(m.sources)}:{})
          }));
          chat.updatedAt = Date.now();
          await persist();
          return respond(res,200,{chat});
        }
        return respond(res,405,{error:'Unsupported method'});
      }
      if (url.pathname === '/api/models' && req.method === 'GET') {
        const result = await fetch(API_BASE+'/models',{
          headers:API_KEY?{'Authorization':'Bearer '+API_KEY}:{},signal:AbortSignal.timeout(8000)
        });
        if (!result.ok) return respond(res,502,{error:'Model discovery failed'});
        const models = await result.json();
        return respond(res,200,{models:(models.data||[]).map(m=>m.id).filter(x=>typeof x==='string')});
      }
      if (url.pathname === '/api/web-search' && req.method === 'POST') {
        if (!BRAVE_KEY) return respond(res,503,{error:'Set BRAVE_SEARCH_API_KEY to enable web search'});
        const input = await requestJSON(req);
        const q = typeof input.query === 'string' ? input.query.trim() : '';
        if (!q || q.length>500) return respond(res,400,{error:'Invalid search query'});
        try{return respond(res,200,{results:await braveSearch(q)});}
        catch(error){return respond(res,502,{error:'Web search failed: '+error.message});}
      }
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const input = await requestJSON(req);
        if (typeof input.model !== 'string' || !Array.isArray(input.messages) ||
            input.messages.length > 100 || input.model.length > 300 ||
            !input.messages.every(m => m && ['system','user','assistant'].includes(m.role) &&
              typeof m.content === 'string' && m.content.length <= 100_000)) {
          return respond(res,400,{error:'Invalid chat payload'});
        }
        const result = await fetch(API_BASE+'/chat/completions',{
          method:'POST',
          headers:{'content-type':'application/json',
            ...(API_KEY?{'Authorization':'Bearer '+API_KEY}:{})},
          body:JSON.stringify({model:input.model,messages:input.messages,stream:true}),
          signal:AbortSignal.timeout(90_000)
        });
        if (!result.ok) return respond(res,result.status,{error:(await result.text()).slice(0,1200)});
        res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8',
          'cache-control':'no-cache','x-accel-buffering':'no'});
        for await (const chunk of result.body) res.write(chunk);
        return res.end();
      }
      return respond(res,404,{error:'Unknown endpoint'});
    }
    const name = ASSETS[url.pathname];
    if (!name) {res.writeHead(404);return res.end('Not found');}
    const mime = name.endsWith('.png')?'image/png':
      name.endsWith('.svg')?'image/svg+xml; charset=utf-8':
      name.endsWith('.js')?'text/javascript; charset=utf-8':
      name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
    res.writeHead(200,{'content-type':mime});
    return res.end(await readFile(join(ROOT,'public',name)));
  } catch(error) {
    console.error(error);
    if (!res.headersSent) respond(res,500,{error:'Internal server error'});
    else res.end();
  }
});
server.listen(PORT,HOST,()=>console.log('Open Farloret Scarlet running at http://'+HOST+':'+server.address().port));
