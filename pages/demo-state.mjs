// Browser-only state for the public Scarlet preview.
// This module performs no network requests and never calls a model.
export const STORAGE_KEY = 'open-farloret-scarlet-demo-v1';

export function chatTitle(text) {
  const normalized = String(text).trim().replace(/\s+/g, ' ');
  return normalized.slice(0, 48) || 'New conversation';
}

export function createChat(id, firstMessage, now = Date.now()) {
  return {
    id,
    title: chatTitle(firstMessage),
    starred: false,
    updatedAt: now,
    messages: []
  };
}

export function appendUserMessage(chat, text, now = Date.now()) {
  const trimmed = String(text).trim();
  if (!trimmed) return chat;
  return {
    ...chat,
    updatedAt: now,
    messages: [...chat.messages, { role: 'user', content: trimmed }].slice(-100)
  };
}

export function sortedChats(chats, query = '') {
  const needle = String(query).trim().toLocaleLowerCase();
  return [...chats]
    .filter(chat => chat.title.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || b.updatedAt - a.updatedAt);
}

export function parseChats(raw) {
  try {
    const items = JSON.parse(raw || '[]');
    if (!Array.isArray(items)) return [];
    return items.slice(-100).filter(chat => chat && typeof chat.id === 'string')
      .map(chat => ({
        id: chat.id,
        title: typeof chat.title === 'string' ? chat.title.slice(0, 100) : 'Untitled chat',
        starred: chat.starred === true,
        updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : 0,
        messages: Array.isArray(chat.messages)
          ? chat.messages.filter(m => m && m.role === 'user' && typeof m.content === 'string')
            .slice(-100).map(m => ({ role: 'user', content: m.content.slice(0, 20000) }))
          : []
      }));
  } catch {
    return [];
  }
}
