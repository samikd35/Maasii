alter table app.visits
  add column bill_removed_lines text[] not null default '{}',
  add column bill_discount_santim bigint not null default 0 check (bill_discount_santim >= 0),
  add column carried_over_at timestamptz,
  add column carried_from text,
  drop constraint visits_closed_reason_check;
alter table app.visits add constraint visits_closed_reason_check check (
  closed_reason is null or (closed_at is not null and (
    closed_reason in ('all_declined', 'walked_out', 'on_the_house', 'entered_by_mistake')
    or closed_reason = 'paid' and bill_prepared_at is not null
  ))
);
grant update (bill_removed_lines, bill_discount_santim) on app.visits to authenticated;

create function app.guard_manager_visit_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.can_manage_venue(old.venue_id) and (
    old.bill_removed_lines is distinct from new.bill_removed_lines
    or old.bill_discount_santim is distinct from new.bill_discount_santim
    or new.closed_reason in ('walked_out', 'on_the_house', 'entered_by_mistake')
  ) then
    raise insufficient_privilege;
  end if;
  return new;
end
$$;
create trigger guard_manager_visit_changes before update of bill_removed_lines, bill_discount_santim, closed_reason on app.visits
  for each row execute function app.guard_manager_visit_changes();

create table app.bill_adjustments (
  id bigint generated always as identity primary key,
  visit_id uuid not null,
  venue_id uuid not null,
  kind text not null check (kind in ('remove_line', 'discount')),
  order_id uuid references app.orders (id),
  line_index integer check (line_index >= 0),
  amount_santim bigint check (amount_santim >= 0),
  reason text not null check (char_length(trim(reason)) between 1 and 300),
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null,
  foreign key (visit_id, venue_id) references app.visits (id, venue_id),
  check (
    kind = 'remove_line' and order_id is not null and line_index is not null and amount_santim is null
    or kind = 'discount' and amount_santim is not null and order_id is null and line_index is null
  )
);
create index on app.bill_adjustments (visit_id, id);
alter table app.bill_adjustments enable row level security;
grant select, insert (visit_id, venue_id, kind, order_id, line_index, amount_santim, reason, changed_at)
  on app.bill_adjustments to authenticated;
create policy "management reads its Venue's Bill adjustments" on app.bill_adjustments
  for select to authenticated using (app.can_manage_venue(venue_id));
create policy "management records its Venue's Bill adjustments" on app.bill_adjustments
  for insert to authenticated with check (app.can_manage_venue(venue_id) and changed_by = (select auth.uid()));

drop trigger notify_bill_change on app.visits;
create trigger notify_bill_change after update of bill_prepared_at, bill_lines, bill_total_santim, closed_at, bill_removed_lines, bill_discount_santim on app.visits
  for each row when (
    old.bill_prepared_at is distinct from new.bill_prepared_at
    or old.bill_lines is distinct from new.bill_lines
    or old.bill_total_santim is distinct from new.bill_total_santim
    or old.closed_at is distinct from new.closed_at
    or old.bill_removed_lines is distinct from new.bill_removed_lines
    or old.bill_discount_santim is distinct from new.bill_discount_santim
  ) execute function app.notify_bill_change();

create function app.carry_open_visits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.visits v set carried_over_at = new.ended_at, carried_from = (
    select m.name from app.table_assignments a join app.memberships m on m.id = a.waiter_id
    where a.shift_id = new.id and a.table_id = v.table_id and a.started_at <= new.ended_at
      and (a.ended_at is null or a.ended_at >= new.ended_at)
    order by a.started_at desc limit 1
  )
  where v.venue_id = new.venue_id and v.closed_at is null and v.opened_at <= new.ended_at;
  return new;
end
$$;
revoke execute on function app.carry_open_visits() from public;
create trigger carry_open_visits after update of ended_at on app.shifts
  for each row when (old.ended_at is null and new.ended_at is not null) execute function app.carry_open_visits();

create or replace function app.resolve_pending_party(p_visit uuid, p_at timestamptz) returns void
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
  if v.closed_reason in ('paid', 'walked_out', 'on_the_house', 'entered_by_mistake') then
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
alter table app.bill_changes drop constraint bill_changes_action_check;
alter table app.bill_changes add check (action in ('prepared', 'reopened', 'paid', 'closed_unpaid'));

create function app.audit_unpaid_closure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.bill_changes (visit_id, action, actor_user_id, changed_at)
  values (new.id, 'closed_unpaid', auth.uid(), new.closed_at);
  return new;
end
$$;
revoke execute on function app.audit_unpaid_closure() from public;
create trigger audit_unpaid_closure after update of closed_reason on app.visits
  for each row when (old.closed_at is null and new.closed_reason in ('walked_out', 'on_the_house', 'entered_by_mistake'))
  execute function app.audit_unpaid_closure();
