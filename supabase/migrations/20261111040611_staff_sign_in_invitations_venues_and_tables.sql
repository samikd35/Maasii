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

-- Staff memberships ----------------------------------------------------------------------------
-- An Owner membership is for a Brand, a Manager (or, from ticket 08, Waiter) membership for a Venue.

alter table app.memberships add column name text check (length(trim(name)) > 0);
create unique index memberships_one_active_per_role on app.memberships (user_id, role, brand_id, venue_id)
  nulls not distinct where active;
create index on app.memberships (brand_id) where active;
create index on app.memberships (venue_id) where active;

-- Invitations ----------------------------------------------------------------------------------
-- The inviter shares the invitation link (/invite/<token>) themselves. Only a hash of the token
-- is stored, so the link cannot be recovered from the database: inviting again replaces it.

create table app.invitations (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('owner', 'manager')),
  brand_id uuid references app.brands (id),
  venue_id uuid references app.venues (id),
  name text not null check (length(trim(name)) > 0),
  -- Email in lower case, or phone in E.164 form (+251912345678).
  email text check (email = lower(email)),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  check ((email is null) <> (phone is null)),
  check ((role = 'owner') = (brand_id is not null and venue_id is null)),
  check ((role = 'manager') = (venue_id is not null and brand_id is null))
);
create index on app.invitations (brand_id);
create index on app.invitations (venue_id);
alter table app.invitations enable row level security;

-- Looks up an invitation by its token for whoever holds the link, signed in or not.
create function app.find_invitation(p_token_hash text, p_now timestamptz)
returns table (
  id uuid, status text, role text, name text, email text, phone text,
  brand_id uuid, brand_name text, venue_id uuid, venue_name text, expires_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select i.id,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= p_now then 'expired'
              else 'pending' end,
         i.role, i.name, i.email, i.phone,
         b.id, b.name, v.id, v.name, i.expires_at
  from app.invitations i
  left join app.venues v on v.id = i.venue_id
  join app.brands b on b.id = coalesce(i.brand_id, v.brand_id)
  where i.token_hash = p_token_hash
$$;
revoke execute on function app.find_invitation (text, timestamptz) from public;
grant execute on function app.find_invitation (text, timestamptz) to anon, authenticated;

-- Accepts an invitation for the signed-in person, who must be the one it was sent to.
-- Returns 'accepted', or why not: 'not_found', 'accepted_already', 'revoked', 'expired', 'wrong_person'.
create function app.accept_invitation(p_token_hash text, p_now timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_invitation app.invitations;
  v_email text;
  v_phone text;
begin
  select * into v_invitation from app.invitations where token_hash = p_token_hash for update;
  if not found then return 'not_found'; end if;
  if v_invitation.accepted_at is not null then return 'accepted_already'; end if;
  if v_invitation.revoked_at is not null then return 'revoked'; end if;
  if v_invitation.expires_at <= p_now then return 'expired'; end if;

  select lower(u.email), '+' || u.phone into v_email, v_phone from auth.users u where u.id = v_user;
  if v_user is null
     or (v_invitation.email is not null and v_invitation.email is distinct from v_email)
     or (v_invitation.phone is not null and v_invitation.phone is distinct from v_phone) then
    return 'wrong_person';
  end if;

  update app.invitations set accepted_at = p_now, accepted_by = v_user where id = v_invitation.id;
  insert into app.memberships (user_id, role, brand_id, venue_id, name)
  values (v_user, v_invitation.role, v_invitation.brand_id, v_invitation.venue_id, v_invitation.name)
  on conflict (user_id, role, brand_id, venue_id) where active do update set name = excluded.name;
  return 'accepted';
end
$$;
revoke execute on function app.accept_invitation (text, timestamptz) from public;
grant execute on function app.accept_invitation (text, timestamptz) to authenticated;

create policy "platform admins read owner invitations" on app.invitations
  for select to authenticated using (role = 'owner' and app.is_platform_admin ());
create policy "platform admins invite owners" on app.invitations
  for insert to authenticated with check (role = 'owner' and app.is_platform_admin ());
create policy "platform admins withdraw owner invitations" on app.invitations
  for update to authenticated
  using (role = 'owner' and app.is_platform_admin ()) with check (role = 'owner' and app.is_platform_admin ());

create policy "platform admins read owner memberships" on app.memberships
  for select to authenticated using (role = 'owner' and app.is_platform_admin ());

grant select, insert on app.invitations to authenticated;
grant update (revoked_at) on app.invitations to authenticated;
