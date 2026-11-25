-- Least privilege for RPC functions (audit finding S2/S3). New migration; applied migrations are not edited.
--
-- S2: the notification engine and the circle-meeting reveal RPCs were granted to "authenticated" but never
-- revoked from PUBLIC, so the anon role could also call them. Each body filters by auth.uid() (null for anon),
-- so no rows are exposed, but anon must not reach them at all. Signed-in users keep execute.
revoke execute on function public.create_reminder(text,timestamptz,text,text,jsonb,text,text,text,text,boolean) from public, anon;
revoke execute on function public.update_reminder(uuid,text,text,timestamptz,text,jsonb,text,text,text,text,boolean) from public, anon;
revoke execute on function public.delete_reminder(uuid) from public, anon;
revoke execute on function public.list_reminders() from public, anon;
revoke execute on function public.snooze_reminder(uuid,integer) from public, anon;
revoke execute on function public.toggle_reminder(uuid,boolean) from public, anon;
revoke execute on function public.get_notification_preferences() from public, anon;
revoke execute on function public.save_notification_preferences(boolean,jsonb,jsonb,jsonb,jsonb,boolean,text,text,integer) from public, anon;
revoke execute on function public.register_device_token(text,text) from public, anon;
revoke execute on function public.unregister_device_token(text) from public, anon;
revoke execute on function public.reveal_circle_meeting_url(uuid) from public, anon;
grant execute on function public.create_reminder(text,timestamptz,text,text,jsonb,text,text,text,text,boolean) to authenticated;
grant execute on function public.update_reminder(uuid,text,text,timestamptz,text,jsonb,text,text,text,text,boolean) to authenticated;
grant execute on function public.delete_reminder(uuid) to authenticated;
grant execute on function public.list_reminders() to authenticated;
grant execute on function public.snooze_reminder(uuid,integer) to authenticated;
grant execute on function public.toggle_reminder(uuid,boolean) to authenticated;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.save_notification_preferences(boolean,jsonb,jsonb,jsonb,jsonb,boolean,text,text,integer) to authenticated;
grant execute on function public.register_device_token(text,text) to authenticated;
grant execute on function public.unregister_device_token(text) to authenticated;
grant execute on function public.reveal_circle_meeting_url(uuid) to authenticated;

-- S3: record_payment_audit is SECURITY DEFINER, takes an arbitrary p_actor_id, performs no caller check and was
-- executable by every signed-in user, so any user could insert forged payment audit-log rows (including rows
-- attributed to another user). The existing admin flow (tests/payment-operations.test.mjs) calls it as an admin
-- with their own id, so that behavior is preserved: only an admin may write, and only as themselves.
create or replace function public.record_payment_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'payment audit requires an administrator' using errcode = '42501';
  end if;
  if p_actor_id is distinct from (select auth.uid()) then
    raise exception 'audit actor must be the caller' using errcode = '42501';
  end if;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;
revoke all on function public.record_payment_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_audit(uuid, text, text, text, jsonb) to authenticated;
