-- Least privilege for the notification engine tables.
-- 202611030001_notification_engine.sql granted table privileges to PUBLIC, which includes the anon role.
-- Every policy on these tables is "to authenticated", so anon never received rows, but the privilege itself
-- should not exist (defense in depth if a policy is later written without a role). PUBLIC is revoked as well as
-- anon, because revoking only anon leaves the PUBLIC grant effective. Signed-in users keep exactly the same
-- table privileges as before; service_role keeps its own explicit grants.
revoke all on table public.reminders from public, anon;
revoke all on table public.notification_settings from public, anon;
revoke all on table public.notification_events from public, anon;
revoke all on table public.audio_resources from public, anon;
revoke all on table public.device_tokens from public, anon;

grant select, insert, update, delete on table public.reminders to authenticated;
grant select, insert, update, delete on table public.notification_settings to authenticated;
grant select, insert, update, delete on table public.notification_events to authenticated;
grant select, insert, update, delete on table public.audio_resources to authenticated;
grant select, insert, update, delete on table public.device_tokens to authenticated;
