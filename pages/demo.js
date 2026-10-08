import {
  STORAGE_KEY, createChat, appendUserMessage, sortedChats, parseChats
} from './demo-state.mjs';

// Deliberately frontend-only: the public preview NEVER calls an AI or backend.
const $ = id => document.getElementById(id);
const THEME_KEY = 'open-farloret-scarlet-demo-theme';
const MOBILE = '(max-width: 760px)';
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  star: 'm12 2.8 2.8 5.7 6.3.9-4.5 4.4 1.1 6.3-5.7-3-5.6 3 1.1-6.3-4.5-4.4 6.3-.9Z',
  edit: 'M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7 M16 3l5 5-9 9-4 1 1-4 9-9Z',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 14h10l1-14 M9 7V4h6v3'
};
let chats = [];
let currentId = null;

function saved(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function inform(text) { $('notice').textContent = text; }
function save() {
  try {
    chats = chats.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    inform('');
  } catch { inform('Storage is unavailable, so this chat may not be saved.'); }
}
function currentChat() { return chats.find(chat => chat.id === currentId) || null; }
function makeIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
function makeButton(text, title, className, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.className = className;
  if (ICON_PATHS[text]) button.append(makeIcon(text));
  else button.textContent = text;
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
    empty.textContent = chats.length ? 'No matching conversations.' : 'Your conversations will appear here.';
    container.append(empty);
    return;
  }
  for (const chat of visible) {
    const row = document.createElement('div');
    row.className = 'chat-row' + (chat.id === currentId ? ' active' : '');
    const open = makeButton(chat.title, 'Open ' + chat.title, 'chat-open', () => openChat(chat.id));
    row.append(open);

    const actions = document.createElement('div');
    actions.className = 'chat-actions';
    actions.append(makeButton('star', chat.starred ? 'Unstar chat' : 'Star chat',
      'chat-action' + (chat.starred ? ' starred' : ''), () => {
        chat.starred = !chat.starred;
        save();
        renderSidebar();
      }));
    actions.append(makeButton('edit', 'Rename chat', 'chat-action', () => {
      const input = document.createElement('input');
      input.className = 'rename-input';
      input.value = chat.title;
      open.replaceWith(input);
      actions.hidden = true;
      input.focus();
      input.select();
      let finished = false;
      function finish(commit) {
        if (finished) return;
        finished = true;
        if (commit && input.value.trim()) {
          chat.title = input.value.trim().slice(0, 100);
          chat.updatedAt = Date.now();
          save();
        }
        renderSidebar();
      }
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') finish(false);
        event.stopPropagation();
      });
    }));
    actions.append(makeButton('trash', 'Delete chat', 'chat-action', () => {
      if (!window.confirm('Delete this demo conversation?')) return;
      chats = chats.filter(item => item.id !== chat.id);
      if (currentId === chat.id) currentId = null;
      save();
      render();
    }));
    row.append(actions);
    container.append(row);
  }
}
function renderConversation() {
  const chat = currentChat();
  const messages = chat ? chat.messages : [];
  const empty = messages.length === 0;
  $('main').classList.toggle('is-empty', empty);
  $('welcome').hidden = !empty;
  $('silent-note').hidden = empty;
  $('messages').replaceChildren();

  for (const message of messages) {
    const article = document.createElement('article');
    article.className = 'message user';
    const bubble = document.createElement('div');
    bubble.className = 'content';
    // Never use innerHTML with stored user messages.
    bubble.textContent = message.content;
    article.append(bubble);
    $('messages').append(article);
  }
  if (!empty) $('conversation').scrollTop = $('conversation').scrollHeight;
}
function render() { renderSidebar(); renderConversation(); }
function setSidebarOpen(open) {
  $('sidebar').classList.toggle('hidden', !open);
  document.body.classList.toggle('sidebar-open', open);
  $('sidebar-scrim').hidden = !open || !window.matchMedia(MOBILE).matches;
  $('expand').setAttribute('aria-expanded', String(open));
  if (open && window.matchMedia(MOBILE).matches) $('collapse').focus();
}
function hideSidebarOnMobile() {
  if (window.matchMedia(MOBILE).matches) setSidebarOpen(false);
}
function openChat(id) {
  currentId = chats.some(chat => chat.id === id) ? id : null;
  render();
  hideSidebarOnMobile();
}
function newChat() {
  currentId = null;
  $('search').value = '';
  toggleSearch(false);
  $('prompt').value = '';
  updateComposer();
  render();
  hideSidebarOnMobile();
  $('prompt').focus();
}
function updateComposer() {
  const input = $('prompt');
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  $('send').disabled = !input.value.trim();
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
  updateComposer();
  save();
  render();
  // Blank model: no fetch, no generated assistant message, no placeholder answer.
  $('prompt').focus();
}
function exportChats() {
  const file = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
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
  $('theme').setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  $('theme-label').textContent = isDark ? 'Dark' : 'Light';
  try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch {}
}
function toggleSearch(open) {
  $('searchbox').hidden = !open;
  $('search-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('search').focus();
  else { $('search').value = ''; renderSidebar(); }
}
function init() {
  chats = parseChats(saved(STORAGE_KEY));
  setTheme(saved(THEME_KEY) === 'dark');
  setSidebarOpen(!window.matchMedia(MOBILE).matches);
  $('new').addEventListener('click', newChat);
  $('search-toggle').addEventListener('click', () => toggleSearch($('searchbox').hidden));
  $('search-close').addEventListener('click', () => toggleSearch(false));
  $('search').addEventListener('input', renderSidebar);
  $('expand').addEventListener('click', () => setSidebarOpen(true));
  $('collapse').addEventListener('click', () => setSidebarOpen(false));
  $('sidebar-scrim').addEventListener('click', () => setSidebarOpen(false));
  $('theme').addEventListener('click', () => setTheme(!document.body.classList.contains('dark')));
  $('composer').addEventListener('submit', event => {
    event.preventDefault();
    sendMessage();
  });
  $('prompt').addEventListener('input', updateComposer);
  $('prompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!$('searchbox').hidden) toggleSearch(false);
      else hideSidebarOnMobile();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setSidebarOpen(true);
      toggleSearch(true);
    }
  });
  for (const button of document.querySelectorAll('[data-prompt]')) {
    button.addEventListener('click', () => {
      $('prompt').value = button.dataset.prompt;
      updateComposer();
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
  window.addEventListener('resize', () => {
    if (!window.matchMedia(MOBILE).matches) $('sidebar-scrim').hidden = true;
    else $('sidebar-scrim').hidden = $('sidebar').classList.contains('hidden');
  });
  updateComposer();
  render();
}
init();
