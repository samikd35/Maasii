alter table app.orders
  drop constraint orders_state_check,
  add check (state in ('sent', 'accepted', 'declined')),
  add column declined_by uuid,
  add column declined_at timestamptz check (declined_at >= sent_at),
  add column decision_id uuid check (state <> 'sent' or decision_id is null),
  add foreign key (venue_id, declined_by) references app.memberships (venue_id, id),
  add check ((state = 'declined') = (declined_at is not null) and (declined_at is null) = (declined_by is null));

grant update (lines, declined_by, declined_at, decision_id) on app.orders to authenticated;

alter policy "Waiters accept sent Orders at their assigned Tables" on app.orders
  with check (
    state in ('accepted', 'declined') and coalesce(accepted_by, declined_by) = (select id from app.order_waiter())
  );

create policy "Waiters undo their own Order decisions" on app.orders
  for update to authenticated using (
    decision_id is not null and coalesce(accepted_by, declined_by) = (select id from app.order_waiter())
  ) with check (state = 'sent');

alter table app.visits
  drop constraint visits_check2,
  add constraint visits_closed_reason_check check (
    closed_reason is null or (closed_at is not null and (
      (closed_reason = 'paid' and bill_prepared_at is not null)
      or (closed_reason = 'all_declined' and bill_prepared_at is null)
    ))
  );

alter policy "guests read their chosen open or paid Visit" on app.visits
  using (
    (closed_at is null or closed_reason in ('paid', 'all_declined'))
    and id in (select visit_id from app.guest_table_choices)
  );
alter policy "guests read Orders in their chosen open or paid Visit" on app.orders
  using (
    visit_id in (select visit_id from app.guest_table_choices)
    and visit_id in (select id from app.visits where closed_at is null or closed_reason in ('paid', 'all_declined'))
  );

create or replace function app.notify_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app.notify_waiter_orders(new.waiter_id);
  else
    insert into app.order_changes (order_id, state, actor_user_id, changed_at)
      values (new.id, new.state, auth.uid(), coalesce(new.accepted_at, new.declined_at,
        nullif(current_setting('app.order_now', true), '')::timestamptz, statement_timestamp()));
    perform app.notify_waiter_orders(coalesce(new.accepted_by, new.declined_by, old.accepted_by, old.declined_by));
  end if;
  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
  from app.guest_table_choices g where g.visit_id = new.visit_id;
  return new;
end
$$;

-- The final Decline closes this Visit in the same transaction as the Order.
create function app.close_all_declined_visit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.bill_changed_at', new.declined_at::text, true);
  update app.visits v set closed_at = new.declined_at, closed_reason = 'all_declined'
  where v.id = new.visit_id and v.closed_at is null and v.bill_prepared_at is null
    and not exists (select 1 from app.orders o where o.visit_id = v.id and o.state <> 'declined');
  return new;
end
$$;
revoke execute on function app.close_all_declined_visit() from public;
create trigger close_all_declined_visit after update of state on app.orders
  for each row when (old.state = 'sent' and new.state = 'declined')
  execute function app.close_all_declined_visit();

-- Send and Order decisions hold the same Venue lock. Reopen only this Visit and
-- only while the Table has no later party. The partial unique index backs that up.
create function app.reopen_visit_for_order_undo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  visit app.visits%rowtype;
begin
  select * into strict visit from app.visits where id = old.visit_id;
  if visit.closed_at is null then
    return new;
  end if;
  if visit.closed_reason is distinct from 'all_declined' then
    raise check_violation using constraint = 'undo_visit_closed', message = 'This Visit is closed.';
  end if;
  if exists (
    select 1 from app.visits v where v.table_id = visit.table_id and v.id <> visit.id
      and (v.closed_at is null or (v.opened_at >= visit.closed_at and v.closed_at > visit.closed_at))
  ) then
    raise check_violation using constraint = 'undo_table_occupied', message = 'The Table has a later Visit.';
  end if;
  perform set_config('app.bill_changed_at', current_setting('app.order_now', true), true);
  update app.visits set closed_at = null, closed_reason = null where id = visit.id;
  return new;
end
$$;
revoke execute on function app.reopen_visit_for_order_undo() from public;
create trigger reopen_visit_for_order_undo before update of state on app.orders
  for each row when (old.state <> 'sent' and new.state = 'sent')
  execute function app.reopen_visit_for_order_undo();

-- The Waiter's Order authorization permits setting Sold Out for its Dropped Dishes.
-- Reuse the Venue setting and its audit trigger without granting general Menu access.
create function app.mark_order_dishes_sold_out() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select jsonb_agg(line - 'dropReason' order by n)
      from jsonb_array_elements(new.lines) with ordinality as l(line, n)) is distinct from old.lines then
    raise check_violation using message = 'Accepting an Order cannot change its Dish snapshots.';
  end if;
  perform set_config('app.venue_dish_changed_at', new.accepted_at::text, true);
  insert into app.venue_dish_settings (venue_id, dish_id, sold_out)
  select distinct new.venue_id, (line->>'dishId')::uuid, true
  from jsonb_array_elements(new.lines) as line where line->>'dropReason' = 'sold_out'
  order by 2
  on conflict (venue_id, dish_id) do update set sold_out = true;
  return new;
end
$$;
revoke execute on function app.mark_order_dishes_sold_out() from public;

create trigger mark_order_dishes_sold_out after update of state on app.orders
  for each row when (old.state = 'sent' and new.state = 'accepted' and old.lines is distinct from new.lines)
  execute function app.mark_order_dishes_sold_out();
