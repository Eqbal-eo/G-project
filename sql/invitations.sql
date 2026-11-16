-- ============================================
-- GROUPIFY — Invitations by email and inside the app
-- ============================================
-- Run once in the Supabase SQL Editor, after sql/schema.sql and sql/project-teams.sql
-- (it uses public.workspace_role_of). Safe to run again; no data is removed.
--
--   * The person invited sees the invitation in Groupify (Home card + bell) when their
--     account email matches, and can Accept or Decline it.
--   * The team owner can have Groupify email the invitation (send-invite function).
--     Emails are limited: once a minute per invitation, 5 per invitation, 30 per team a day.

BEGIN;

ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS email_count integer NOT NULL DEFAULT 0;

-- ---------- Invitations waiting for the signed-in person ----------
CREATE OR REPLACE FUNCTION public.my_pending_invitations()
RETURNS TABLE (id uuid, token uuid, role text, created_at timestamptz, workspace_id uuid, workspace_name text, inviter_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.token, i.role, i.created_at, w.id, w.name,
         COALESCE(NULLIF(trim(u.name), ''), split_part(u.email, '@', 1), 'A teammate')
  FROM public.workspace_invitations i
  JOIN public.workspaces w ON w.id = i.workspace_id
  LEFT JOIN public.users u ON u.id = i.invited_by
  WHERE auth.uid() IS NOT NULL
    AND i.accepted_at IS NULL
    AND lower(i.email) = lower((SELECT me.email FROM public.users me WHERE me.id = auth.uid()))
    AND NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = i.workspace_id AND m.user_id = auth.uid())
  ORDER BY i.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.my_pending_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_invitations() TO authenticated;

-- ---------- Decline an invitation addressed to you ----------
CREATE OR REPLACE FUNCTION public.decline_workspace_invitation(invite_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to decline an invitation'; END IF;
  DELETE FROM public.workspace_invitations
  WHERE token = invite_token AND accepted_at IS NULL
    AND lower(email) = lower((SELECT email FROM public.users WHERE id = auth.uid()));
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation was not found, or it is for another email address'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.decline_workspace_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_workspace_invitation(uuid) TO authenticated;

-- ---------- Bell notification when someone with an account is invited ----------
CREATE OR REPLACE FUNCTION public.notify_workspace_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target uuid;
  team text;
  inviter text;
BEGIN
  SELECT id INTO target FROM public.users WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF target IS NULL OR target = NEW.invited_by THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = NEW.workspace_id AND user_id = target) THEN RETURN NEW; END IF;
  SELECT name INTO team FROM public.workspaces WHERE id = NEW.workspace_id;
  SELECT COALESCE(NULLIF(trim(name), ''), split_part(email, '@', 1)) INTO inviter FROM public.users WHERE id = NEW.invited_by;
  -- No workspace_id: the person is not in that team yet, so the bell shows it in every team.
  INSERT INTO public.notifications (recipient_id, actor_id, workspace_id, type, payload)
  VALUES (target, NEW.invited_by, NULL, 'workspace_invite', jsonb_build_object(
    'workspace_name', team, 'actor_name', inviter, 'role', NEW.role, 'token', NEW.token, 'invited_workspace_id', NEW.workspace_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_workspace_invitation_trigger ON public.workspace_invitations;
CREATE TRIGGER notify_workspace_invitation_trigger AFTER INSERT ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.notify_workspace_invitation();

-- Accepted, declined or cancelled: remove the bell notification for it.
CREATE OR REPLACE FUNCTION public.clear_workspace_invitation_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.accepted_at IS NULL THEN RETURN NEW; END IF;
  DELETE FROM public.notifications WHERE type = 'workspace_invite' AND payload->>'token' = OLD.token::text;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS clear_workspace_invitation_notice_trigger ON public.workspace_invitations;
CREATE TRIGGER clear_workspace_invitation_notice_trigger AFTER UPDATE OF accepted_at OR DELETE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.clear_workspace_invitation_notice();

-- ---------- Before emailing an invitation (called by the send-invite function) ----------
-- Only the team owner, and within the limits; returns what the email needs.
CREATE OR REPLACE FUNCTION public.prepare_invitation_email(p_invitation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.workspace_invitations;
  team text;
  inviter text;
  sent_today integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO inv FROM public.workspace_invitations WHERE id = p_invitation FOR UPDATE;
  IF inv.id IS NULL OR public.workspace_role_of(inv.workspace_id) IS DISTINCT FROM 'owner' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_allowed');
  END IF;
  IF inv.accepted_at IS NOT NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'accepted'); END IF;
  IF inv.emailed_at IS NOT NULL AND inv.emailed_at > now() - interval '1 minute' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'too_soon');
  END IF;
  IF inv.email_count >= 5 THEN RETURN jsonb_build_object('allowed', false, 'reason', 'too_many'); END IF;
  SELECT count(*) INTO sent_today FROM public.workspace_invitations
    WHERE workspace_id = inv.workspace_id AND emailed_at > now() - interval '1 day';
  IF sent_today >= 30 THEN RETURN jsonb_build_object('allowed', false, 'reason', 'daily'); END IF;

  UPDATE public.workspace_invitations SET emailed_at = now(), email_count = email_count + 1 WHERE id = inv.id;
  SELECT name INTO team FROM public.workspaces WHERE id = inv.workspace_id;
  SELECT COALESCE(NULLIF(trim(name), ''), split_part(email, '@', 1)) INTO inviter FROM public.users WHERE id = auth.uid();
  RETURN jsonb_build_object('allowed', true, 'email', inv.email, 'token', inv.token, 'role', inv.role,
    'workspace_name', COALESCE(team, 'a team'), 'inviter_name', COALESCE(inviter, 'A teammate'));
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_invitation_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_invitation_email(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
