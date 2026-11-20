-- NTF-003: unified Notification Center.
-- One notifications table remains the single source of truth. A generated
-- category column lets every activity reuse the same feed without a second
-- notification engine, and list_notifications gains category/unread filters
-- plus offset pagination. No notification body carries private data.

-- 1) Invitations get their own kind so the feed can classify them reliably.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('announcement','join_request','join_decision','course','session','report','system','mudarasa','share','invitation'));

-- 2) Category is derived once, in the database, for old and new rows alike.
alter table public.notifications add column if not exists category text
  generated always as (
    case
      when kind in ('join_request','join_decision','invitation') then 'invitation'
      when kind in ('course','session','mudarasa','announcement') then 'activity'
      when kind = 'share' then 'resource'
      else 'system'
    end
  ) stored;

create index if not exists notifications_recipient_category_idx
  on public.notifications(recipient_id, category, created_at desc);

-- 3) Replace the fixed list with a filtered, paginated feed. The old signature
-- (integer) is dropped because PostgreSQL cannot change a return type in place.
drop function if exists public.list_notifications(integer);

create function public.list_notifications(
  p_limit integer default 30,
  p_offset integer default 0,
  p_category text default null,
  p_unread_only boolean default false
)
returns table (
  notification_id uuid,
  notification_kind text,
  notification_title text,
  notification_body text,
  notification_link text,
  notification_category text,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'تسجيل الدخول مطلوب' using errcode = '42501';
  end if;
  if p_category is not null and p_category not in ('invitation','activity','resource','system') then
    raise exception 'تصنيف الإشعارات غير صالح' using errcode = '22023';
  end if;
  return query
    select n.id, n.kind, n.title, n.body, n.link, n.category, n.read_at, n.created_at
      from public.notifications n
     where n.recipient_id = v_user
       and (p_category is null or n.category = p_category)
       and (not coalesce(p_unread_only, false) or n.read_at is null)
     order by n.created_at desc, n.id desc
     limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

revoke all on function public.list_notifications(integer, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.list_notifications(integer, integer, text, boolean) to authenticated;

-- 4) Study circles / study_member_invites were retired and their schema
-- migrations were removed from the repository; keep the notification center
-- feed, categories, and pagination above cleanly applicable on a fresh DB.
