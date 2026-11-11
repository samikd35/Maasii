-- The core sets this scope only after resolving the supplied Venue Link. It is local to the
-- transaction. The app schema remains outside the Data API.
create function app.in_order_venue(p_venue_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select (current_user = 'anon' or auth.jwt()->>'is_anonymous' = 'true') and exists (
    select 1 from app.venues v
    where v.id = p_venue_id and v.link_token = current_setting('app.order_venue_token', true)
  )
$$;
revoke execute on function app.in_order_venue(uuid) from public;
grant execute on function app.in_order_venue(uuid) to anon, authenticated;

create policy "Venue Link opens its active Tables" on app.tables
  for select to anon, authenticated using (active and app.in_order_venue(venue_id));
grant select on app.shifts to anon;

create policy "Venue Link reads its service state" on app.shifts
  for select to anon, authenticated using (app.in_order_venue(venue_id));
create policy "guest Send resolves its Table Assignment" on app.table_assignments
  for select to authenticated using (
    (select auth.jwt()->>'is_anonymous') = 'true' and app.in_order_venue(venue_id)
    and table_id::text = current_setting('app.order_table_id', true)
  );
create policy "guest Send resolves the assigned Waiter" on app.memberships
  for select to authenticated using (
    (select auth.jwt()->>'is_anonymous') = 'true' and app.in_order_venue(venue_id)
    and role = 'waiter' and active
  );

create table app.visits (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null,
  table_id uuid not null,
  opened_at timestamptz not null,
  closed_at timestamptz check (closed_at >= opened_at),
  foreign key (venue_id, table_id) references app.tables (venue_id, id),
  unique (id, venue_id, table_id)
);
create unique index visits_one_open_per_table on app.visits (table_id) where closed_at is null;
alter table app.visits enable row level security;

create table app.orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null,
  venue_id uuid not null,
  table_id uuid not null,
  table_number integer not null,
  shift_id uuid not null,
  guest_user_id uuid not null default auth.uid(),
  request_id uuid not null,
  sent_at timestamptz not null,
  waiter_id uuid,
  waiter_name text,
  state text not null default 'sent' check (state in ('sent', 'accepted')),
  accepted_by uuid,
  accepted_by_name text,
  accepted_at timestamptz check (accepted_at >= sent_at),
  -- Dish and choice names and their prices are fixed when an Order is sent.
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  foreign key (visit_id, venue_id, table_id) references app.visits (id, venue_id, table_id),
  foreign key (venue_id, shift_id) references app.shifts (venue_id, id),
  foreign key (venue_id, waiter_id) references app.memberships (venue_id, id),
  foreign key (venue_id, accepted_by) references app.memberships (venue_id, id),
  check (
    (state = 'accepted') = (accepted_at is not null)
    and (accepted_at is null) = (accepted_by is null) and (accepted_at is null) = (accepted_by_name is null)
  ),
  unique (request_id)
);
create index on app.orders (guest_user_id, venue_id, sent_at);
create index on app.orders (venue_id, table_id, sent_at);
create index on app.orders (visit_id);
alter table app.orders enable row level security;

grant select, insert (venue_id, table_id, opened_at) on app.visits to authenticated;
create policy "guest Send reads the open Visit of the chosen Table" on app.visits
  for select to authenticated using (
    (select auth.jwt()->>'is_anonymous') = 'true' and closed_at is null
    and app.in_order_venue(venue_id) and table_id::text = current_setting('app.order_table_id', true)
  );
create policy "guest Send opens a Visit at the chosen Table" on app.visits
  for insert to authenticated with check (
    (select auth.jwt()->>'is_anonymous') = 'true' and app.in_order_venue(venue_id)
    and table_id::text = current_setting('app.order_table_id', true)
  );

grant select, insert (
  visit_id, venue_id, table_id, table_number, shift_id, request_id, sent_at, waiter_id, waiter_name, lines
), update (state, accepted_by, accepted_by_name, accepted_at) on app.orders to authenticated;

create policy "guests read their own Orders" on app.orders
  for select to authenticated using (
    (select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid())
  );
create policy "guest Send adds an Order to the chosen Table" on app.orders
  for insert to authenticated with check (
    (select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid())
    and app.in_order_venue(venue_id) and table_id::text = current_setting('app.order_table_id', true)
  );

create policy "guests read their own Visits" on app.visits
  for select to authenticated using (
    (select auth.jwt()->>'is_anonymous') = 'true'
    and exists (
      select 1 from app.orders o where o.visit_id = visits.id and o.guest_user_id = (select auth.uid())
    )
  );

-- The app checks the browser-only PIN unlock proof inside each staff transaction.
-- No Auth JWT on its own can read or accept an Order as a Waiter.
create function app.order_waiter()
returns table (id uuid, name text, venue_id uuid, topic text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.venue_id, 'waiter-orders:' || d.session_id || ':' || d.unlock_hash
  from app.waiter_devices d
  join app.memberships m on m.id = d.waiter_id
  where d.session_id = (select (auth.jwt()->>'session_id')::uuid)
    and m.user_id = (select auth.uid()) and m.role = 'waiter' and m.active
    and d.failed_attempts < 5 and d.unlock_hash = current_setting('app.order_unlock_hash', true)
    and d.unlocked_until > nullif(current_setting('app.order_now', true), '')::timestamptz
$$;
revoke execute on function app.order_waiter() from public;
grant execute on function app.order_waiter() to authenticated;

create function app.waiter_serves_order_table(p_venue_id uuid, p_table_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from app.order_waiter() w
    join app.table_assignments a on a.waiter_id = w.id and a.venue_id = w.venue_id
    cross join lateral (
      select nullif(current_setting('app.order_now', true), '')::timestamptz as at
    ) clock
    where a.venue_id = p_venue_id and a.table_id = p_table_id
      and a.started_at <= clock.at and (a.ended_at is null or a.ended_at > clock.at)
  )
$$;
revoke execute on function app.waiter_serves_order_table(uuid, uuid) from public;
grant execute on function app.waiter_serves_order_table(uuid, uuid) to authenticated;

create policy "Waiters read open Visits at their assigned Tables" on app.visits
  for select to authenticated using (closed_at is null and app.waiter_serves_order_table(venue_id, table_id));

create policy "Waiters read Orders at their assigned Tables" on app.orders
  for select to authenticated using (app.waiter_serves_order_table(venue_id, table_id));
create policy "Waiters accept sent Orders at their assigned Tables" on app.orders
  for update to authenticated
  using (state = 'sent' and app.waiter_serves_order_table(venue_id, table_id))
  with check (state = 'accepted' and accepted_by = (select id from app.order_waiter()));

create table app.order_changes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  state text not null,
  actor_user_id uuid not null,
  changed_at timestamptz not null
);
create index on app.order_changes (order_id);
alter table app.order_changes enable row level security;

-- Private Broadcast carries only a refresh signal. The following HTTP read applies Orders RLS
-- again. A lock, expired PIN unlock or removed device also stops new signals to that channel.
create function app.can_read_order_topic(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when auth.jwt()->>'is_anonymous' = 'true' then
    p_topic = 'guest-orders:' || auth.uid()
  else exists (
    select 1 from app.waiter_devices d join app.memberships m on m.id = d.waiter_id
    where d.session_id = (select (auth.jwt()->>'session_id')::uuid)
      and m.user_id = (select auth.uid()) and m.role = 'waiter' and m.active
      and d.failed_attempts < 5 and d.unlocked_until > now()
      and p_topic = 'waiter-orders:' || d.session_id || ':' || d.unlock_hash
  ) end
$$;
revoke execute on function app.can_read_order_topic(text) from public;
grant execute on function app.can_read_order_topic(text) to authenticated;

create policy "guest and unlocked Waiter receive Order updates" on realtime.messages
  for select to authenticated using (
    extension = 'broadcast' and app.can_read_order_topic((select realtime.topic()))
  );

create function app.notify_waiter_orders(p_waiter_id uuid) returns void
language sql security definer set search_path = '' as $$
  select realtime.send('{}'::jsonb, 'changed', 'waiter-orders:' || d.session_id || ':' || d.unlock_hash, true)
  from app.waiter_devices d join app.memberships m on m.id = d.waiter_id
  where d.waiter_id = p_waiter_id and m.active and d.failed_attempts < 5
    and d.unlock_hash is not null and d.unlocked_until > now()
$$;
revoke execute on function app.notify_waiter_orders(uuid) from public;

create function app.notify_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app.notify_waiter_orders(new.waiter_id);
  else
    insert into app.order_changes (order_id, state, actor_user_id, changed_at)
      values (new.id, new.state, auth.uid(), new.accepted_at);
    perform app.notify_waiter_orders(new.accepted_by);
    perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || new.guest_user_id, true);
  end if;
  return new;
end
$$;
revoke execute on function app.notify_order_change() from public;

create trigger notify_order_change after insert or update of state on app.orders
  for each row execute function app.notify_order_change();

create function app.notify_table_assignment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify_waiter_orders(new.waiter_id);
  return new;
end
$$;
revoke execute on function app.notify_table_assignment_change() from public;

create trigger notify_table_assignment_change after insert or update of ended_at on app.table_assignments
  for each row execute function app.notify_table_assignment_change();

-- A Shift change affects Send, and closing a Visit clears its remembered Table Choice.
create function app.notify_venue_guests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
  from (
    select distinct o.guest_user_id
    from app.orders o join app.visits v on v.id = o.visit_id
    where o.venue_id = new.venue_id and (case when tg_table_name = 'visits' then v.id = new.id else v.closed_at is null end)
  ) g;
  return new;
end
$$;
revoke execute on function app.notify_venue_guests() from public;

create trigger notify_venue_service_change after insert or update of ended_at on app.shifts
  for each row execute function app.notify_venue_guests();
create trigger notify_visit_closed after update of closed_at on app.visits
  for each row when (old.closed_at is null and new.closed_at is not null)
  execute function app.notify_venue_guests();
