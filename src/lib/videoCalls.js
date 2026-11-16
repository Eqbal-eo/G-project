// Video calls in meetings: asks the livekit-token function for a join ticket.
// The audio and video then go straight between the browser and LiveKit.
import { supabase } from './supabase.js';
import { invokeAI } from './cloudflareAI.js';

const KNOWN_CODES = new Set(['SIGN_IN_REQUIRED', 'NOT_ALLOWED', 'MEETING_ENDED', 'VIDEO_NOT_CONFIGURED', 'SETUP_REQUIRED', 'ORIGIN_DENIED', 'TIMEOUT', 'INVALID_REQUEST']);

// Safari on iPad and iPhone pauses background tabs, so the session's access token can
// expire before supabase-js renews it. Renew it first when it is missing or about to expire.
async function freshSession({ force = false } = {}) {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 60_000;
  if (!force && session?.access_token && !expiresSoon) return session;
  const { data: refreshed, error } = await supabase.auth.refreshSession();
  return error ? null : refreshed?.session || null;
}

async function requestTicket(meetingId) {
  if (import.meta.env.DEV) return invokeAI('livekit-token', { meetingId });
  const session = await freshSession();
  if (!session) {
    const failure = new Error('Your sign-in has expired. Sign out and sign in again, then join the call.');
    failure.code = 'SIGN_IN_REQUIRED';
    throw failure;
  }
  const call = async (token) => {
    const { data, error } = await supabase.functions.invoke('livekit-token', {
      body: { meetingId },
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!error) return data;
    let detail;
    try { detail = await error.context?.json(); } catch { /* Network error. */ }
    const failure = new Error(detail?.error?.message || detail?.message || 'Video calls are unavailable right now.');
    failure.code = detail?.error?.code || (error.context?.status === 401 ? 'SIGN_IN_REQUIRED' : 'SERVICE_UNAVAILABLE');
    throw failure;
  };
  try {
    return await call(session.access_token);
  } catch (error) {
    if (error.code !== 'SIGN_IN_REQUIRED') throw error;
    // The token was refused: renew the session once and try again.
    const renewed = await freshSession({ force: true });
    if (!renewed) {
      error.message = 'Your sign-in has expired. Sign out and sign in again, then join the call.';
      throw error;
    }
    return call(renewed.access_token);
  }
}

export async function getCallConnection(meetingId) {
  try {
    const data = await requestTicket(meetingId);
    if (!data?.token || !data?.url) throw new Error('The call server sent an incomplete reply.');
    return { token: data.token, url: data.url, room: data.room };
  } catch (error) {
    // invokeAI's generic fallback text talks about AI; keep only messages the call function wrote.
    const failure = new Error(KNOWN_CODES.has(error?.code) ? error.message : 'Video calls are unavailable right now. Check that the livekit-token function is deployed.');
    failure.code = error?.code || 'SERVICE_UNAVAILABLE';
    throw failure;
  }
}
