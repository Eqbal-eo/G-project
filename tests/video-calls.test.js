import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLiveKitToken, createLiveKitTokenHandler, displayNameFor, roomNameFor } from '../supabase/functions/livekit-token/handler.js';

const MEETING = '11111111-2222-4333-8444-555555555555';
const SECRETS = {
  LIVEKIT_URL: 'wss://demo.livekit.cloud',
  LIVEKIT_API_KEY: 'APIdemo123',
  LIVEKIT_API_SECRET: 'super-secret-value-0123456789',
  MOTION_AI_ALLOWED_ORIGINS: 'http://localhost:5173'
};
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

function makeHandler({ env = SECRETS, user = { id: 'u1', email: 'sara@x.io', user_metadata: { name: 'Sara' } }, meeting = { id: MEETING, status: 'live' } } = {}) {
  return createLiveKitTokenHandler({
    env: (name) => env[name],
    authenticate: async () => user,
    readMeeting: async () => meeting,
    now: () => Date.UTC(2026, 10, 16, 12)
  });
}
const post = (body, headers = {}) => new Request('http://localhost/livekit-token', {
  method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
});

test('signs a LiveKit token that verifies with the API secret', async () => {
  const jwt = await createLiveKitToken({ apiKey: 'APIk', apiSecret: 'secret-secret-secret', identity: 'u1', name: 'Sara', room: 'meeting-x', now: 1_000_000_000_000, ttlSeconds: 60 });
  const [header, payload, signature] = jwt.split('.');
  const expected = createHmac('sha256', 'secret-secret-secret').update(`${header}.${payload}`).digest('base64url');
  assert.equal(signature, expected);
  const claims = decode(payload);
  assert.equal(claims.iss, 'APIk');
  assert.equal(claims.sub, 'u1');
  assert.equal(claims.exp, 1_000_000_000 + 60);
  assert.deepEqual(claims.video, { room: 'meeting-x', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
});

test('a team member gets a ticket for this meeting’s room only', async () => {
  const response = await makeHandler()(post({ meetingId: MEETING }, { Origin: 'http://localhost:5173' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const body = await response.json();
  assert.equal(body.url, SECRETS.LIVEKIT_URL);
  assert.equal(body.room, roomNameFor(MEETING));
  const claims = decode(body.token.split('.')[1]);
  assert.equal(claims.video.room, `meeting-${MEETING}`);
  assert.equal(claims.name, 'Sara');
});

test('refuses people outside the team, ended meetings and bad input', async () => {
  assert.equal((await makeHandler({ meeting: null })(post({ meetingId: MEETING }))).status, 403);
  const ended = await makeHandler({ meeting: { id: MEETING, status: 'ended' } })(post({ meetingId: MEETING }));
  assert.equal(ended.status, 409);
  assert.equal((await makeHandler()(post({ meetingId: 'nope' }))).status, 400);
  assert.equal((await makeHandler()(post({ meetingId: MEETING, room: 'other' }))).status, 400);
  assert.equal((await makeHandler({ user: null })(post({ meetingId: MEETING }))).status, 401);
  assert.equal((await makeHandler()(post({ meetingId: MEETING }, { Origin: 'https://evil.example' }))).status, 403);
});

test('the live site is allowed even when the origins setting is quoted or missing', async () => {
  for (const origins of [undefined, '"https://www.group-ify.app/,https://group-ify.app"']) {
    const preflight = await makeHandler({ env: { ...SECRETS, MOTION_AI_ALLOWED_ORIGINS: origins } })(new Request('http://localhost/livekit-token', {
      method: 'OPTIONS', headers: { Origin: 'https://www.group-ify.app' }
    }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://www.group-ify.app');
  }
});

test('says clearly when LiveKit is not set up', async () => {
  const response = await makeHandler({ env: { MOTION_AI_ALLOWED_ORIGINS: '' } })(post({ meetingId: MEETING }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'VIDEO_NOT_CONFIGURED');
});

test('a secret copied as the hidden dots is refused with a clear message', async () => {
  const response = await makeHandler({ env: { ...SECRETS, LIVEKIT_API_SECRET: '•'.repeat(32) } })(post({ meetingId: MEETING }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.message, /hidden dots/);
});

test('display names fall back to the email name', () => {
  assert.equal(displayNameFor({ email: 'omar@x.io', user_metadata: {} }), 'omar');
  assert.equal(displayNameFor({ user_metadata: { full_name: ' Lina ' } }), 'Lina');
});
