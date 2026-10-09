/**
 * Open Farloret's native-looking, accessible, dependency-free model chooser.
 * Focus stays on the trigger; the popup uses the ARIA select-only combobox pattern.
 * Labels are always inserted via textContent, never HTML from providers.
 */
export function normalizeModelOptions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const options = [];
  for (const source of input) {
    if (options.length >= 500) break;
    const object = source && typeof source === 'object' ? source : { value: source, label: source };
    if (typeof object.value !== 'string') continue;
    const value = object.value.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({
      value,
      label: typeof object.label === 'string' && object.label.trim() ? object.label.trim().slice(0, 160) : value,
      description: typeof object.description === 'string' ? object.description.slice(0, 160) : '',
      tag: typeof object.tag === 'string' ? object.tag.slice(0, 26) : ''
    });
  }
  return options;
}

export function nextModelIndex(key, index, length) {
  if (length <= 0) return -1;
  const current = Math.max(0, Math.min(index, length - 1));
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'PageDown') return Math.min(length - 1, current + 8);
  if (key === 'PageUp') return Math.max(0, current - 8);
  if (key === 'ArrowDown') return Math.min(length - 1, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  return current;
}

export function createModelPicker({
  root,
  items = [],
  selected = '',
  spriteUrl = './assets/ui-icons.svg',
  onChange = () => {},
  emptyText = 'No models available.',
  footerText = ''
}) {
  if (!root) throw new Error('Model picker root is required');
  const trigger = root.querySelector('[data-model-trigger]');
  const label = root.querySelector('[data-model-label]');
  const popup = root.querySelector('[data-model-popup]');
  const listbox = root.querySelector('[data-model-listbox]');
  const count = root.querySelector('[data-model-count]');
  const footer = root.querySelector('[data-model-footer]');
  if (![trigger, label, popup, listbox, count, footer].every(Boolean)) {
    throw new Error('Model picker markup is incomplete');
  }

  let options = [];
  let value = '';
  let active = -1;
  let isOpen = false;
  let rows = [];
  let typing = '';
  let typingTimeout = null;
  let noModelsText = emptyText;

  footer.textContent = footerText;

  const glyph = name => {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.classList.add('ui-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(namespace, 'use');
    use.setAttribute('href', spriteUrl + '#' + name);
    svg.append(use);
    return svg;
  };

  function highlight(index) {
    active = options.length ? Math.max(0, Math.min(index, options.length - 1)) : -1;
    rows.forEach((row, i) => row.classList.toggle('is-active', i === active));
    if (isOpen && active >= 0) {
      trigger.setAttribute('aria-activedescendant', rows[active].id);
      rows[active].scrollIntoView({ block: 'nearest' });
    } else {
      trigger.removeAttribute('aria-activedescendant');
    }
  }

  function syncSelection() {
    const chosen = options.find(item => item.value === value);
    label.textContent = chosen?.label || 'Select model';
    trigger.title = chosen?.label || 'Select model';
    rows.forEach((row, i) => {
      const selectedRow = options[i].value === value;
      row.classList.toggle('is-selected', selectedRow);
      row.setAttribute('aria-selected', String(selectedRow));
    });
  }

  function close() {
    isOpen = false;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    rows.forEach(row => row.classList.remove('is-active'));
    typing = '';
    if (typingTimeout !== null) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    popup.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const selectedIndex = options.findIndex(item => item.value === value);
    highlight(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function choose(index, { focus = true } = {}) {
    if (!options[index]) return;
    const next = options[index].value;
    const changed = next !== value;
    value = next;
    syncSelection();
    close();
    if (changed) onChange(value);
    if (focus) trigger.focus({ preventScroll: true });
  }

  function render() {
    rows = [];
    listbox.replaceChildren();
    count.textContent = options.length === 1 ? '1 model' : options.length + ' models';

    if (!options.length) {
      const empty = document.createElement('p');
      empty.className = 'model-menu-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = noModelsText;
      listbox.append(empty);
      return;
    }
    options.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'model-option';
      row.id = listbox.id + '-option-' + index;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(item.value === value));
      row.title = item.label;

      const emblem = document.createElement('span');
      emblem.className = 'model-option-emblem';
      emblem.append(glyph('model'));
      const words = document.createElement('span');
      words.className = 'model-option-words';
      const name = document.createElement('span');
      name.className = 'model-option-title';
      name.textContent = item.label;
      words.append(name);
      if (item.description) {
        const description = document.createElement('span');
        description.className = 'model-option-description';
        description.textContent = item.description;
        words.append(description);
      }
      const tick = document.createElement('span');
      tick.className = 'model-option-check';
      tick.append(glyph('check'));
      if (item.tag) {
        const tag = document.createElement('span');
        tag.className = 'model-option-tag';
        tag.textContent = item.tag;
        words.append(tag);
      }
      row.append(emblem, words, tick);
      row.addEventListener('pointerenter', () => {
        if (isOpen) highlight(index);
      });
      row.addEventListener('click', () => choose(index));
      rows.push(row);
      listbox.append(row);
    });
    syncSelection();
    if (isOpen) highlight(options.findIndex(item => item.value === value));
  }

  function setItems(input, preferred) {
    const original = value;
    options = normalizeModelOptions(input);
    const candidate = typeof preferred === 'string' && options.some(x => x.value === preferred)
      ? preferred
      : options.some(x => x.value === value) ? value : options[0]?.value || '';
    value = candidate;
    render();
    close();
    if (original !== value) onChange(value);
  }

  function setStatus(text) {
    noModelsText = String(text);
    if (!options.length) render();
  }

  trigger.addEventListener('click', () => {
    if (isOpen) close();
    else open();
  });

  trigger.addEventListener('keydown', event => {
    const key = event.key;
    if (key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (key === 'Tab') {
      if (isOpen && active >= 0) choose(active, { focus: false });
      else close();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (isOpen) choose(active);
      else open();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
      event.preventDefault();
      if (!isOpen) {
        open();
        if (key === 'Home' || key === 'End') highlight(nextModelIndex(key, active, options.length));
      } else {
        highlight(nextModelIndex(key, active, options.length));
      }
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && /\S/.test(key)) {
      event.preventDefault();
      if (!isOpen) open();
      typing += key.toLocaleLowerCase();
      if (typingTimeout !== null) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => { typing = ''; typingTimeout = null; }, 650);
      const index = options.findIndex(item => item.label.toLocaleLowerCase().startsWith(typing));
      if (index !== -1) highlight(index);
    }
  });

  document.addEventListener('pointerdown', event => {
    if (isOpen && !root.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (isOpen && !root.contains(event.target)) close();
  });

  setItems(items, selected);
  return { open, close, setItems, setStatus, getValue: () => value };
}
