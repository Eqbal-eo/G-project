// Notion-style code blocks in the page editor: each block remembers its language and
// whether long lines wrap, and shows a small toolbar on hover (language, copy, wrap).
// Diagrams, file trees and code copied from an editor are pasted as code blocks so
// their alignment is kept.
import Quill from 'quill';
import {
  CODE_LANGUAGES, languageLabel, searchLanguages, codeBlockValue, parseCodeBlockValue, looksLikeCodeText
} from './codeBlockText.js';

const CodeBlock = Quill.import('formats/code-block');
const Delta = Quill.import('delta');

// Same idea as Quill's syntax module, without a highlighter: the language and wrap
// setting live on every line as data attributes, so they are saved with the page HTML
// and read back on load and on paste (<pre data-language="python">).
class NotionCodeBlock extends CodeBlock {
  static create(value) {
    const node = super.create(value);
    const { language, wrap } = parseCodeBlockValue(value);
    node.setAttribute('data-language', language);
    if (wrap) node.setAttribute('data-wrap', 'true');
    return node;
  }

  static formats(node) {
    const language = node.getAttribute?.('data-language') || languageFromCodeClass(node);
    return codeBlockValue({ language, wrap: node.getAttribute?.('data-wrap') === 'true' });
  }

  format(name, value) {
    if (name === this.statics.blotName && value) {
      const { language, wrap } = parseCodeBlockValue(value);
      this.domNode.setAttribute('data-language', language);
      if (wrap) this.domNode.setAttribute('data-wrap', 'true');
      else this.domNode.removeAttribute('data-wrap');
    } else {
      super.format(name, value);
    }
  }
}

// <pre><code class="language-js"> (from other sites) → "javascript".
function languageFromCodeClass(node) {
  const code = node.querySelector?.('code[class*="language-"]');
  return code ? (code.className.match(/language-([\w#+.-]+)/) || [])[1] || 'plain' : 'plain';
}

Quill.register(NotionCodeBlock, true);

function containerOf(node) {
  return node?.closest?.('.ql-code-block-container') || null;
}

function blockRange(quill, containerNode) {
  const blot = Quill.find(containerNode);
  if (!blot || typeof blot.length !== 'function') return null;
  return { index: quill.getIndex(blot), length: blot.length() };
}

function blockValue(containerNode) {
  return parseCodeBlockValue(NotionCodeBlock.formats(containerNode.querySelector('.ql-code-block') || containerNode));
}

function blockText(containerNode) {
  return [...containerNode.querySelectorAll('.ql-code-block')].map((line) => line.textContent).join('\n');
}

function setBlockValue(quill, containerNode, changes) {
  const range = blockRange(quill, containerNode);
  if (!range) return;
  const value = codeBlockValue({ ...blockValue(containerNode), ...changes });
  quill.formatLine(range.index, Math.max(range.length - 1, 1), 'code-block', value, 'user');
}

// Inserts text as a code block at the selection, starting on its own line.
export function insertCodeBlock(quill, range, text, language = 'plain') {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const [, offset] = quill.getLine(range.index);
  let delta = new Delta().retain(range.index).delete(range.length);
  if (offset > 0) delta = delta.insert('\n');
  const value = codeBlockValue({ language });
  for (const line of lines) delta = delta.insert(line).insert('\n', { 'code-block': value });
  quill.updateContents(delta, 'user');
  const end = range.index + (offset > 0 ? 1 : 0) + lines.reduce((sum, line) => sum + line.length + 1, 0);
  quill.setSelection(Math.min(end, quill.getLength() - 1), 0, 'silent');
}

// Pages are saved as the editor's HTML, where code lines are <div>s. When that HTML is loaded
// again, Quill collapses repeated spaces outside <pre>, which breaks diagrams and trees. This
// rebuilds a saved code block from each line's exact text, keeping its language and wrap.
export function preserveCodeBlockSpacing(quill) {
  quill.clipboard.addMatcher('div.ql-code-block-container', (node) => {
    const lines = [...node.children].filter((child) => child.classList?.contains('ql-code-block'));
    if (!lines.length) return new Delta().insert(node.textContent || '').insert('\n', { 'code-block': codeBlockValue({}) });
    let delta = new Delta();
    for (const line of lines) {
      const text = line.textContent || '';
      if (text) delta = delta.insert(text);
      delta = delta.insert('\n', { 'code-block': NotionCodeBlock.formats(line) });
    }
    return delta;
  });
}

export function attachCodeBlockPaste(quill) {
  // Capture phase: runs before Quill's own paste handler on the same element.
  const onPaste = (event) => {
    const text = event.clipboardData?.getData('text/plain');
    const html = event.clipboardData?.getData('text/html') || '';
    if (!text || !looksLikeCodeText(text, html)) return;
    const range = quill.getSelection(true);
    if (!range || quill.getFormat(range.index, range.length)['code-block']) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    insertCodeBlock(quill, range, text);
  };
  quill.root.addEventListener('paste', onPaste, true);
  return () => quill.root.removeEventListener('paste', onPaste, true);
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function createCodeBlockToolbar(quill, container) {
  const bar = document.createElement('div');
  bar.className = 'code-block-toolbar';
  bar.setAttribute('contenteditable', 'false');
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" class="code-block-lang" data-code-lang aria-haspopup="listbox" aria-expanded="false"><span data-code-lang-label>Plain Text</span><span class="material-symbols-outlined" aria-hidden="true">expand_more</span></button>
    <button type="button" class="code-block-icon" data-code-copy title="Copy code" aria-label="Copy code"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span></button>
    <button type="button" class="code-block-icon" data-code-wrap title="Wrap long lines" aria-label="Wrap long lines" aria-pressed="false"><span class="material-symbols-outlined" aria-hidden="true">wrap_text</span></button>
    <div class="code-lang-menu" role="listbox" aria-label="Code language" hidden>
      <input type="search" class="code-lang-search" placeholder="Search for a language…" aria-label="Search for a language" />
      <div class="code-lang-options"></div>
    </div>`;
  container.appendChild(bar);

  const langButton = bar.querySelector('[data-code-lang]');
  const langLabel = bar.querySelector('[data-code-lang-label]');
  const copyButton = bar.querySelector('[data-code-copy]');
  const wrapButton = bar.querySelector('[data-code-wrap]');
  const menu = bar.querySelector('.code-lang-menu');
  const search = bar.querySelector('.code-lang-search');
  const options = bar.querySelector('.code-lang-options');
  let current = null; // the code block container the toolbar belongs to
  let hideTimer = 0;

  function refresh() {
    if (!current) return;
    const { language, wrap } = blockValue(current);
    langLabel.textContent = languageLabel(language);
    wrapButton.setAttribute('aria-pressed', String(wrap));
    wrapButton.classList.toggle('is-on', wrap);
  }

  function place() {
    if (!current?.isConnected) { hide(true); return; }
    const box = current.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    bar.style.top = `${box.top - host.top + 6}px`;
    bar.style.right = `${host.right - box.right + 8}px`;
  }

  function show(node) {
    window.clearTimeout(hideTimer);
    if (current !== node) closeMenu();
    current = node;
    bar.hidden = false;
    refresh();
    place();
  }

  function hide(now = false) {
    window.clearTimeout(hideTimer);
    const run = () => {
      if (!menu.hidden || bar.matches(':hover') || bar.contains(document.activeElement)) return;
      bar.hidden = true;
      current = null;
    };
    if (now) { closeMenu(); bar.hidden = true; current = null; } else hideTimer = window.setTimeout(run, 250);
  }

  function renderOptions() {
    const chosen = current ? blockValue(current).language : 'plain';
    const found = searchLanguages(search.value);
    options.innerHTML = found.length
      ? found.map((language) => `<button type="button" role="option" class="code-lang-option ${language.id === chosen ? 'is-chosen' : ''}" aria-selected="${language.id === chosen}" data-lang="${escapeHtml(language.id)}"><span>${escapeHtml(language.label)}</span>${language.id === chosen ? '<span class="material-symbols-outlined" aria-hidden="true">check</span>' : ''}</button>`).join('')
      : '<p class="code-lang-empty">No matching language</p>';
  }

  function openMenu() {
    menu.hidden = false;
    langButton.setAttribute('aria-expanded', 'true');
    search.value = '';
    renderOptions();
    options.querySelector('.is-chosen')?.scrollIntoView({ block: 'nearest' });
    search.focus();
  }

  function closeMenu() {
    menu.hidden = true;
    langButton.setAttribute('aria-expanded', 'false');
  }

  // Keep the editor selection while using the toolbar.
  bar.addEventListener('mousedown', (event) => { if (event.target !== search) event.preventDefault(); });
  langButton.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  search.addEventListener('input', renderOptions);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); langButton.focus(); }
    if (event.key === 'Enter') { event.preventDefault(); options.querySelector('[data-lang]')?.click(); }
  });
  options.addEventListener('click', (event) => {
    const option = event.target.closest('[data-lang]');
    if (!option || !current) return;
    setBlockValue(quill, current, { language: option.dataset.lang });
    closeMenu();
    refresh();
  });
  copyButton.addEventListener('click', async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(blockText(current));
      copyButton.classList.add('is-done');
      copyButton.querySelector('.material-symbols-outlined').textContent = 'check';
      window.setTimeout(() => {
        copyButton.classList.remove('is-done');
        copyButton.querySelector('.material-symbols-outlined').textContent = 'content_copy';
      }, 1400);
    } catch { /* Clipboard blocked: nothing to do. */ }
  });
  wrapButton.addEventListener('click', () => {
    if (!current) return;
    setBlockValue(quill, current, { wrap: !blockValue(current).wrap });
    refresh();
  });

  const onMove = (event) => {
    const node = containerOf(event.target);
    if (node) show(node);
    else if (!bar.contains(event.target)) hide();
  };
  quill.root.addEventListener('mouseover', onMove);
  quill.root.addEventListener('mouseleave', () => hide());
  bar.addEventListener('mouseleave', () => hide());
  // Typing in a block also shows its toolbar (keyboard users, touch screens).
  quill.on('selection-change', (range) => {
    if (!range) return;
    const [line] = quill.getLine(range.index);
    const node = containerOf(line?.domNode);
    if (node) show(node);
  });
  quill.on('text-change', () => { if (current) window.requestAnimationFrame(() => { if (current?.isConnected) { refresh(); place(); } else hide(true); }); });
  const onOutside = (event) => {
    if (!bar.isConnected) { document.removeEventListener('mousedown', onOutside); return; }
    if (!menu.hidden && !bar.contains(event.target)) closeMenu();
  };
  document.addEventListener('mousedown', onOutside);

  return { hide: () => hide(true), languages: CODE_LANGUAGES };
}
