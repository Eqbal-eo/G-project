// Emails a team invitation with a "Join the team" button, through Brevo (free plan,
// no own domain needed). The database decides who may send and how often
// (prepare_invitation_email in sql/invitations.sql); this only builds and sends the email.
//
// Settings (server-only, supabase/functions/.env or Supabase secrets):
//   BREVO_API_KEY       Brevo → SMTP & API → API keys
//   INVITE_FROM_EMAIL   the sender address you confirmed in Brevo
//   SITE_URL            optional: the public site address, used when the request has no allowed Origin

class RequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_NAMES = { admin: 'Admin', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' };
const REFUSALS = {
  not_allowed: [403, 'NOT_ALLOWED', 'Only the team owner can email invitations.'],
  accepted: [409, 'ALREADY_ACCEPTED', 'This invitation has already been accepted.'],
  too_soon: [429, 'TOO_SOON', 'This invitation was just emailed. Wait a minute before sending it again.'],
  too_many: [429, 'TOO_MANY', 'This invitation has been emailed 5 times. Copy the link and send it another way.'],
  daily: [429, 'DAILY_LIMIT', 'Your team has sent 30 invitation emails today. Try again tomorrow, or copy the link.']
};

export function isEmailConfigured(env) {
  return /^\S{10,}$/.test(env('BREVO_API_KEY') || '') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env('INVITE_FROM_EMAIL') || '');
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The invitation email: short, with one clear button and the plain link as a fallback.
export function buildInviteEmail({ inviterName, workspaceName, role, link }) {
  const roleName = ROLE_NAMES[role] || 'Member';
  const subject = `${inviterName} invited you to join ${workspaceName} on Groupify`;
  const text = [
    `${inviterName} invited you to join the team "${workspaceName}" on Groupify as ${roleName}.`,
    '',
    `Join the team: ${link}`,
    '',
    'Sign in or create a free account with this email address to join.',
    'If you did not expect this invitation, you can ignore this email.'
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F5F7F8;font-family:Arial,Helvetica,sans-serif;color:#022635">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F8;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #E1E7EA">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:bold;color:#022635">groupify</td></tr>
<tr><td style="padding:8px 28px 0;font-size:18px;line-height:26px"><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(workspaceName)}</strong></td></tr>
<tr><td style="padding:10px 28px 0;font-size:15px;line-height:22px;color:#3d5763">You’ll join as <strong>${escapeHtml(roleName)}</strong>. Groupify is where your team plans projects, splits the work and finishes it together.</td></tr>
<tr><td style="padding:24px 28px 8px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#022635;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:999px">Join the team</a></td></tr>
<tr><td style="padding:8px 28px 0;font-size:13px;line-height:20px;color:#6b818b">Sign in or create a free account with this email address to join.</td></tr>
<tr><td style="padding:14px 28px 28px;font-size:12px;line-height:18px;color:#8fa3ad">If the button doesn’t work, open this link:<br><a href="${escapeHtml(link)}" style="color:#2E7CA9;word-break:break-all">${escapeHtml(link)}</a><br><br>If you didn’t expect this invitation, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function createSendInviteHandler({ env, fetchImpl = fetch, authenticate, prepareEmail }) {
  return async (request) => {
    const origin = request.headers.get('origin');
    const allowed = (env('MOTION_AI_ALLOWED_ORIGINS') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const cors = origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const reply = (status, body) => Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
    if (origin && !allowed.includes(origin)) return reply(403, { error: { code: 'ORIGIN_DENIED', message: 'Invitations are not enabled for this website address.' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } });
    if (request.method !== 'POST') return reply(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
    try {
      const token = request.headers.get('authorization');
      if (!token?.startsWith('Bearer ') || !await authenticate(token)) throw new RequestError(401, 'SIGN_IN_REQUIRED', 'Please sign in again.');
      const body = await request.text();
      if (body.length > 2000) throw new RequestError(413, 'TOO_LARGE', 'The request is too large.');
      let input;
      try { input = JSON.parse(body); } catch { throw new RequestError(400, 'INVALID_REQUEST', 'The request could not be read.'); }
      if (!input || typeof input !== 'object' || Object.keys(input).some((key) => key !== 'invitationId') || !UUID.test(String(input.invitationId || ''))) {
        throw new RequestError(400, 'INVALID_REQUEST', 'Choose an invitation to send.');
      }
      if (!isEmailConfigured(env)) throw new RequestError(503, 'EMAIL_NOT_CONFIGURED', 'Invitation emails aren’t set up yet. Copy the invite link and send it yourself.');
      const site = origin && allowed.includes(origin) ? origin : String(env('SITE_URL') || '').replace(/\/+$/, '');
      if (!/^https?:\/\/[^\s/]+/.test(site)) throw new RequestError(503, 'EMAIL_NOT_CONFIGURED', 'The site address for invitation links is not set (SITE_URL).');

      let details;
      try { details = await prepareEmail(token, input.invitationId); } catch {
        throw new RequestError(503, 'SETUP_REQUIRED', 'Invitation emails need the latest sql/invitations.sql in Supabase.');
      }
      if (!details?.allowed) {
        const [status, code, message] = REFUSALS[details?.reason] || REFUSALS.not_allowed;
        throw new RequestError(status, code, message);
      }

      const link = `${site}/#invite/${details.token}`;
      const email = buildInviteEmail({ inviterName: details.inviter_name, workspaceName: details.workspace_name, role: details.role, link });
      const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Groupify', email: env('INVITE_FROM_EMAIL') },
          to: [{ email: details.email }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        const reason = response.status === 401 ? 'the email service rejected the API key'
          : /sender/i.test(problem?.message || '') ? 'the sender address is not confirmed in Brevo'
          : `the email service answered ${response.status}`;
        throw new RequestError(502, 'EMAIL_FAILED', `The invitation email could not be sent (${reason}). Copy the invite link instead.`);
      }
      return reply(200, { sent: true, email: details.email });
    } catch (error) {
      if (error instanceof RequestError) return reply(error.status, { error: { code: error.code, message: error.message } });
      if (['TimeoutError', 'AbortError'].includes(error?.name)) return reply(504, { error: { code: 'TIMEOUT', message: 'The email service took too long. Try again.' } });
      return reply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Invitation emails are unavailable right now.' } });
    }
  };
}
