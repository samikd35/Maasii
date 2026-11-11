alter table app.orders
  alter column guest_user_id drop not null,
  add column entered_by uuid,
  add foreign key (venue_id, entered_by) references app.memberships (venue_id, id),
  add check ((guest_user_id is null) = (entered_by is not null));

create index on app.orders (entered_by, accepted_at desc) where entered_by is not null;

create policy "unlocked Waiters read their Venue Shifts" on app.shifts
  for select to authenticated using (venue_id = (select w.venue_id from app.order_waiter() w));
create policy "Waiters open Visits at their assigned Tables" on app.visits
  for insert to authenticated with check (app.waiter_serves_order_table(venue_id, table_id));

grant insert (guest_user_id, entered_by, state, accepted_by, accepted_by_name, accepted_at) on app.orders to authenticated;
alter policy "guest Send adds an Order to the chosen Table" on app.orders with check (
  (select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid()) and state = 'sent'
  and app.in_order_venue(venue_id) and table_id::text = current_setting('app.order_table_id', true)
);
create policy "Waiters add accepted Orders at their assigned Tables" on app.orders
  for insert to authenticated with check (
    guest_user_id is null and state = 'accepted' and not party_pending and accepted_at = sent_at
    and app.waiter_serves_order_table(venue_id, table_id)
    and exists (
      select 1 from app.order_waiter() w where w.venue_id = orders.venue_id and w.id = entered_by
        and w.id = accepted_by and w.id = waiter_id and w.name = accepted_by_name and w.name = waiter_name
    )
    and exists (
      select 1 from app.shifts s where s.id = orders.shift_id and s.venue_id = orders.venue_id
        and s.started_at <= orders.sent_at and (s.ended_at is null or s.ended_at > orders.sent_at)
    )
    and exists (select 1 from app.visits v where v.id = orders.visit_id and v.closed_at is null)
  );

create function app.recent_waiter_order_lines() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select o.lines from app.orders o where o.entered_by = (select id from app.order_waiter())
  order by o.accepted_at desc, o.id limit 12
$$;
revoke execute on function app.recent_waiter_order_lines() from public;
grant execute on function app.recent_waiter_order_lines() to authenticated;

create table app.waiter_order_corrections (
  id bigint generated always as identity primary key,
  venue_id uuid not null references app.venues (id),
  order_id uuid not null references app.orders (id),
  line_index integer not null check (line_index >= 0),
  before_quantity integer not null check (before_quantity between 1 and 99),
  after_quantity integer check (after_quantity between 1 and 99),
  reason text not null check (char_length(trim(reason)) between 1 and 300),
  changed_by uuid not null,
  changed_at timestamptz not null
);
create index on app.waiter_order_corrections (order_id, id);
alter table app.waiter_order_corrections enable row level security;
grant select on app.waiter_order_corrections to authenticated;
create policy "management reads its Venue's Waiter corrections" on app.waiter_order_corrections
  for select to authenticated using (app.can_manage_venue(venue_id));

create function app.correct_waiter_order_line(p_order uuid, p_index integer, p_quantity integer, p_reason text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  venue uuid;
  waiter uuid;
  chosen app.orders;
  visit app.visits;
  line jsonb;
  before_quantity integer;
begin
  select w.id, w.venue_id into waiter, venue from app.order_waiter() w;
  if not found then raise insufficient_privilege; end if;
  if p_index is null or p_index not between 0 and 99 or p_quantity not between 1 and 99
    or p_reason is null or char_length(trim(p_reason)) not between 1 and 300 or p_at is null
  then raise invalid_parameter_value; end if;

  perform pg_advisory_xact_lock(hashtextextended(venue::text, 0));
  select o.* into chosen from app.orders o where o.id = p_order and o.venue_id = venue;
  if not found or chosen.state <> 'accepted' or chosen.accepted_by is distinct from waiter
    or not app.waiter_serves_order_table(venue, chosen.table_id)
  then raise insufficient_privilege; end if;
  select v.* into visit from app.visits v where v.id = chosen.visit_id;
  if visit.bill_prepared_at is not null then raise check_violation using constraint = 'visit_bill_prepared'; end if;
  if visit.closed_at is not null then raise check_violation using constraint = 'order_visit_closed'; end if;
  line := chosen.lines -> p_index;
  if line is null or line->>'dropReason' is not null or (chosen.id::text || ':' || p_index::text) = any(visit.bill_removed_lines)
  then raise check_violation using constraint = 'order_line_unavailable'; end if;
  before_quantity := (line->>'quantity')::integer;
  if p_quantity = before_quantity then return; end if;

  update app.orders o set lines = jsonb_set(chosen.lines, array[p_index::text],
    case when p_quantity is null then line || jsonb_build_object('dropReason', 'waiter_removed')
      else jsonb_set(line, '{quantity}', to_jsonb(p_quantity)) end
  ) where o.id = p_order;
  insert into app.waiter_order_corrections (venue_id, order_id, line_index, before_quantity, after_quantity, reason, changed_by, changed_at)
    values (venue, p_order, p_index, before_quantity, p_quantity, trim(p_reason), auth.uid(), p_at);

  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
    from app.guest_table_choices g where g.visit_id = visit.id;
  perform app.notify_waiter_orders(w) from app.order_alert_waiters(venue, chosen.table_id, p_at, false) w;
end
$$;
revoke execute on function app.correct_waiter_order_line(uuid, integer, integer, text, timestamptz) from public;
grant execute on function app.correct_waiter_order_line(uuid, integer, integer, text, timestamptz) to authenticated;
