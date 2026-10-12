// Browser-only conversation state. Public demo makes no model or network requests.
import { isChatId, newChatId } from '../public/chat-id.js';

export const STORAGE_KEY = 'open-farloret-scarlet-demo-v1';

export function chatTitle(text) {
  const normalized = String(text).trim().replace(/\s+/g, ' ');
  return normalized.slice(0, 48) || 'New conversation';
}

export function createChat(id = newChatId(), firstMessage = '', now = Date.now()) {
  return {
    id: isChatId(id) ? id.toLowerCase() : newChatId(),
    title: chatTitle(firstMessage),
    starred: false,
    updatedAt: now,
    messages: []
  };
}

export function appendUserMessage(chat, text, now = Date.now(), attachments = []) {
  const trimmed = String(text).trim();
  if (!trimmed && !attachments.length) return chat;
  return {
    ...chat,
    updatedAt: now,
    messages: [...chat.messages, {role:'user', content:trimmed, ...(attachments.length?{attachments:attachments.map(({id,name,type,size})=>({id,name,type,size}))}:{})}].slice(-100)
  };
}

export function sortedChats(chats, query = '') {
  const needle = String(query).trim().toLocaleLowerCase();
  return [...chats].filter(chat =>
    !needle || chat.title.toLocaleLowerCase().includes(needle) ||
    chat.messages.some(m => m.content.toLocaleLowerCase().includes(needle))
  ).sort((a,b) => Number(b.starred) - Number(a.starred) || b.updatedAt - a.updatedAt);
}

export function parseChats(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    if (!Array.isArray(list)) return [];
    const ids = new Set();
    return list.slice(-100).filter(chat => chat && typeof chat === 'object')
      .map(chat => {
        // Migrate older timestamp / non-UUID IDs without discarding conversations.
        let id = isChatId(chat.id) ? chat.id.toLowerCase() : newChatId();
        while (ids.has(id)) id = newChatId();
        ids.add(id);
        return {
          id,
          title: typeof chat.title === 'string' ? chat.title.slice(0,100) : 'Untitled chat',
          starred: chat.starred === true,
          updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : 0,
          messages: Array.isArray(chat.messages)
            ? chat.messages.filter(m => m && m.role === 'user' && typeof m.content === 'string')
                .slice(-100).map(m => ({role:'user',content:m.content.slice(0,20000),...(Array.isArray(m.attachments)?{attachments:m.attachments.filter(a=>a && typeof a.id==='string' && typeof a.name==='string').slice(0,5).map(a=>({id:a.id,name:a.name.slice(0,180),size:Number(a.size)||0,type:String(a.type||'')}))}:{})}))
            : []
        };
      });
  } catch {
    return [];
  }
}
