import {createLiveKitTokenHandler} from './handler.js';

const env = (name: string) => Deno.env.get(name);
const base = env('SUPABASE_URL')!;
const publicKey = env('SUPABASE_ANON_KEY')!;
const headers = (token: string) => ({apikey: publicKey, Authorization: token, 'Content-Type': 'application/json'});

Deno.serve(createLiveKitTokenHandler({
  env,
  authenticate: async (token: string) => {
    const result = await fetch(`${base}/auth/v1/user`, {headers: headers(token), signal: AbortSignal.timeout(10000)});
    return result.ok ? await result.json() : null;
  },
  // Read as the signed-in person: the meetings policies only return it to team members.
  readMeeting: async (token: string, meetingId: string) => {
    const result = await fetch(`${base}/rest/v1/meetings?select=id,status&id=eq.${meetingId}&limit=1`, {headers: headers(token), signal: AbortSignal.timeout(10000)});
    if (!result.ok) throw new Error('Meetings unavailable');
    const rows = await result.json();
    return rows[0] || null;
  }
}));
