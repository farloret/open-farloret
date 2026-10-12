/**
 * Search popup shared by the offline demo and the self-hosted application.
 * The native <dialog>.showModal() manages focus trapping and Escape.
 */
export function matchingChats(chats, query) {
  const term = String(query || '').trim().toLocaleLowerCase();
  const list = Array.isArray(chats) ? chats : [];
  return list.filter(chat => {
    if (!chat || typeof chat.title !== 'string') return false;
    if (!term) return true;
    return chat.title.toLocaleLowerCase().includes(term) ||
      (Array.isArray(chat.messages) && chat.messages.some(msg =>
        typeof msg.content === 'string' && msg.content.toLocaleLowerCase().includes(term))) ||
      (typeof chat.preview === 'string' && chat.preview.toLocaleLowerCase().includes(term));
  }).sort((a,b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) ||
    Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export function createChatSearch({
  dialog, trigger, input, results, closeButton, loadChats, onChoose
}) {
  if (![dialog,trigger,input,results,closeButton].every(Boolean)) {
    throw new Error('Missing search dialog elements');
  }
  let request = 0;
  let debounce;
  let selected = [];

  function makeRow(chat) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-search-row';
    const title = document.createElement('span');
    title.className = 'chat-search-row-title';
    title.textContent = chat.title || 'Untitled conversation';
    const excerpt = document.createElement('span');
    excerpt.className = 'chat-search-row-preview';
    const preview = typeof chat.preview === 'string' ? chat.preview
      : Array.isArray(chat.messages) ?
        chat.messages.find(m => m.content?.toLocaleLowerCase().includes(input.value.trim().toLocaleLowerCase()))?.content
        : '';
    excerpt.textContent = String(preview || 'Open conversation').replace(/\s+/g,' ').slice(0,145);
    button.append(title, excerpt);
    button.addEventListener('click', () => {
      dialog.close();
      onChoose(chat.id);
    });
    return button;
  }

  async function render() {
    const token = ++request;
    const query = input.value.trim();
    results.replaceChildren();
    const status = document.createElement('p');
    status.className = 'chat-search-status';
    status.textContent = 'Searching conversations…';
    results.append(status);
    try {
      const chats = await loadChats(query);
      if (token !== request || !dialog.open) return;
      selected = matchingChats(chats, query).slice(0,70);
      results.replaceChildren();
      if (!selected.length) {
        status.textContent = 'No matching conversations';
        results.append(status);
        return;
      }
      for (const chat of selected) results.append(makeRow(chat));
    } catch {
      if (token !== request || !dialog.open) return;
      status.textContent = 'Could not load conversations.';
      results.replaceChildren(status);
    }
  }

  function open() {
    if (dialog.open) return;
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    input.value = '';
    selected = [];
    render();
    input.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    ++request;
    clearTimeout(debounce);
    trigger.setAttribute('aria-expanded', 'false');
  });
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(render, 90);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      const first = results.querySelector('button');
      if (first) { event.preventDefault(); first.focus(); }
    }
    if (event.key === 'Enter') {
      const first = results.querySelector('button');
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  results.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...results.querySelectorAll('button')];
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowDown' && at < buttons.length - 1) buttons[at + 1].focus();
    else if (event.key === 'ArrowUp' && at > 0) buttons[at - 1].focus();
    else if (event.key === 'ArrowUp') input.focus();
  });
  return { open, close, refresh: () => dialog.open && render() };
}
