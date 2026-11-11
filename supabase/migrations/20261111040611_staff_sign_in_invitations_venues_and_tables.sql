-- Staff sign-in: the platform admin, invitations, and owners and managers running venues and tables.

-- Platform admins ------------------------------------------------------------------------------
-- A separate role from brand staff: it creates brands and invites their Owners.

create table app.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app.platform_admins enable row level security;

create function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.platform_admins a where a.user_id = (select auth.uid()))
$$;
revoke execute on function app.is_platform_admin () from public;
grant execute on function app.is_platform_admin () to anon, authenticated;

create policy "platform admins create brands" on app.brands
  for insert to authenticated with check (app.is_platform_admin ());
grant insert (name, logo_url) on app.brands to authenticated;
