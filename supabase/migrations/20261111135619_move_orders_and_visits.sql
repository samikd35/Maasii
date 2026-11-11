alter table app.orders alter constraint orders_visit_id_venue_id_table_id_fkey deferrable;

create policy "unlocked Waiters see active Table numbers at their Venue" on app.tables
  for select to authenticated using (active and venue_id = (select w.venue_id from app.order_waiter() w));

create table app.visit_moves (
  id bigint generated always as identity primary key,
  venue_id uuid not null references app.venues (id),
  order_id uuid references app.orders (id),
  from_visit_id uuid not null references app.visits (id),
  to_visit_id uuid not null references app.visits (id),
  from_table_id uuid not null references app.tables (id),
  to_table_id uuid not null references app.tables (id),
  changed_by uuid not null,
  changed_at timestamptz not null
);
create index on app.visit_moves (venue_id, id);
alter table app.visit_moves enable row level security;
grant select on app.visit_moves to authenticated;
create policy "management reads its Venue's moves" on app.visit_moves
  for select to authenticated using (app.can_manage_venue(venue_id));

-- A whole Visit may change location while its Bill and Order snapshots stay frozen.
create or replace function app.guard_prepared_bill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  locked_visit uuid;
  prepared boolean;
begin
  if tg_op = 'UPDATE' and old.table_id <> new.table_id and old.visit_id = new.visit_id
    and exists (select 1 from app.visits v where v.id = old.visit_id and v.table_id = new.table_id)
    and (to_jsonb(old) - array['table_id', 'table_number', 'waiter_id', 'waiter_name', 'escalated_at'])
      = (to_jsonb(new) - array['table_id', 'table_number', 'waiter_id', 'waiter_name', 'escalated_at'])
  then
    return new;
  end if;

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

-- The checked move command transfers removed-line keys without changing the audit entries.
create or replace function app.guard_manager_visit_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.can_manage_venue(old.venue_id) and (
    (old.bill_removed_lines is distinct from new.bill_removed_lines
      and (current_user = 'authenticated' or current_setting('app.transferring_bill_lines', true) is distinct from 'on'))
    or old.bill_discount_santim is distinct from new.bill_discount_santim
    or new.closed_reason in ('walked_out', 'on_the_house', 'entered_by_mistake')
  ) then
    raise insufficient_privilege;
  end if;
  return new;
end
$$;

create function app.move_service(p_order uuid, p_visit uuid, p_guest_venue uuid, p_table uuid, p_at timestamptz)
returns table (id uuid, number integer)
language plpgsql security definer set search_path = '' as $$
declare
  venue uuid;
  source app.visits;
  target app.visits;
  destination app.tables;
  chosen app.orders;
  recipient app.memberships;
  moving uuid[];
  removed text[];
begin
  if num_nonnulls(p_order, p_visit, p_guest_venue) <> 1 or p_table is null or p_at is null then
    raise invalid_parameter_value;
  end if;
  if p_guest_venue is not null then
    if auth.jwt()->>'is_anonymous' is distinct from 'true' or not app.in_order_venue(p_guest_venue) then
      raise insufficient_privilege;
    end if;
    venue := p_guest_venue;
  else
    select w.venue_id into venue from app.order_waiter() w;
    if not found then raise insufficient_privilege; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(venue::text, 0));
  if p_guest_venue is not null then
    select v.* into source from app.guest_table_choices g join app.visits v on v.id = g.visit_id
      where g.venue_id = venue and g.guest_user_id = auth.uid();
    if not found or source.closed_at is not null
      or exists (select 1 from app.orders o where o.visit_id = source.id and o.guest_user_id = auth.uid() and o.state = 'accepted')
    then
      raise check_violation using constraint = 'table_choice_locked';
    end if;
    select array_agg(o.id) into moving from app.orders o
      where o.visit_id = source.id and o.guest_user_id = auth.uid() and o.state = 'sent' and not o.party_pending;
    if moving is null then raise check_violation using constraint = 'table_choice_locked'; end if;
  elsif p_order is not null then
    select o.* into chosen from app.orders o where o.id = p_order and o.venue_id = venue;
    if not found or chosen.state = 'declined'
      or not app.can_work_order(venue, chosen.table_id, chosen.state, chosen.escalated_at, chosen.accepted_by)
    then
      raise insufficient_privilege;
    end if;
    select v.* into source from app.visits v where v.id = chosen.visit_id;
    moving := array[p_order];
  else
    select v.* into source from app.visits v where v.id = p_visit and v.venue_id = venue;
    if not found or not app.waiter_serves_order_table(venue, source.table_id) then raise insufficient_privilege; end if;
    select array_agg(o.id) into moving from app.orders o where o.visit_id = source.id;
  end if;
  if source.closed_at is not null then raise check_violation using constraint = 'order_visit_closed'; end if;
  if p_visit is null and source.bill_prepared_at is not null then
    raise check_violation using constraint = 'visit_bill_prepared';
  end if;

  select t.* into destination from app.tables t where t.id = p_table and t.venue_id = venue and t.active;
  if not found then raise check_violation using constraint = 'order_table_unavailable'; end if;
  if p_table = source.table_id then return query select destination.id, destination.number; return; end if;

  select v.* into target from app.visits v where v.table_id = p_table and v.closed_at is null;
  if p_visit is not null and target.id is not null then raise check_violation using constraint = 'order_table_occupied'; end if;
  if target.bill_prepared_at is not null then raise check_violation using constraint = 'visit_bill_prepared'; end if;
  select m.* into recipient from app.table_assignments a join app.memberships m on m.id = a.waiter_id and m.active
    where a.venue_id = venue and a.table_id = p_table and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at)
    order by a.started_at desc limit 1;

  if p_visit is not null then
    set constraints app.orders_visit_id_venue_id_table_id_fkey deferred;
    update app.visits v set table_id = p_table where v.id = source.id;
    target.id := source.id;
  elsif target.id is null then
    insert into app.visits (venue_id, table_id, opened_at) values (venue, p_table, p_at) returning * into target;
  end if;

  update app.orders o set visit_id = target.id, table_id = p_table, table_number = destination.number,
    waiter_id = recipient.id, waiter_name = recipient.name, escalated_at = null
    where o.id = any(moving);
  if p_visit is not null then
    set constraints app.orders_visit_id_venue_id_table_id_fkey immediate;
    insert into app.visit_moves (venue_id, from_visit_id, to_visit_id, from_table_id, to_table_id, changed_by, changed_at)
      values (venue, source.id, target.id, source.table_id, p_table, auth.uid(), p_at);
  else
    insert into app.visit_moves (venue_id, order_id, from_visit_id, to_visit_id, from_table_id, to_table_id, changed_by, changed_at)
      select venue, o, source.id, target.id, source.table_id, p_table, auth.uid(), p_at from unnest(moving) o;
    select array_agg(line) into removed from unnest(source.bill_removed_lines) line
      where split_part(line, ':', 1)::uuid = any(moving);
    if removed is not null then
      perform set_config('app.transferring_bill_lines', 'on', true);
      update app.visits v set bill_removed_lines = array(select line from unnest(v.bill_removed_lines) line where line <> all(removed))
        where v.id = source.id;
      update app.visits v set bill_removed_lines = v.bill_removed_lines || removed where v.id = target.id;
      perform set_config('app.transferring_bill_lines', 'off', true);
    end if;
    update app.guest_table_choices g set visit_id = target.id where g.visit_id = source.id
      and exists (select 1 from app.orders o where o.id = any(moving) and o.guest_user_id = g.guest_user_id);
    update app.visits v set closed_at = greatest(p_at, v.opened_at)
      where v.id = source.id and not exists (select 1 from app.orders o where o.visit_id = source.id and o.state <> 'declined');
  end if;

  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || guest, true)
  from (
    select g.guest_user_id as guest from app.guest_table_choices g where g.visit_id in (source.id, target.id)
    union
    select o.guest_user_id from app.orders o where o.id = any(moving) and o.party_pending
  ) guests;
  perform app.notify_waiter_orders(w) from app.on_duty_waiters(venue, p_at) w;

  -- Only a Sent Order still needs an incoming notification after it moves.
  delete from app.order_push_deliveries d using app.orders o
    where d.order_id = o.id and o.id = any(moving) and o.state = 'sent'
      and d.reason in ('new', 'escalation') and d.next_attempt_at is not null;
  insert into app.order_push_deliveries (order_id, subscription_id, reason, created_at, next_attempt_at)
    select o.id, sub.id, 'new', p_at, p_at
    from app.orders o
    cross join app.order_alert_waiters(venue, p_table, p_at, false) w
    join app.waiter_devices d on d.waiter_id = w and d.failed_attempts < 5
    join app.waiter_push_subscriptions sub on sub.session_id = d.session_id
    where o.id = any(moving) and o.state = 'sent'
    on conflict (order_id, subscription_id, reason) do nothing;
  if found then perform app.wake_order_notification_worker(); end if;

  return query select destination.id, destination.number;
end
$$;
revoke execute on function app.move_service(uuid, uuid, uuid, uuid, timestamptz) from public;
grant execute on function app.move_service(uuid, uuid, uuid, uuid, timestamptz) to authenticated;
