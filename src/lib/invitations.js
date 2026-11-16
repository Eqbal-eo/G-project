// Team invitations: emailing them (send-invite function) and answering them inside
// Groupify (Home card + bell). Database rules: sql/invitations.sql.
import { supabase } from './supabase.js';
import { invokeAI } from './cloudflareAI.js';

// Ask the server to email an invitation. Returns { sent, email } or { error: { code, message } }.
export async function emailInvitation(invitationId) {
  try {
    const data = await invokeAI('send-invite', { invitationId });
    return { sent: true, email: data.email };
  } catch (error) {
    return { sent: false, error: { code: error?.code || 'SERVICE_UNAVAILABLE', message: error?.message || 'The email could not be sent.' } };
  }
}

// Invitations addressed to the signed-in person's email, from teams they are not in yet.
export async function getMyInvitations() {
  const { data, error } = await supabase.rpc('my_pending_invitations');
  if (error && (error.code === 'PGRST202' || error.code === '42883' || /my_pending_invitations/.test(error.message || ''))) {
    return { data: [], error: null, unavailable: true };
  }
  return { data: data || [], error };
}

export async function declineInvitation(token) {
  const { error } = await supabase.rpc('decline_workspace_invitation', { invite_token: token });
  return { error };
}
