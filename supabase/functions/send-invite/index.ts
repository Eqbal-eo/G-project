import {createSendInviteHandler} from './handler.js';

const env = (name: string) => Deno.env.get(name);
const base = env('SUPABASE_URL')!;
const publicKey = env('SUPABASE_ANON_KEY')!;
const headers = (token: string) => ({apikey: publicKey, Authorization: token, 'Content-Type': 'application/json'});

Deno.serve(createSendInviteHandler({
  env,
  authenticate: async (token: string) => {
    const result = await fetch(`${base}/auth/v1/user`, {headers: headers(token), signal: AbortSignal.timeout(10000)});
    return result.ok ? await result.json() : null;
  },
  // Runs as the signed-in person: the database checks they own the team and the email limits.
  prepareEmail: async (token: string, invitationId: string) => {
    const result = await fetch(`${base}/rest/v1/rpc/prepare_invitation_email`, {method: 'POST', headers: headers(token), body: JSON.stringify({p_invitation: invitationId}), signal: AbortSignal.timeout(10000)});
    if (!result.ok) throw new Error('Invitation storage unavailable');
    return await result.json();
  }
}));
