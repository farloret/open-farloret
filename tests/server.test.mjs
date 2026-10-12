import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { isChatId } from '../public/chat-id.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function launch(dir) {
  return new Promise((resolve,reject) => {
    const child=spawn(process.execPath,['server.js'],{
      cwd:root,
      env:{...process.env,PORT:'0',HOST:'127.0.0.1',
        FARLORET_DATA_DIR:dir,BRAVE_SEARCH_API_KEY:'',OPENAI_API_KEY:''},
      stdio:['ignore','pipe','pipe']
    });
    let output='';
    let settled=false;
    const timeout=setTimeout(()=>fail(new Error('Server boot timeout: '+output)),12000);
    const fail=err=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeout);
      child.kill();
      reject(err);
    };
    child.on('error',fail);
    child.once('exit',code=>fail(new Error('Server exited '+code+': '+output)));
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      const match=output.match(/running at http:\/\/127\.0\.0\.1:(\d+)/);
      if(match&&!settled){
        settled=true;
        clearTimeout(timeout);
        resolve({child,origin:'http://127.0.0.1:'+match[1]});
      }
    });
    child.stderr.on('data',chunk=>{output+=chunk.toString()});
  });
}

async function stop(child) {
  if(child.exitCode!==null || child.signalCode!==null)return;
  await new Promise(resolve=>{
    child.once('exit',resolve);
    child.kill('SIGTERM');
  });
}
async function req(origin,path,method='GET',payload) {
  const options={method};
  if(payload!==undefined){
    options.headers={'content-type':'application/json'};
    options.body=JSON.stringify(payload);
  }
  const response=await fetch(origin+path,options);
  const data=await response.json();
  return {status:response.status,data};
}

test('Node server uses persistent UUID chat IDs and searches message text after restart',async () => {
  const dir=await mkdtemp(join(tmpdir(),'farloret-test-'));
  let active;
  try{
    active=await launch(dir);
    const {origin}=active;
    const status=await req(origin,'/api/status');
    assert.equal(status.status,200);
    assert.equal(status.data.webSearch,false);
    const missingWeb=await req(origin,'/api/web-search','POST',{query:'news'});
    assert.equal(missingWeb.status,503);
    assert.match(missingWeb.data.error,/BRAVE_SEARCH_API_KEY/);

    const made=await req(origin,'/api/chats','POST');
    assert.equal(made.status,201);
    const id=made.data.chat.id;
    assert.ok(isChatId(id));
    assert.equal((await req(origin,'/api/chats/not-a-uuid')).status,404);

    const saved=await req(origin,'/api/chats/'+id,'PATCH',{
      title:'First chat',
      messages:[{role:'user',content:'I want to understand quantum entanglement'}]
    });
    assert.equal(saved.status,200);

    const results=await req(origin,'/api/chats/search?q=ENTANGLEMENT');
    assert.equal(results.status,200);
    assert.deepEqual(results.data.chats.map(c=>c.id),[id]);
    assert.match(results.data.chats[0].preview,/entanglement/);
    assert.equal((await req(origin,'/api/chats/search?q=notfound')).data.chats.length,0);

    const html=await (await fetch(origin+'/')).text();
    assert.match(html,/id="web-search-toggle"/);
    assert.match(html,/id="search-dialog"/);
    assert.match(html,/id="model-picker"/);
    assert.equal((await fetch(origin+'/composer-toolbar.css')).status,200);
    assert.equal((await fetch(origin+'/chat-search.js')).status,200);
    assert.equal((await fetch(origin+'/chat-id.js')).status,200);
    assert.ok(JSON.parse(await readFile(join(dir,'chats.json'),'utf8')).some(c=>c.id===id));

    await stop(active.child);
    active=await launch(dir);
    const loaded=await req(active.origin,'/api/chats/'+id);
    assert.equal(loaded.status,200);
    assert.equal(loaded.data.chat.id,id);
    assert.equal(loaded.data.chat.messages[0].content,'I want to understand quantum entanglement');
    assert.deepEqual((await req(active.origin,'/api/chats/search?q=quantum')).data.chats.map(x=>x.id),[id]);
    assert.equal((await req(active.origin,'/api/chats/'+id,'DELETE')).status,200);
    assert.equal((await req(active.origin,'/api/chats/'+id)).status,404);
  } finally {
    if(active)await stop(active.child);
    await rm(dir,{recursive:true,force:true});
  }
});
