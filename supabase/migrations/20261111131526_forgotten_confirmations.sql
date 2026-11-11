alter table app.orders add column party_pending boolean not null default false;
grant insert (party_pending) on app.orders to authenticated;
create index on app.orders (visit_id) where party_pending;

alter policy "guests read Orders in their chosen open or paid Visit" on app.orders
  using (not party_pending
    and visit_id in (select visit_id from app.guest_table_choices)
    and visit_id in (select id from app.visits where closed_at is null or closed_reason = 'paid'));

create or replace function app.visit_matches_send(p_venue_id uuid, p_visit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.in_order_venue(p_venue_id) and exists (
    select 1 from app.visits v where v.id = p_visit_id and v.venue_id = p_venue_id
      and v.closed_at is null and v.bill_prepared_at is null
      and v.table_id::text = current_setting('app.order_table_id', true)
  )
$$;

create policy "guests read their own pending party Orders" on app.orders
  for select to authenticated using (
    party_pending and (select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid())
  );

create or replace function app.guard_prepared_bill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  locked_visit uuid;
  prepared boolean;
begin
  if tg_op <> 'DELETE' then
    select bill_prepared_at is not null into prepared from app.visits where id = new.visit_id;
  end if;

  if tg_op = 'INSERT' and auth.jwt()->>'is_anonymous' = 'true' then
    if coalesce(prepared, false) and exists (
      select 1 from app.orders o where o.visit_id = new.visit_id and o.guest_user_id = auth.uid() and not o.party_pending
    ) then
      raise check_violation using constraint = 'visit_bill_prepared', message = 'The Bill is prepared.';
    end if;
    if new.party_pending is distinct from coalesce(prepared, false) then
      raise check_violation using constraint = 'visit_bill_needs_waiter', message = 'This Order needs a party decision.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.party_pending then
    if new.state <> 'sent' then
      raise check_violation using constraint = 'visit_bill_needs_waiter', message = 'Resolve the new party before accepting its Order.';
    end if;
    if not new.party_pending and not coalesce(prepared, false) then return new; end if;
  end if;

  if tg_op <> 'INSERT' and (
    old.state = 'accepted' or (tg_op = 'UPDATE' and old.visit_id <> new.visit_id)
  ) then
    locked_visit := old.visit_id;
  end if;
  if coalesce(prepared, false) and tg_op <> 'DELETE' and new.state = 'accepted'
    or exists (select 1 from app.visits v where v.id = locked_visit and v.bill_prepared_at is not null)
  then
    raise check_violation using constraint = 'visit_bill_prepared', message = 'The Bill is prepared.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- Called inside the same transaction that reopens or records payment for the prepared Visit.
create function app.resolve_pending_party(p_visit uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v app.visits;
  target uuid;
begin
  select * into v from app.visits where id = p_visit;
  if not found or not (app.can_manage_venue(v.venue_id) or app.waiter_serves_order_table(v.venue_id, v.table_id)) then
    raise insufficient_privilege;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v.venue_id::text, 0));
  select * into v from app.visits where id = p_visit;
  if not exists (select 1 from app.orders where visit_id = v.id and party_pending) then return; end if;

  target := v.id;
  if v.closed_reason = 'paid' then
    insert into app.visits (venue_id, table_id, opened_at) values (v.venue_id, v.table_id, p_at) returning id into target;
  elsif v.closed_at is not null or v.bill_prepared_at is not null then
    raise check_violation using constraint = 'visit_bill_prepared', message = 'Resolve the prepared Bill first.';
  end if;

  with promoted as (
    update app.orders set visit_id = target, party_pending = false
    where visit_id = v.id and party_pending
    returning guest_user_id
  )
  insert into app.guest_table_choices (guest_user_id, venue_id, visit_id)
    select distinct guest_user_id, v.venue_id, target from promoted
  on conflict (guest_user_id, venue_id) do update set visit_id = excluded.visit_id;

  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
    from app.guest_table_choices g where g.visit_id = target;
  perform app.notify_waiter_orders(w) from app.order_alert_waiters(v.venue_id, v.table_id, p_at, false) w;
end
$$;
revoke execute on function app.resolve_pending_party(uuid, timestamptz) from public;
grant execute on function app.resolve_pending_party(uuid, timestamptz) to authenticated;

alter table app.visits add column bill_reminded_at timestamptz;
create index on app.visits (bill_prepared_at) where closed_at is null and bill_reminded_at is null;
alter table app.order_push_deliveries drop constraint order_push_deliveries_reason_check;
alter table app.order_push_deliveries add check (reason in ('new', 'escalation', 'bill-reminder'));

create function app.clear_bill_reminder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.bill_reminded_at := null;
  delete from app.order_push_deliveries d using app.orders o
    where d.order_id = o.id and o.visit_id = old.id and d.reason = 'bill-reminder';
  return new;
end
$$;
revoke execute on function app.clear_bill_reminder() from public;
create trigger clear_bill_reminder before update of bill_prepared_at, closed_at on app.visits
  for each row when (
    old.bill_prepared_at is distinct from new.bill_prepared_at or old.closed_at is distinct from new.closed_at
  ) execute function app.clear_bill_reminder();

create function app.flag_unconfirmed_bills(p_at timestamptz, p_venue uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  flagged app.visits;
begin
  for flagged in
    update app.visits set bill_reminded_at = p_at
    where closed_at is null and bill_reminded_at is null and bill_prepared_at <= p_at - interval '20 minutes'
      and (p_venue is null or venue_id = p_venue)
    returning *
  loop
    perform app.notify_waiter_orders(w) from app.order_alert_waiters(flagged.venue_id, flagged.table_id, p_at, false) w;
    insert into app.order_push_deliveries (order_id, subscription_id, reason, created_at, next_attempt_at)
    select o.id, p.id, 'bill-reminder', p_at, p_at
    from lateral (
      select id from app.orders where visit_id = flagged.id and state = 'accepted' order by sent_at, id limit 1
    ) o
    join app.waiter_devices d on d.waiter_id in (
      select app.order_alert_waiters(flagged.venue_id, flagged.table_id, p_at, false)
    ) and d.failed_attempts < 5
    join app.waiter_push_subscriptions p on p.session_id = d.session_id
    on conflict (order_id, subscription_id, reason) do nothing;
  end loop;
end
$$;
revoke execute on function app.flag_unconfirmed_bills(timestamptz, uuid) from public;

create or replace function app.run_order_notification_minute() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.escalate_orders(now());
  perform app.flag_unconfirmed_bills(now());
  delete from app.order_notification_wakes where expires_at <= now();
  delete from app.order_push_deliveries where created_at < now() - interval '1 day';
  if exists (select 1 from app.order_push_deliveries where next_attempt_at <= now()) then
    perform app.wake_order_notification_worker();
  end if;
end
$$;
