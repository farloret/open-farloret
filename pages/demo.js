import {
  STORAGE_KEY, createChat, appendUserMessage, sortedChats, parseChats
} from './demo-state.mjs';

const $ = id => document.getElementById(id);
const THEME_KEY = 'open-farloret-scarlet-demo-theme';
let chats = [];
let currentId = null;

function getSaved(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function inform(text) {
  $('notice').textContent = text;
}

function save() {
  try {
    chats = chats.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    inform('');
  } catch {
    inform('Browser storage is unavailable. This session may not be saved.');
  }
}

function currentChat() {
  return chats.find(chat => chat.id === currentId) || null;
}

function makeButton(text, title, className, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.className = className;
  button.addEventListener('click', action);
  return button;
}

function renderSidebar() {
  const container = $('chats');
  container.replaceChildren();
  const visible = sortedChats(chats, $('search').value);
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-chats';
    empty.textContent = chats.length ? 'No matching conversations.' : 'No conversations yet. Start a chat to test the layout.';
    container.append(empty);
    return;
  }

  for (const chat of visible) {
    const row = document.createElement('div');
    row.className = 'chat-row' + (chat.id === currentId ? ' active' : '');

    row.append(makeButton(chat.title, 'Open ' + chat.title, 'chat-open', () => openChat(chat.id)));
    row.append(makeButton(chat.starred ? '★' : '☆',
      chat.starred ? 'Unstar chat' : 'Star chat', 'chat-action' + (chat.starred ? ' starred' : ''), () => {
        chat.starred = !chat.starred;
        save();
        renderSidebar();
      }));
    row.append(makeButton('✎', 'Rename chat', 'chat-action', () => {
      const name = window.prompt('Rename conversation:', chat.title);
      if (name === null || !name.trim()) return;
      chat.title = name.trim().slice(0, 100);
      chat.updatedAt = Date.now();
      save();
      renderSidebar();
    }));
    row.append(makeButton('×', 'Delete chat', 'chat-action', () => {
      if (!window.confirm('Delete this demo conversation?')) return;
      chats = chats.filter(item => item.id !== chat.id);
      if (currentId === chat.id) currentId = null;
      save();
      render();
    }));

    container.append(row);
  }
}

function renderConversation() {
  const chat = currentChat();
  const messages = chat ? chat.messages : [];
  $('welcome').hidden = messages.length > 0;
  $('silent-note').hidden = messages.length === 0;
  const list = $('messages');
  list.replaceChildren();

  for (const message of messages) {
    const article = document.createElement('article');
    article.className = 'message user';
    const heading = document.createElement('div');
    heading.className = 'role';
    heading.textContent = 'You';
    const content = document.createElement('div');
    // Text content deliberately prevents HTML in saved demo messages from executing.
    content.textContent = message.content;
    article.append(heading, content);
    list.append(article);
  }

  $('conversation').scrollTop = $('conversation').scrollHeight;
}

function render() {
  renderSidebar();
  renderConversation();
}

function hideSidebarOnMobile() {
  if (window.matchMedia('(max-width: 720px)').matches) {
    $('sidebar').classList.add('hidden');
  }
}

function openChat(id) {
  currentId = chats.some(chat => chat.id === id) ? id : null;
  render();
  hideSidebarOnMobile();
}

function newChat() {
  currentId = null;
  $('search').value = '';
  $('prompt').value = '';
  render();
  hideSidebarOnMobile();
  $('prompt').focus();
}

function sendMessage() {
  const text = $('prompt').value.trim();
  if (!text) return;
  let chat = currentChat();
  if (!chat) {
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID() : String(Date.now()) + '-' + String(Math.random());
    chat = createChat(id, text);
    chats.push(chat);
    currentId = id;
  }

  const index = chats.findIndex(item => item.id === currentId);
  chats[index] = appendUserMessage(chat, text);
  $('prompt').value = '';
  save();
  render();

  // Intentional blank model: no generated messages, no API requests, no simulation.
  $('prompt').focus();
}

function exportChats() {
  const data = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'open-farloret-demo-chats.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  $('theme').setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch {}
}

function init() {
  chats = parseChats(getSaved(STORAGE_KEY));
  setTheme(getSaved(THEME_KEY) === 'dark');
  if (window.matchMedia('(max-width: 720px)').matches) hideSidebarOnMobile();

  $('new').addEventListener('click', newChat);
  $('search').addEventListener('input', renderSidebar);
  $('expand').addEventListener('click', () => $('sidebar').classList.remove('hidden'));
  $('collapse').addEventListener('click', () => $('sidebar').classList.add('hidden'));
  $('theme').addEventListener('click', () => setTheme(!document.body.classList.contains('dark')));

  $('composer').addEventListener('submit', event => {
    event.preventDefault();
    sendMessage();
  });
  $('prompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideSidebarOnMobile();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('sidebar').classList.remove('hidden');
      $('search').focus();
    }
  });
  for (const button of document.querySelectorAll('[data-prompt]')) {
    button.addEventListener('click', () => {
      $('prompt').value = button.dataset.prompt;
      $('prompt').focus();
    });
  }
  $('export').addEventListener('click', exportChats);
  $('clear').addEventListener('click', () => {
    if (!chats.length || !window.confirm('Clear all locally saved demo chats?')) return;
    chats = [];
    currentId = null;
    save();
    render();
  });
  render();
}

init();
