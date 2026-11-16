// Code blocks in the page editor: languages, the stored value, and paste detection.
// Pure functions only (no Quill or DOM), so they are unit tested in Node.

// Shown in the language picker, as in Notion. The id is what is stored on the block.
export const CODE_LANGUAGES = [
  { id: 'plain', label: 'Plain Text' },
  { id: 'bash', label: 'Bash' },
  { id: 'c', label: 'C' },
  { id: 'csharp', label: 'C#' },
  { id: 'cpp', label: 'C++' },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'diff', label: 'Diff' },
  { id: 'docker', label: 'Docker' },
  { id: 'go', label: 'Go' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'matlab', label: 'MATLAB' },
  { id: 'mermaid', label: 'Mermaid' },
  { id: 'objectivec', label: 'Objective-C' },
  { id: 'pascal', label: 'Pascal' },
  { id: 'perl', label: 'Perl' },
  { id: 'php', label: 'PHP' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'scala', label: 'Scala' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' }
];

const BY_ID = new Map(CODE_LANGUAGES.map((language) => [language.id, language]));
const ALIASES = {
  text: 'plain', txt: 'plain', plaintext: 'plain', 'plain text': 'plain', ascii: 'plain', tree: 'plain', diagram: 'plain', none: 'plain', output: 'plain', console: 'plain',
  sh: 'bash', shell: 'bash', zsh: 'bash', terminal: 'bash',
  js: 'javascript', jsx: 'javascript', node: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python',
  'c++': 'cpp', cc: 'cpp', hpp: 'cpp',
  'c#': 'csharp', cs: 'csharp',
  dockerfile: 'docker', yml: 'yaml', md: 'markdown', tex: 'latex', ps1: 'powershell', pwsh: 'powershell',
  'objective-c': 'objectivec', objc: 'objectivec', rb: 'ruby', rs: 'rust', kt: 'kotlin', htm: 'html', svg: 'xml', patch: 'diff', psql: 'sql', mysql: 'sql', postgresql: 'sql'
};

// "JS", "```python", "C++" → a known id; anything else → plain text.
export function normalizeLanguage(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (BY_ID.has(key)) return key;
  if (ALIASES[key]) return ALIASES[key];
  const byLabel = CODE_LANGUAGES.find((language) => language.label.toLowerCase() === key);
  return byLabel ? byLabel.id : 'plain';
}

export function languageLabel(id) {
  return BY_ID.get(normalizeLanguage(id))?.label || 'Plain Text';
}

export function searchLanguages(query) {
  const text = String(query ?? '').trim().toLowerCase();
  if (!text) return CODE_LANGUAGES;
  return CODE_LANGUAGES.filter((language) => language.label.toLowerCase().includes(text) || language.id.includes(text));
}

// The value stored on each code line: "python" or "python+wrap".
export function codeBlockValue({ language = 'plain', wrap = false } = {}) {
  return `${normalizeLanguage(language)}${wrap ? '+wrap' : ''}`;
}

export function parseCodeBlockValue(value) {
  if (value === true || value == null || value === '') return { language: 'plain', wrap: false };
  const [language, ...flags] = String(value).split('+');
  return { language: normalizeLanguage(language), wrap: flags.includes('wrap') };
}

// Box-drawing (│ ├ └ ┌ ─ …) and block characters used in trees and diagrams.
const DIAGRAM_CHARS = /[─-▟]/;
const ASCII_BOX_EDGE = /[+][-=]{3,}[+]/;
const ASCII_BOX_SIDE = /^\s*[|+].*[|+]\s*$/;

// Should pasted text become a code block, so its spacing and alignment are kept?
// Yes for file trees, box diagrams and ASCII art, and for code copied from an editor
// (monospace text with preserved spacing). Rich HTML that already contains <pre> is left
// to the normal paste, which turns <pre> into a code block by itself.
export function looksLikeCodeText(text, html = '') {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const lines = source.split('\n');
  if (lines.length < 2) return false;
  const markup = String(html ?? '');
  if (/<pre[\s>]/i.test(markup)) return false;
  if (DIAGRAM_CHARS.test(source)) return true;
  if (lines.some((line) => ASCII_BOX_EDGE.test(line)) && lines.filter((line) => ASCII_BOX_SIDE.test(line)).length >= 2) return true;
  return /white-space:\s*pre/i.test(markup) && /font-family:[^;"]*(mono|consolas|courier|menlo|monaco)/i.test(markup);
}
