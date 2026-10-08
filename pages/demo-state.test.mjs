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
  assert.match(html, /<option value="blank" selected>/);
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
