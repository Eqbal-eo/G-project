import test from 'node:test';
import assert from 'node:assert/strict';
import { createSendInviteHandler, buildInviteEmail, isEmailConfigured } from '../supabase/functions/send-invite/handler.js';
import { describeNotification } from '../src/lib/notificationText.js';

const origin = 'http://localhost:5173';
const INVITE = '6a1d2c4b-5a6e-4f70-8a91-b2c3d4e5f607';
const TOKEN = '9b8a7c6d-1111-4222-8333-944455556666';

function fixture({ details = { allowed: true, email: 'sara@example.test', token: TOKEN, role: 'editor', workspace_name: 'Capstone Crew', inviter_name: 'Lina Haddad' }, brevo = { status: 201, body: { messageId: 'x' } }, settings = {} } = {}) {
  const sent = [];
  const prepared = [];
  const values = { BREVO_API_KEY: 'test-brevo-key-0123456789', INVITE_FROM_EMAIL: 'team@example.test', MOTION_AI_ALLOWED_ORIGINS: origin, ...settings };
  const handler = createSendInviteHandler({
    env: (key) => values[key],
    authenticate: async () => ({ id: 'owner' }),
    prepareEmail: async (token, id) => { prepared.push(id); if (details instanceof Error) throw details; return details; },
    fetchImpl: async (url, options) => { sent.push({ url, options, body: JSON.parse(options.body) }); return Response.json(brevo.body, { status: brevo.status }); }
  });
  const invoke = (body, headers = {}) => handler(new Request('https://example.test/functions/v1/send-invite', {
    method: 'POST', headers: { Origin: origin, Authorization: 'Bearer test-session', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
  }));
  return { invoke, sent, prepared };
}

test('emails the invitation with a Join the team link to this site', async () => {
  const f = fixture();
  const response = await f.invoke({ invitationId: INVITE });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true, email: 'sara@example.test' });
  const [call] = f.sent;
  assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(call.options.headers['api-key'], 'test-brevo-key-0123456789');
  assert.deepEqual(call.body.to, [{ email: 'sara@example.test' }]);
  assert.deepEqual(call.body.sender, { name: 'Groupify', email: 'team@example.test' });
  assert.equal(call.body.subject, 'Lina Haddad invited you to join Capstone Crew on Groupify');
  assert.match(call.body.htmlContent, new RegExp(`href="http://localhost:5173/#invite/${TOKEN}"`));
  assert.match(call.body.htmlContent, />Join the team</);
  assert.match(call.body.textContent, /as Editor/);
});

test('refuses before sending: bad requests, other sites, missing setup', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ invitationId: 'not-a-uuid' })).status, 400);
  assert.equal((await f.invoke({ invitationId: INVITE, email: 'someone@else.test' })).status, 400, 'the address always comes from the database');
  assert.equal((await f.invoke({ invitationId: INVITE }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.invoke({ invitationId: INVITE }, { Authorization: '' })).status, 401);
  assert.equal(f.sent.length, 0);
  assert.deepEqual(f.prepared, []);

  const noKey = fixture({ settings: { BREVO_API_KEY: '' } });
  const response = await noKey.invoke({ invitationId: INVITE });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'EMAIL_NOT_CONFIGURED');
  assert.equal(noKey.sent.length, 0);
});

test('the database decides who may send and how often', async () => {
  for (const [reason, status, code] of [['not_allowed', 403, 'NOT_ALLOWED'], ['accepted', 409, 'ALREADY_ACCEPTED'], ['too_soon', 429, 'TOO_SOON'], ['too_many', 429, 'TOO_MANY'], ['daily', 429, 'DAILY_LIMIT']]) {
    const f = fixture({ details: { allowed: false, reason } });
    const response = await f.invoke({ invitationId: INVITE });
    assert.equal(response.status, status, reason);
    assert.equal((await response.json()).error.code, code);
    assert.equal(f.sent.length, 0, `${reason}: nothing sent`);
  }
  const noSql = fixture({ details: new Error('missing function') });
  assert.equal((await (await noSql.invoke({ invitationId: INVITE })).json()).error.code, 'SETUP_REQUIRED');
});

test('explains email service failures in plain words', async () => {
  const badKey = fixture({ brevo: { status: 401, body: { message: 'Key not found' } } });
  const response = await badKey.invoke({ invitationId: INVITE });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error.message, /rejected the API key/);
  const badSender = fixture({ brevo: { status: 400, body: { message: 'sender not valid' } } });
  assert.match((await (await badSender.invoke({ invitationId: INVITE })).json()).error.message, /sender address is not confirmed/);
});

test('the email escapes names and works without an allowed Origin using SITE_URL', async () => {
  const email = buildInviteEmail({ inviterName: '<b>Lina</b>', workspaceName: 'Team "A" & B', role: 'viewer', link: 'https://groupify.example/#invite/abc' });
  assert.doesNotMatch(email.html, /<b>Lina<\/b>/);
  assert.match(email.html, /&lt;b&gt;Lina&lt;\/b&gt;/);
  assert.match(email.html, /Team &quot;A&quot; &amp; B/);
  assert.match(email.text, /as Viewer/);

  const server = fixture({ settings: { SITE_URL: 'https://groupify.example/' } });
  const response = await server.invoke({ invitationId: INVITE }, { Origin: '' });
  assert.equal(response.status, 200);
  assert.match(server.sent[0].body.htmlContent, new RegExp(`https://groupify.example/#invite/${TOKEN}`));
  assert.equal(isEmailConfigured(() => ''), false);
});

test('invitation notifications read naturally and open Home', () => {
  const info = describeNotification({ type: 'workspace_invite', payload: { actor_name: 'Lina Haddad', workspace_name: 'Capstone Crew', role: 'editor' } });
  assert.equal(info.text, 'Lina Haddad invited you to join “Capstone Crew”');
  assert.equal(info.href, 'dashboard');
  assert.equal(info.icon, 'user-plus');
});
