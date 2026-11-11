alter table app.orders add column escalated_at timestamptz check (escalated_at >= sent_at + interval '2 minutes');

-- A Waiter with a current Table Assignment is on duty for that Shift.
create function app.on_duty_waiters(p_venue uuid, p_at timestamptz) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct a.waiter_id
  from app.table_assignments a
  join app.shifts s on s.venue_id = a.venue_id and s.id = a.shift_id
  join app.memberships m on m.id = a.waiter_id
  where a.venue_id = p_venue and m.active
    and s.started_at <= p_at and (s.ended_at is null or s.ended_at > p_at)
    and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at)
$$;
revoke execute on function app.on_duty_waiters(uuid, timestamptz) from public;

-- Resolve the Table Assignment at the event's time. An unassigned or escalated
-- Order reaches the whole current Shift in the same Venue.
create function app.order_alert_waiters(p_venue uuid, p_table uuid, p_at timestamptz, p_all boolean)
returns setof uuid language sql stable security definer set search_path = '' as $$
  with assigned as (
    select a.waiter_id
    from app.table_assignments a join app.memberships m on m.id = a.waiter_id
    where a.venue_id = p_venue and a.table_id = p_table and m.active
      and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at)
  )
  select w from app.on_duty_waiters(p_venue, p_at) w
  where p_all or not exists (select 1 from assigned) or w in (select waiter_id from assigned)
$$;
revoke execute on function app.order_alert_waiters(uuid, uuid, timestamptz, boolean) from public;

create function app.can_work_order(
  p_venue uuid, p_table uuid, p_state text, p_escalated_at timestamptz, p_accepted_by uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select app.waiter_serves_order_table(p_venue, p_table) or exists (
    select 1
    from app.order_waiter() w
    cross join lateral (select nullif(current_setting('app.order_now', true), '')::timestamptz as at) clock
    where w.venue_id = p_venue and (p_state = 'sent' or w.id = p_accepted_by)
      and w.id in (select app.order_alert_waiters(p_venue, p_table, clock.at, p_escalated_at <= clock.at))
  )
$$;
revoke execute on function app.can_work_order(uuid, uuid, text, timestamptz, uuid) from public;
grant execute on function app.can_work_order(uuid, uuid, text, timestamptz, uuid) to authenticated;

-- Let an eligible Waiter check whether the Visit is open while preserving
-- the Table Assignment requirement for reading its Bill.
create function app.waiter_order_visit_is_open(p_visit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.visits v where v.id = p_visit and v.closed_at is null and (
      app.waiter_serves_order_table(v.venue_id, v.table_id) or exists (
        select 1 from app.orders o where o.visit_id = v.id
          and app.can_work_order(o.venue_id, o.table_id, o.state, o.escalated_at, o.accepted_by)
      )
    )
  )
$$;
revoke execute on function app.waiter_order_visit_is_open(uuid) from public;
grant execute on function app.waiter_order_visit_is_open(uuid) to authenticated;

alter policy "Waiters read Orders at their assigned Tables" on app.orders
  using (app.can_work_order(venue_id, table_id, state, escalated_at, accepted_by));
alter policy "Waiters accept sent Orders at their assigned Tables" on app.orders
  using (state = 'sent' and app.can_work_order(venue_id, table_id, state, escalated_at, accepted_by));

create index orders_waiting_to_escalate on app.orders (sent_at)
  where state = 'sent' and escalated_at is null;

create function app.escalate_orders(p_at timestamptz, p_venue uuid default null) returns void
language sql security definer set search_path = '' as $$
  update app.orders o set escalated_at = p_at
  from app.visits v, app.shifts s
  where (p_venue is null or o.venue_id = p_venue)
    and o.state = 'sent' and o.escalated_at is null and o.sent_at <= p_at - interval '2 minutes'
    and v.id = o.visit_id and v.closed_at is null and s.venue_id = o.venue_id
    and s.started_at <= p_at and (s.ended_at is null or s.ended_at > p_at)
$$;
revoke execute on function app.escalate_orders(timestamptz, uuid) from public;

create table app.waiter_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references app.waiter_devices (session_id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null
);
alter table app.waiter_push_subscriptions enable row level security;

create function app.register_waiter_push(p_endpoint text, p_keys jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  device uuid := (auth.jwt()->>'session_id')::uuid;
begin
  perform 1 from app.waiter_devices where session_id = device for update;
  if not found or not exists (select 1 from app.order_waiter()) then
    raise insufficient_privilege;
  end if;

  -- Replacing a subscription cancels its pending deliveries. A browser can bring
  -- an existing subscription to a new device session only with the same keys.
  delete from app.waiter_push_subscriptions
  where (session_id = device and endpoint <> p_endpoint)
     or (session_id <> device and endpoint = p_endpoint and keys = p_keys);

  insert into app.waiter_push_subscriptions (session_id, endpoint, keys)
  values (device, p_endpoint, p_keys)
  on conflict (session_id) do update set keys = excluded.keys;
end
$$;
revoke execute on function app.register_waiter_push(text, jsonb) from public;
grant execute on function app.register_waiter_push(text, jsonb) to authenticated;

create table app.order_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id) on delete cascade,
  subscription_id uuid not null references app.waiter_push_subscriptions (id) on delete cascade,
  reason text not null check (reason in ('new', 'escalation')),
  created_at timestamptz not null,
  next_attempt_at timestamptz,
  lease_id uuid,
  unique (order_id, subscription_id, reason)
);
alter table app.order_push_deliveries enable row level security;
create index order_push_deliveries_due on app.order_push_deliveries (next_attempt_at) where next_attempt_at is not null;
create index on app.order_push_deliveries (subscription_id);
create index on app.order_push_deliveries (created_at);

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- pg_net exposes queued request headers to some database roles. Issue a short-lived
-- wake token that the app consumes once, so the queue carries no reusable credential.
create table app.order_notification_wakes (
  token uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '1 minute')
);
alter table app.order_notification_wakes enable row level security;

create function app.wake_order_notification_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  endpoint text;
  wake uuid;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'maasii_order_notify_url';
  if endpoint is not null then
    insert into app.order_notification_wakes default values returning token into wake;
    perform net.http_post(
      url := endpoint,
      headers := jsonb_build_object('Authorization', 'Bearer ' || wake, 'Content-Type', 'application/json'),
      timeout_milliseconds := 15000
    );
  end if;
exception when others then
  -- The committed outbox remains eligible for the next minute even if pg_net cannot queue a wake.
  raise warning 'Could not queue the Order notification worker wake (%).', sqlstate;
end
$$;
revoke execute on function app.wake_order_notification_worker() from public;

create function app.notify_order_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  escalation boolean := tg_op = 'UPDATE';
  at timestamptz;
begin
  if new.state <> 'sent' then
    -- Remove pending alerts and refresh everyone who could previously see this Sent Order.
    delete from app.order_push_deliveries where order_id = new.id and next_attempt_at is not null;
    perform app.notify_waiter_orders(w)
      from app.order_alert_waiters(new.venue_id, new.table_id, new.accepted_at, new.escalated_at is not null) w
      where w is distinct from new.accepted_by;
    return new;
  end if;
  if escalation and (old.escalated_at is not null or new.escalated_at is null) then
    return new;
  end if;

  at := case when escalation then new.escalated_at else new.sent_at end;
  perform app.notify_waiter_orders(w)
    from app.order_alert_waiters(new.venue_id, new.table_id, at, escalation) w
    where escalation or w is distinct from new.waiter_id;

  insert into app.order_push_deliveries (order_id, subscription_id, reason, created_at, next_attempt_at)
  select new.id, p.id, case when escalation then 'escalation' else 'new' end, at, at
  from app.order_alert_waiters(new.venue_id, new.table_id, at, escalation) w
  join app.waiter_devices d on d.waiter_id = w and d.failed_attempts < 5
  join app.waiter_push_subscriptions p on p.session_id = d.session_id
  on conflict (order_id, subscription_id, reason) do nothing;

  if found and not escalation then
    -- pg_net starts the request after this transaction commits.
    perform app.wake_order_notification_worker();
  end if;
  return new;
end
$$;
revoke execute on function app.notify_order_alert() from public;
create trigger notify_order_alert after insert or update of state, escalated_at on app.orders
  for each row execute function app.notify_order_alert();

-- Reassignment can also change who sees Orders from an unassigned Table.
create or replace function app.notify_table_assignment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify_waiter_orders(new.waiter_id);
  perform app.notify_waiter_orders(w) from app.on_duty_waiters(new.venue_id, now()) w
    where w <> new.waiter_id;
  return new;
end
$$;

create function app.run_order_notification_minute() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.escalate_orders(now());
  delete from app.order_notification_wakes where expires_at <= now();
  delete from app.order_push_deliveries where created_at < now() - interval '1 day';
  if exists (select 1 from app.order_push_deliveries where next_attempt_at <= now()) then
    perform app.wake_order_notification_worker();
  end if;
end
$$;
revoke execute on function app.run_order_notification_minute() from public;
select cron.schedule('maasii-order-notifications', '* * * * *', 'select app.run_order_notification_minute()');
