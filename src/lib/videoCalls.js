// Video calls in meetings: asks the livekit-token function for a join ticket.
// The audio and video then go straight between the browser and LiveKit.
import { invokeAI } from './cloudflareAI.js';

const KNOWN_CODES = new Set(['SIGN_IN_REQUIRED', 'NOT_ALLOWED', 'MEETING_ENDED', 'VIDEO_NOT_CONFIGURED', 'SETUP_REQUIRED', 'ORIGIN_DENIED', 'TIMEOUT', 'INVALID_REQUEST']);

export async function getCallConnection(meetingId) {
  try {
    const data = await invokeAI('livekit-token', { meetingId });
    if (!data?.token || !data?.url) throw new Error('The call server sent an incomplete reply.');
    return { token: data.token, url: data.url, room: data.room };
  } catch (error) {
    // invokeAI's generic fallback text talks about AI; keep only messages the call function wrote.
    const failure = new Error(KNOWN_CODES.has(error?.code) ? error.message : 'Video calls are unavailable right now. Check that the livekit-token function is deployed.');
    failure.code = error?.code || 'SERVICE_UNAVAILABLE';
    throw failure;
  }
}
