import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_LANGUAGES, normalizeLanguage, languageLabel, searchLanguages, codeBlockValue, parseCodeBlockValue, looksLikeCodeText
} from '../src/lib/codeBlockText.js';
import { markdownToHtml, colorStyle } from '../src/lib/markdown.js';
import { AGENT_INSTRUCTIONS } from '../supabase/functions/_shared/agentContract.js';

const TREE = [
  'Translater/',
  '├── README.md',
  '├── backend/',
  '│   ├── app.js                  # Server entry point / نقطة بدء الخادم',
  '│   └── routes/',
  '└── frontend/'
].join('\n');

const DIAGRAM = [
  '┌──────────────┐',
  '│ USER BROWSER │',
  '└──────┬───────┘',
  '       │ HTTP/REST',
  '       ▼'
].join('\n');

test('normalizes code languages and their aliases', () => {
  assert.equal(normalizeLanguage('JS'), 'javascript');
  assert.equal(normalizeLanguage('py'), 'python');
  assert.equal(normalizeLanguage('C++'), 'cpp');
  assert.equal(normalizeLanguage('c#'), 'csharp');
  assert.equal(normalizeLanguage('text'), 'plain');
  assert.equal(normalizeLanguage('Plain Text'), 'plain');
  assert.equal(normalizeLanguage('PowerShell'), 'powershell');
  assert.equal(normalizeLanguage('brainfuck'), 'plain');
  assert.equal(normalizeLanguage(''), 'plain');
  assert.equal(languageLabel('ts'), 'TypeScript');
  assert.equal(CODE_LANGUAGES[0].label, 'Plain Text');
  assert.deepEqual(searchLanguages('scr').map((language) => language.label), ['JavaScript', 'TypeScript']);
  assert.equal(searchLanguages('').length, CODE_LANGUAGES.length);
});

test('stores the language and wrap setting in one value', () => {
  assert.equal(codeBlockValue({ language: 'py' }), 'python');
  assert.equal(codeBlockValue({ language: 'sql', wrap: true }), 'sql+wrap');
  assert.deepEqual(parseCodeBlockValue('sql+wrap'), { language: 'sql', wrap: true });
  assert.deepEqual(parseCodeBlockValue(true), { language: 'plain', wrap: false });
  assert.deepEqual(parseCodeBlockValue('weird'), { language: 'plain', wrap: false });
});

test('pastes trees, box diagrams and editor code as code blocks, not normal text', () => {
  assert.equal(looksLikeCodeText(TREE), true);
  assert.equal(looksLikeCodeText(DIAGRAM), true);
  assert.equal(looksLikeCodeText('+-----+\n| box |\n+-----+'), true);
  assert.equal(looksLikeCodeText('const a = 1;\nconst b = 2;', '<div style="font-family: Consolas, monospace; white-space: pre;"><div>const a = 1;</div></div>'), true);
  // Ordinary text stays ordinary.
  assert.equal(looksLikeCodeText('Hello team,\nthe meeting is at 3.'), false);
  assert.equal(looksLikeCodeText('one line with │ a bar'), false);
  // Rich HTML with <pre> is handled by the normal paste (which keeps it as a code block).
  assert.equal(looksLikeCodeText(TREE, '<pre>Translater/</pre>'), false);
});

test('AI code fences become code blocks that keep language and spacing', () => {
  const html = markdownToHtml(`Structure:\n\`\`\`text\n${TREE}\n\`\`\`\n\`\`\`py\nprint("<hi>")\n\`\`\``);
  assert.match(html, /^<p>Structure:<\/p><pre data-language="plain">Translater\/\n├── README\.md\n/);
  assert.match(html, /│ {3}├── app\.js {18}# Server entry point \/ نقطة بدء الخادم/);
  // Back-to-back blocks are kept apart by an empty line, or the editor would join them.
  assert.match(html, /<\/pre><p><br><\/p><pre data-language="python">print\(&quot;&lt;hi&gt;&quot;\)<\/pre>/);
  // Never ends on a code block, or the editor would merge its last line into the page's last line.
  assert.match(html, /<\/pre><p><br><\/p>$/);
  assert.equal(markdownToHtml('```\nunclosed'), '<pre data-language="plain">unclosed</pre><p><br></p>');
  assert.equal(markdownToHtml('```js\nx\n```\nafter'), '<pre data-language="javascript">x</pre><p>after</p>');
});

test('AI color tags become real colors from the editor palette, never raw tags', () => {
  assert.equal(markdownToHtml('## <font color="blue">المعادلات المنطقية</font>'), '<h2><span style="color: #337ea9">المعادلات المنطقية</span></h2>');
  assert.equal(
    markdownToHtml('A <span style="color: green; background-color: yellow">mix</span>, <mark>marked</mark>, <font color=red>**bold**</font>'),
    '<p>A <span style="color: #448361; background-color: rgba(203, 145, 47, 0.2)">mix</span>, <span style="background-color: rgba(203, 145, 47, 0.2)">marked</span>, <span style="color: #d44c47"><strong>bold</strong></span></p>'
  );
  assert.equal(markdownToHtml('x <span style="color:blue">a <span style="color:red">b</span> c</span>'), '<p>x <span style="color: #337ea9">a <span style="color: #d44c47">b</span> c</span></p>');
  // Unknown colors, unsafe values and unclosed tags leave just the text.
  assert.equal(markdownToHtml('<font color="chartreuse">plain</font> <font color="javascript:alert(1)">bad</font> <font color="blue">open'), '<p>plain bad open</p>');
  assert.equal(markdownToHtml('<font color="#ff0000">hex</font>'), '<p><span style="color: #ff0000">hex</span></p>');
  assert.match(markdownToHtml('| a | b |\n|---|---|\n| <font color="green">ok</font> | x |'), /<td><span style="color: #448361">ok<\/span><\/td>/);
  // Other HTML is still shown as text, not run.
  assert.match(markdownToHtml('<script>alert(1)</script> <span onclick="x()">hi</span>'), /&lt;script&gt;/);
  assert.doesNotMatch(markdownToHtml('<span onclick="x()">hi</span>'), /onclick/);
  assert.equal(colorStyle({ color: 'Grey', background: 'light blue' }), 'color: #787774; background-color: rgba(51, 126, 169, 0.2)');
});

test('the agent is told how to write code blocks and colors', () => {
  assert.match(AGENT_INSTRUCTIONS, /```text for trees, diagrams and ASCII art/);
  assert.match(AGENT_INSTRUCTIONS, /<span style="color:blue">/);
});
