import katex from 'katex';

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

function inline(text) {
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

  return str;
}

export function markdownToHtml(markdown = '') {
  const lines = String(markdown).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let code = null;
  let mathBlock = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line)) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) { closeList(); code = []; continue; }

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
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  if (mathBlock !== null) out.push(`<div class="katex-display-block">${renderMath(mathBlock.join('\n'), true)}</div>`);
  closeList();
  return out.join('').replace(/<\/ul class="editor-todo-list">/g, '</ul>');
}
