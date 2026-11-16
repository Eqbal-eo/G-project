// npm run setup:video
// Turns on video calls in meetings (LiveKit Cloud, free plan). Asks for the project URL,
// API key and API secret (hidden), then saves them to the git-ignored
// supabase/functions/.env. Other lines stay.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const FILE = 'supabase/functions/.env';

let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
const queued = [];
let waiting = null;
let ended = false;
rl.on('line', (line) => { if (waiting) { const resolve = waiting; waiting = null; resolve(line); } else queued.push(line); });
rl.on('close', () => { ended = true; if (waiting) { const resolve = waiting; waiting = null; resolve(''); } });
function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  return new Promise((resolve) => {
    const finish = (answer) => { muted = false; process.stdout.write('\n'); resolve(String(answer).trim()); };
    if (queued.length) finish(queued.shift());
    else if (ended) finish('');
    else waiting = finish;
  });
}

const fail = (message) => { console.error(`\n✗ ${message} Nothing was saved.\n`); process.exit(1); };

const url = (await ask('LiveKit project URL (wss://….livekit.cloud): ')).replace(/\/+$/, '');
if (!/^wss:\/\/[^\s/]+$/.test(url)) fail('That is not a LiveKit URL. In LiveKit Cloud: Settings → Project → URL, it starts with wss://.');
const key = await ask('API key (starts with API…): ');
if (!/^\S{6,100}$/.test(key)) fail('That does not look like a LiveKit API key. In LiveKit Cloud: Settings → API keys → Create key.');
const secret = await ask('API secret (it stays hidden): ', { hidden: true });
if (!/^\S{16,200}$/.test(secret)) fail('That does not look like a LiveKit API secret.');
rl.close();

const lines = existsSync(FILE) ? readFileSync(FILE, 'utf8').split(/\r?\n/) : [];
while (lines.length && lines[lines.length - 1] === '') lines.pop();
const setLine = (name, value, comment) => {
  const at = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (at >= 0) lines[at] = `${name}=${value}`;
  else lines.push(...(comment ? [comment] : []), `${name}=${value}`);
};
setLine('LIVEKIT_URL', url, '# Video calls in meetings (LiveKit). Server-only; never put these in the browser .env.');
setLine('LIVEKIT_API_KEY', key);
setLine('LIVEKIT_API_SECRET', secret);
writeFileSync(FILE, `${lines.join('\n')}\n`, { mode: 0o600 });

console.log(`\n✓ Saved to ${FILE} (git-ignored). Restart the dev server, open a meeting and click Join video call.`);
console.log('  For the deployed site, also set these as Supabase secrets (see README → Video calls).\n');
