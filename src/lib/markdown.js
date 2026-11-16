import katex from 'katex';
import { NOTION_COLORS } from './notionColors.js';
import { normalizeLanguage } from './codeBlockText.js';

// Small, safe Markdown → editor HTML converter for AI-written content.
// Everything is escaped; only a fixed set of tags is produced.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderMath(tex, displayMode = false) {
  const clean = String(tex ?? '').trim();
  if (!clean) return '';
  try {
    return katex.renderToString(clean, { displayMode, throwOnError: false });
  } catch {
    return escapeHtml(clean);
  }
}

// ---------- colors ----------
// Only the editor's own palette (and plain hex colors) is used, so AI colors match the
// colors people pick from the menu.
const COLOR_NAMES = { grey: 'gray', violet: 'purple', magenta: 'pink', navy: 'blue', teal: 'green', gold: 'yellow', crimson: 'red' };
function paletteColor(kind, value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/^(light|dark)\s*/, '');
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(text)) return text;
  const name = COLOR_NAMES[text] || text;
  return NOTION_COLORS[kind].find((color) => color.label.toLowerCase() === name && color.value)?.value || '';
}

// "color: blue; background-color: yellow" → CSS for a span, or '' when nothing usable.
export function colorStyle({ color = '', background = '' } = {}) {
  const parts = [];
  const text = paletteColor('text', color);
  const fill = paletteColor('background', background);
  if (text) parts.push(`color: ${text}`);
  if (fill) parts.push(`background-color: ${fill}`);
  return parts.join('; ');
}

function styleColors(style) {
  const read = (name) => (String(style).match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i')) || [])[1] || '';
  return { color: read('color'), background: read('background-color') || read('background') };
}

const COLOR_TAG = /<(font|span|mark)((?:\s+[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))*)\s*>((?:(?!<\/?(?:font|span|mark)\b)[\s\S])*?)<\/\1\s*>/i;
const STRAY_TAG = /<\/?(?:font|span|mark)\b[^>]*>/gi;

function tagColors(tag, attributes) {
  const attribute = (name) => (attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || []).slice(1).find((value) => value !== undefined) || '';
  const fromStyle = styleColors(attribute('style'));
  if (tag.toLowerCase() === 'mark') return { color: fromStyle.color, background: fromStyle.background || 'yellow' };
  return { color: attribute('color') || fromStyle.color, background: fromStyle.background };
}

function inline(text, colorSpans = []) {
  // Color tags → placeholders, innermost first; whatever is left over is dropped.
  let source = String(text ?? '');
  for (let match = COLOR_TAG.exec(source); match; match = COLOR_TAG.exec(source)) {
    colorSpans.push({ style: colorStyle(tagColors(match[1], match[2])), inner: match[3] });
    source = `${source.slice(0, match.index)}@@KCOLOR_${colorSpans.length - 1}@@${source.slice(match.index + match[0].length)}`;
  }
  text = source.replace(STRAY_TAG, '');
  const codes = [];
  const mathDisplay = [];
  const mathInline = [];

  let str = text
    .replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `@@KATEXCODE_${codes.length - 1}@@`;
    })
    .replace(/\$\$([^$]+?)\$\$/g, (_, math) => {
      mathDisplay.push(math);
      return `@@KATEXMD_${mathDisplay.length - 1}@@`;
    })
    .replace(/\$([^\s$](?:[^$]*?[^\s$])?)\$/g, (_, math) => {
      mathInline.push(math);
      return `@@KATEXMI_${mathInline.length - 1}@@`;
    });

  str = escapeHtml(str)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  str = str
    .replace(/@@KATEXCODE_(\d+)@@/g, (_, i) => `<code>${escapeHtml(codes[i])}</code>`)
    .replace(/@@KATEXMD_(\d+)@@/g, (_, i) => `<span class="katex-display-inline">${renderMath(mathDisplay[i], true)}</span>`)
    .replace(/@@KATEXMI_(\d+)@@/g, (_, i) => renderMath(mathInline[i], false));

  return str.replace(/@@KCOLOR_(\d+)@@/g, (_, index) => {
    const span = colorSpans[index];
    const inner = inline(span.inner, colorSpans);
    return span.style ? `<span style="${span.style}">${inner}</span>` : inner;
  });
}

// For other Markdown converters (e.g. "Insert into page") that want the same inline rules.
export function markdownInline(text) {
  return inline(text);
}

// ---------- tables ----------
// "| a | b |" → ['a', 'b']. Escaped pipes (\|) stay inside a cell.
export function splitTableRow(line) {
  const text = String(line).trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\\' && text[index + 1] === '|') { cell += '|'; index += 1; }
    else if (text[index] === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += text[index];
  }
  cells.push(cell.trim());
  return cells;
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const PIPE_ROW = /^\s*\|.*\|\s*$/;

function isTableRow(line) {
  return PIPE_ROW.test(line) && splitTableRow(line).length >= 2;
}

// A table starts at a pipe row followed by a "|---|---|" line, or at two or more pipe rows
// with the same number of cells (models sometimes leave out the separator).
function tableAt(lines, start) {
  if (!isTableRow(lines[start])) return null;
  const header = splitTableRow(lines[start]);
  let index = start + 1;
  let aligns = header.map(() => '');
  if (TABLE_SEPARATOR.test(lines[index] || '')) {
    aligns = splitTableRow(lines[index]).map((cell) => (/^:-+:$/.test(cell) ? 'center' : /^-+:$/.test(cell) ? 'right' : ''));
    index += 1;
  } else if (!(isTableRow(lines[index] || '') && splitTableRow(lines[index]).length === header.length)) {
    return null;
  }
  const rows = [];
  while (index < lines.length && isTableRow(lines[index]) && !TABLE_SEPARATOR.test(lines[index])) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }
  return { header, aligns, rows, end: index };
}

function tableHtml({ header, aligns, rows }) {
  const width = header.length;
  const cell = (tag, text, column) => `<${tag}${aligns[column] ? ` style="text-align:${aligns[column]}"` : ''}>${inline(text) || '<br>'}</${tag}>`;
  const row = (cells, tag) => `<tr>${Array.from({ length: width }, (_, column) => cell(tag, cells[column] ?? '', column)).join('')}</tr>`;
  return `<table class="editor-simple-table"><thead>${row(header, 'th')}</thead><tbody>${rows.map((cells) => row(cells, 'td')).join('')}</tbody></table>`;
}

export function markdownToHtml(markdown = '') {
  const lines = String(markdown).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let code = null;
  let codeLanguage = 'plain';
  // Fenced code becomes an editor code block that keeps its language (see codeBlocks.js).
  // Two code blocks in a row get an empty line between them; otherwise the editor joins them into one.
  const codeBlock = (lines) => `${/^<pre[\s>]/.test(out.at(-1) || '') ? '<p><br></p>' : ''}<pre data-language="${codeLanguage}">${escapeHtml(lines.join('\n'))}</pre>`;
  let mathBlock = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (code !== null) {
      if (/^\s*```\s*$/.test(line)) { out.push(codeBlock(code)); code = null; } else code.push(line);
      continue;
    }
    const fence = /^\s*```\s*([\w#+.-]*)/.exec(line);
    if (fence) { closeList(); code = []; codeLanguage = normalizeLanguage(fence[1]); continue; }

    if (mathBlock !== null) {
      if (/^\s*\$\$/.test(line)) {
        out.push(`<div class="katex-display-block">${renderMath(mathBlock.join('\n'), true)}</div>`);
        mathBlock = null;
      } else {
        mathBlock.push(line);
      }
      continue;
    }
    if (/^\s*\$\$([\s\S]+?)\$\$\s*$/.test(line)) {
      closeList();
      const match = /^\s*\$\$([\s\S]+?)\$\$\s*$/.exec(line);
      out.push(`<div class="katex-display-block">${renderMath(match[1], true)}</div>`);
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      closeList();
      mathBlock = [];
      const after = line.replace(/^\s*\$\$/, '').trim();
      if (after) mathBlock.push(after);
      continue;
    }

    const table = tableAt(lines, lineIndex);
    if (table) {
      closeList();
      out.push(tableHtml(table));
      lineIndex = table.end - 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const todo = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) { closeList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); }
    else if (todo) {
      if (list !== 'ul class="editor-todo-list"') { closeList(); out.push('<ul class="editor-todo-list">'); list = 'ul class="editor-todo-list"'; }
      out.push(`<li><label><input type="checkbox" ${todo[1].trim() ? 'checked' : ''} /> <span>${inline(todo[2])}</span></label></li>`);
    } else if (bullet) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(numbered[1])}</li>`);
    } else if (/^\s*>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`); }
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { closeList(); out.push('<hr />'); }
    else if (line.trim()) { closeList(); out.push(`<p>${inline(line)}</p>`); }
    else closeList();
  }
  if (code !== null) out.push(codeBlock(code));
  if (mathBlock !== null) out.push(`<div class="katex-display-block">${renderMath(mathBlock.join('\n'), true)}</div>`);
  closeList();
  // Never end on a code block: when the editor pastes this at the end of a page it merges the
  // last pasted line with the page's last line, which would break the block's last line.
  if (/^(<p><br><\/p>)?<pre[\s>]/.test(out.at(-1) || '')) out.push('<p><br></p>');
  return out.join('').replace(/<\/ul class="editor-todo-list">/g, '</ul>');
}
