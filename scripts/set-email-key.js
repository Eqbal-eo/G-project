// npm run setup:email
// Turns on invitation emails (Brevo, free plan). Asks for your Brevo API key (hidden)
// and the sender email you confirmed in Brevo, checks both with Brevo (nothing is
// sent), then saves them to the git-ignored supabase/functions/.env. Other lines stay.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const FILE = 'supabase/functions/.env';

// One reader for both questions. Lines are queued, so answers typed (or pasted) early
// are never lost; typing is hidden while the API key is entered.
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

const key = await ask('Paste your Brevo API key (it stays hidden), then press Enter: ', { hidden: true });
if (!/^\S{20,300}$/.test(key)) {
  console.error('\n✗ That does not look like a Brevo API key. In Brevo: SMTP & API → API keys → Generate a new API key. Nothing was saved.\n');
  process.exit(1);
}
const sender = (await ask('Sender email you confirmed in Brevo (e.g. yourname@gmail.com): ')).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
  console.error('\n✗ That is not an email address. Nothing was saved.\n');
  process.exit(1);
}

rl.close();
process.stdout.write('Checking with Brevo… ');
try {
  const headers = { 'api-key': key, Accept: 'application/json' };
  const account = await fetch('https://api.brevo.com/v3/account', { headers, signal: AbortSignal.timeout(15000) });
  if (account.status === 401) throw new Error('Brevo did not accept this API key. Create a new one and run this again.');
  if (!account.ok) throw new Error(`Brevo answered ${account.status}. Try again in a minute.`);
  const senders = await fetch('https://api.brevo.com/v3/senders', { headers, signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => ({}));
  const match = (senders.senders || []).find((item) => String(item.email).toLowerCase() === sender);
  if (!match) throw new Error(`${sender} is not a sender in your Brevo account. In Brevo: Senders, domains & dedicated IPs → Senders → Add a sender, confirm the email Brevo sends you, then run this again.`);
  if (match.active === false) throw new Error(`${sender} is added in Brevo but not confirmed yet. Open the confirmation email from Brevo, then run this again.`);
  console.log('the key and sender work ✓');
} catch (error) {
  console.error(`\n✗ ${error.message}\n  Nothing was saved.\n`);
  process.exit(1);
}

const lines = existsSync(FILE) ? readFileSync(FILE, 'utf8').split(/\r?\n/) : [];
while (lines.length && lines[lines.length - 1] === '') lines.pop();
const setLine = (name, value, comment) => {
  const at = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (at >= 0) lines[at] = `${name}=${value}`;
  else lines.push(...(comment ? [comment] : []), `${name}=${value}`);
};
setLine('BREVO_API_KEY', key, '# Invitation emails (Brevo). Server-only; never put these in the browser .env.');
setLine('INVITE_FROM_EMAIL', sender);
writeFileSync(FILE, `${lines.join('\n')}\n`, { mode: 0o600 });

console.log(`\n✓ Saved to ${FILE} (git-ignored). Restart the dev server, then use Settings → Team → Send invite.`);
console.log('  For the deployed site, also set these as Supabase secrets (see README → Invitation emails).\n');
