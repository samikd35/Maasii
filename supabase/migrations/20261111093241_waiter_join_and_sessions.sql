create table app.waiter_join_codes (
  id uuid not null unique default gen_random_uuid(),
  token_hash text primary key,
  venue_id uuid not null references app.venues (id),
  waiter_id uuid references app.memberships (id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table app.waiter_devices (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  waiter_id uuid not null references app.memberships (id),
  pin_verifier text not null,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  unlock_hash text,
  unlocked_until timestamptz
);

create index on app.waiter_join_codes (venue_id);
create index on app.waiter_join_codes (waiter_id);
create index on app.waiter_devices (waiter_id);

-- Join tokens and PIN verifiers are readable only by the server-side core.
alter table app.waiter_join_codes enable row level security;
alter table app.waiter_devices enable row level security;

grant insert (token_hash, venue_id, waiter_id, expires_at) on app.waiter_join_codes to authenticated;
create policy "venue managers create waiter join codes" on app.waiter_join_codes
  for insert to authenticated with check (
    app.can_manage_venue (venue_id)
    and (waiter_id is null or exists (
      select 1 from app.memberships m
      where m.id = waiter_join_codes.waiter_id and m.venue_id = waiter_join_codes.venue_id
        and m.role = 'waiter' and m.active
    ))
  );

grant update (active) on app.memberships to authenticated;
create policy "venue managers remove active waiters" on app.memberships
  for update to authenticated
  using (role = 'waiter' and active and app.can_manage_venue (venue_id))
  with check (role = 'waiter' and not active and app.can_manage_venue (venue_id));

-- Removing a Waiter revokes every Auth session and its refresh tokens in the same transaction.
-- A still-unexpired JWT cannot read a Waiter device after its session has been removed.
create function app.revoke_waiter_sessions () returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = old.user_id;
  return new;
end
$$;
revoke execute on function app.revoke_waiter_sessions () from public;

create trigger revoke_waiter_sessions
  after update of active on app.memberships
  for each row when (old.role = 'waiter' and old.active and not new.active)
  execute function app.revoke_waiter_sessions ();

-- A staff member's language follows their Auth account between phones.
create table app.staff_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  language text not null check (language in ('am', 'en'))
);
alter table app.staff_preferences enable row level security;
grant select, insert (language), update (language) on app.staff_preferences to authenticated;

create policy "staff read their preferences" on app.staff_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "staff save their preferences" on app.staff_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "staff change their preferences" on app.staff_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
