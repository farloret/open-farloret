import test from 'node:test';
import assert from 'node:assert/strict';
import { chatTitle, createChat, appendUserMessage, sortedChats, parseChats } from './demo-state.mjs';

test('blank model never creates an assistant message', () => {
  const first = createChat('example', 'Hello, blank model', 10);
  const chat = appendUserMessage(appendUserMessage(first, 'Hi', 11), 'Are you there?', 12);
  assert.equal(chat.messages.length, 2);
  assert.deepEqual(chat.messages.map(message => message.role), ['user', 'user']);
  assert.equal(chat.messages[0].content, 'Hi');
});

test('empty messages are ignored and chat titles are normalized', () => {
  const chat = createChat('example', '   My   demo\nchat  ', 10);
  assert.equal(chat.title, 'My demo chat');
  assert.equal(appendUserMessage(chat, '   ', 12), chat);
  assert.equal(chatTitle(''), 'New conversation');
});

test('search is case insensitive; starred chats come first', () => {
  const one = { ...createChat('one', 'Try Scarlet', 5), starred: true };
  const two = createChat('two', 'scarlet palette', 9);
  const three = createChat('three', 'Something else', 30);
  assert.deepEqual(sortedChats([two, three, one], 'SCARLET').map(chat => chat.id), ['one', 'two']);
});

test('invalid or missing browser data loads safely', () => {
  assert.deepEqual(parseChats('{broken'), []);
  assert.deepEqual(parseChats('{"oops":true}'), []);
  assert.deepEqual(parseChats(null), []);
});

test('browser data allows only user messages, not injected markup', () => {
  const stored = JSON.stringify([{
    id: 'id', title: '<script>alert(1)</script>', starred: false, updatedAt: 2,
    messages: [{role:'assistant',content:'This is not a real model answer'}, {role:'user',content:'hello'}]
  }]);
  const chat = parseChats(stored)[0];
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].content, 'hello');
  assert.equal(chat.title, '<script>alert(1)</script>');
});

test('Pages HTML uses relative paths and only the blank model', async () => {
  const { readFile } = await import('node:fs/promises');
  const markup = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(markup, /src="\.\/demo\.js"/);
  assert.match(markup, /href="\.\/styles\.css"/);
  assert.match(markup, /<option value="blank" selected>/);
  assert.doesNotMatch(markup, /(?:src|href)="\//);
});

test('demo entry point never initiates AI or network requests', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('./demo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(script, /\bWebSocket\s*\(/);
  assert.match(script, /appendUserMessage/);
});
