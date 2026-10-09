import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chatTitle, createChat, appendUserMessage, sortedChats, parseChats } from './demo-state.mjs';

test('blank model never creates assistant messages', () => {
  const chat = appendUserMessage(appendUserMessage(createChat('id','Hello',10),'Hi',11),'Are you there?',12);
  assert.deepEqual(chat.messages.map(m => m.role), ['user','user']);
  assert.equal(chat.messages[1].content, 'Are you there?');
});

test('empty messages are ignored and titles normalized', () => {
  const chat = createChat('id', '   Hello  there\n  ', 10);
  assert.equal(chat.title, 'Hello there');
  assert.equal(appendUserMessage(chat,'  ', 12), chat);
  assert.equal(chatTitle(''), 'New conversation');
});

test('search is case-insensitive and starred chats are first', () => {
  const a = { ...createChat('a', 'Modern Scarlet', 5), starred: true };
  const b = createChat('b', 'scarlet palette', 9);
  const c = createChat('c', 'not a match', 11);
  assert.deepEqual(sortedChats([b,c,a],'SCARLET').map(chat => chat.id), ['a','b']);
});

test('malformed browser data loads safely', () => {
  assert.deepEqual(parseChats('{broken'), []);
  assert.deepEqual(parseChats('{"oops":true}'), []);
  assert.deepEqual(parseChats(null), []);
});

test('stored data contains only user messages and text', () => {
  const stored = JSON.stringify([{
    id: 'id', title: '<script>bad()</script>', starred: false, updatedAt: 2,
    messages: [{role:'assistant',content:'Fake assistant'}, {role:'user',content:'hello'}]
  }]);
  const chat = parseChats(stored)[0];
  assert.deepEqual(chat.messages, [{role:'user',content:'hello'}]);
  assert.equal(chat.title, '<script>bad()</script>');
});

test('public page uses relative assets, single blank model and accessible controls', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\.\/demo\.css"/);
  assert.match(html, /src="\.\/demo\.js"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /role="listbox"/);
  assert.doesNotMatch(html, /<select\b/i);
  assert.doesNotMatch(html, /(?:src|href)="\//);
  assert.match(html, /id="sidebar"/);
  assert.match(html, /id="composer"/);
  assert.match(html, /id="search"/);
});

test('public preview never makes AI or external network requests', async () => {
  const script = await readFile(new URL('./demo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(script, /\bWebSocket\s*\(/);
  assert.match(script, /appendUserMessage/);
});

test('redesign is neutral white and gray, with a centered composer', async () => {
  const css = await readFile(new URL('./demo.css', import.meta.url), 'utf8');
  assert.match(css, /--page: #ffffff/);
  assert.match(css, /--sidebar: #f9f9f9/);
  assert.match(css, /\.chat-main\.is-empty \.workspace \{ justify-content: center/);
  assert.match(css, /\.chat-main\.is-empty \.bottom/);
  assert.doesNotMatch(css, /#(?:ab4650|a25152|ad4952|e7cecb|f3f1ee|faf9f7)/i);
});

test('official uploaded Scarlet logo is used unchanged everywhere', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const asset = await readFile(new URL('../public/assets/scarlet-logo.png', import.meta.url));
  assert.equal(asset.length, 4029);
  assert.equal(createHash('sha256').update(asset).digest('hex'),
    'c1ef82e1326d3b8c6b7944006982976df37427c0b90f89502d04da2ee5263260');
  const demo = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('./demo.css', import.meta.url), 'utf8');
  assert.ok(demo.includes('class="identity-logo" src="./assets/scarlet-logo.png"'));
  assert.ok(demo.includes('class="build-logo" src="./assets/scarlet-logo.png"'));
  assert.ok(demo.includes('rel="icon" type="image/png" href="./assets/scarlet-logo.png"'));
  assert.ok(app.includes('class="brand-logo" src="/assets/scarlet-logo.png"'));
  assert.ok(app.includes('class="welcome-logo" src="/assets/scarlet-logo.png"'));
  assert.ok(app.includes('rel="icon" type="image/png" href="/assets/scarlet-logo.png"'));
  assert.ok(server.includes("'/assets/scarlet-logo.png':'assets/scarlet-logo.png'"));
  assert.ok(server.includes("name.endsWith('.png')?'image/png'"));
  assert.ok(style.includes('.identity-logo, .build-logo'));
  assert.doesNotMatch(demo, /class="identity-mark"|class="build-mark"/);
});


test('consistent custom icon family serves both public and self-hosted interfaces', async () => {
  const sprite = await readFile(new URL('../public/assets/ui-icons.svg', import.meta.url), 'utf8');
  const demo = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const dynamic = await readFile(new URL('./demo.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const ids = ['panel-hide','panel-show','compose','search','close','theme-moon','theme-sun',
    'download','trash','chevron-down','send','open-arrow','edit','star','star-filled','info','model','check'];
  assert.match(sprite, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
  assert.equal((sprite.match(/<symbol id=/g)||[]).length, ids.length);
  for (const id of ids) {
    assert.equal((sprite.match(new RegExp('<symbol id="' + id + '"', 'g'))||[]).length, 1, id);
  }
  for (const [source, name] of [[demo, 'Pages'], [app, 'self-hosted']]) {
    const uses = [...source.matchAll(/<use href="(?:\.\/|\/)assets\/ui-icons\.svg#([a-z-]+)"/g)].map(m => m[1]);
    assert.ok(uses.length >= 5, name + ' should expose control icons');
    for (const id of uses) assert.ok(ids.includes(id), name + ' references missing ' + id);
  }
  assert.match(dynamic, /star-filled/);
  assert.match(dynamic, /theme-sun/);
  assert.doesNotMatch(demo, /&nearr;|&times;/);
  assert.doesNotMatch(app, /☰|◐|↗/);
  assert.match(server, /image\/svg\+xml/);
  assert.match(server, /ui-icons\.svg/);
});


test('new chat uses a restrained square-and-pencil glyph in both apps', async () => {
  const sprite = await readFile(new URL('../public/assets/ui-icons.svg', import.meta.url), 'utf8');
  const demo = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const selfHosted = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const match = sprite.match(/<symbol id="compose"[^>]*>([\s\S]*?)<\/symbol>/);
  assert.ok(match, 'new-chat glyph must be present in the shared sprite');
  assert.match(match[1], /M11\.5 4H7/);
  assert.match(match[1], /6\.65-6\.65/);
  // The pencil is 2.5 units higher; the square outline does not move.
  assert.equal((match[1].match(/transform="translate\(0 -2\.5\)"/g) || []).length, 2);
  assert.match(match[1], /^<path d="M11\.5 4H7/);
  assert.doesNotMatch(match[1], /M18 3\.5v7|m-4\.5 2v-4\.6/);
  assert.match(demo, /ui-icons\.svg\?v=3#compose/);
  assert.match(selfHosted, /ui-icons\.svg\?v=3#compose/);
});


test('both model pickers are custom keyboard-accessible listboxes', async () => {
  const demo = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const html of [demo, app]) {
    assert.doesNotMatch(html, /<select\b/i);
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-controls="model-options"/);
    assert.match(html, /role="listbox"/);
    assert.match(html, /data-model-popup hidden/);
    assert.match(html, /model-picker\.css/);
  }
  const demoJS = await readFile(new URL('./demo.js', import.meta.url), 'utf8');
  const appJS = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(demoJS, /createModelPicker/);
  assert.match(appJS, /modelPicker\.getValue\(\)/);
  assert.match(appJS, /modelPicker\.setItems/);
  assert.doesNotMatch(appJS, /\$\('model'\)/);
});

test('model options are sanitized and keyboard navigation clamps correctly', async () => {
  const { normalizeModelOptions, nextModelIndex } = await import('../public/model-picker.js');
  assert.deepEqual(normalizeModelOptions(['', 'gpt-a', 'gpt-a', '  gpt-b  ', null]).map(x=>x.value), ['gpt-a','gpt-b']);
  assert.deepEqual(normalizeModelOptions([{value:'demo',label:'Blank model',description:'Silent'}]),[
    {value:'demo',label:'Blank model',description:'Silent',tag:''}
  ]);
  assert.equal(nextModelIndex('ArrowDown',0,3),1);
  assert.equal(nextModelIndex('ArrowDown',2,3),2);
  assert.equal(nextModelIndex('ArrowUp',0,3),0);
  assert.equal(nextModelIndex('Home',2,3),0);
  assert.equal(nextModelIndex('End',0,3),2);
  assert.equal(nextModelIndex('PageDown',0,20),8);
  assert.equal(nextModelIndex('ArrowUp',0,0),-1);
  const source = await readFile(new URL('../public/model-picker.js', import.meta.url), 'utf8');
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /aria-selected/);
  assert.match(source, /pointerdown/);
  assert.match(source, /textContent = item\.label/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
