// Video calls inside meetings, through LiveKit (livekit.io; free Cloud plan or self-hosted).
// This only hands out a short-lived "join" ticket for one meeting's room. Who may join is
// decided by the database: the meeting is read as the signed-in person, so the policies in
// sql/meetings.sql (team members only) apply. Audio and video never pass through Supabase.
//
// Settings (server-only, supabase/functions/.env or Supabase secrets):
//   LIVEKIT_URL         wss://your-project.livekit.cloud (LiveKit Cloud → Settings → Project URL)
//   LIVEKIT_API_KEY     LiveKit Cloud → Settings → API keys
//   LIVEKIT_API_SECRET  shown once when the API key is created

class RequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_SECONDS = 4 * 60 * 60;

export function isVideoConfigured(env) {
  return /^wss?:\/\/\S+$/.test(env('LIVEKIT_URL') || '')
    && /^\S{6,}$/.test(env('LIVEKIT_API_KEY') || '')
    && /^\S{16,}$/.test(env('LIVEKIT_API_SECRET') || '');
}

export function roomNameFor(meetingId) {
  return `meeting-${String(meetingId).toLowerCase()}`;
}

export function displayNameFor(user) {
  const name = String(user?.user_metadata?.name || user?.user_metadata?.full_name || '').trim();
  if (name) return name.slice(0, 80);
  const email = String(user?.email || '');
  return (email.split('@')[0] || 'Teammate').slice(0, 80);
}

const encoder = new TextEncoder();
function base64url(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A LiveKit access token is a standard HS256 JWT signed with the API secret.
// Web Crypto works the same in Deno (Supabase) and Node (the local dev server and tests).
export async function createLiveKitToken({ apiKey, apiSecret, identity, name, room, now = Date.now(), ttlSeconds = TOKEN_SECONDS }) {
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: identity,
    name,
    nbf: issuedAt - 10,
    exp: issuedAt + ttlSeconds,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true }
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

export function createLiveKitTokenHandler({ env, authenticate, readMeeting, now = () => Date.now() }) {
  return async (request) => {
    const origin = request.headers.get('origin');
    const allowed = (env('MOTION_AI_ALLOWED_ORIGINS') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const cors = origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const reply = (status, body) => Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
    if (origin && !allowed.includes(origin)) return reply(403, { error: { code: 'ORIGIN_DENIED', message: 'Video calls are not enabled for this website address.' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } });
    if (request.method !== 'POST') return reply(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
    try {
      const token = request.headers.get('authorization');
      const user = token?.startsWith('Bearer ') ? await authenticate(token) : null;
      if (!user?.id) throw new RequestError(401, 'SIGN_IN_REQUIRED', 'Please sign in again.');
      const body = await request.text();
      if (body.length > 1000) throw new RequestError(413, 'TOO_LARGE', 'The request is too large.');
      let input;
      try { input = JSON.parse(body); } catch { throw new RequestError(400, 'INVALID_REQUEST', 'The request could not be read.'); }
      if (!input || typeof input !== 'object' || Object.keys(input).some((key) => key !== 'meetingId') || !UUID.test(String(input.meetingId || ''))) {
        throw new RequestError(400, 'INVALID_REQUEST', 'Choose a meeting to join.');
      }
      if (!isVideoConfigured(env)) throw new RequestError(503, 'VIDEO_NOT_CONFIGURED', 'Video calls aren’t set up yet. Run npm run setup:video (see README → Video calls).');

      let meeting;
      try { meeting = await readMeeting(token, input.meetingId); } catch {
        throw new RequestError(503, 'SETUP_REQUIRED', 'Meetings are unavailable. Run sql/meetings.sql in Supabase.');
      }
      if (!meeting) throw new RequestError(403, 'NOT_ALLOWED', 'Only members of this team can join the call.');
      if (meeting.status === 'ended') throw new RequestError(409, 'MEETING_ENDED', 'This meeting has ended, so its call is closed.');

      const room = roomNameFor(meeting.id);
      const accessToken = await createLiveKitToken({
        apiKey: env('LIVEKIT_API_KEY'),
        apiSecret: env('LIVEKIT_API_SECRET'),
        identity: user.id,
        name: displayNameFor(user),
        room,
        now: now()
      });
      return reply(200, { token: accessToken, url: env('LIVEKIT_URL'), room });
    } catch (error) {
      if (error instanceof RequestError) return reply(error.status, { error: { code: error.code, message: error.message } });
      if (['TimeoutError', 'AbortError'].includes(error?.name)) return reply(504, { error: { code: 'TIMEOUT', message: 'The server took too long. Try again.' } });
      return reply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Video calls are unavailable right now.' } });
    }
  };
}
