-- A successful Send sets this phone's Table Choice for the Venue to that exact Visit.
create table app.guest_table_choices (
  guest_user_id uuid not null default auth.uid(),
  venue_id uuid not null references app.venues (id),
  visit_id uuid not null references app.visits (id),
  primary key (guest_user_id, venue_id)
);
create index on app.guest_table_choices (visit_id);
alter table app.guest_table_choices enable row level security;

-- Keep existing Table Choices when upgrading from the original Send flow.
insert into app.guest_table_choices (guest_user_id, venue_id, visit_id)
select distinct on (guest_user_id, venue_id) guest_user_id, venue_id, visit_id
from app.orders
order by guest_user_id, venue_id, sent_at desc, id desc;

grant select, insert (venue_id, visit_id), update (visit_id) on app.guest_table_choices to authenticated;
-- Read the selected Visit without recursing through its Table Choice policy.
create function app.visit_matches_send(p_venue_id uuid, p_visit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.in_order_venue(p_venue_id) and exists (
    select 1 from app.visits v where v.id = p_visit_id and v.venue_id = p_venue_id
      and v.closed_at is null and v.table_id::text = current_setting('app.order_table_id', true)
  )
$$;
revoke execute on function app.visit_matches_send(uuid, uuid) from public;
grant execute on function app.visit_matches_send(uuid, uuid) to authenticated;

create policy "guest Send sets the Table Choice" on app.guest_table_choices
  for all to authenticated
  using ((select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid()))
  with check (
    (select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid())
    and app.visit_matches_send(venue_id, visit_id)
  );

drop policy "guests read their own Visits" on app.visits;
create policy "guests read their chosen open Visit" on app.visits
  for select to authenticated using (
    closed_at is null and id in (select visit_id from app.guest_table_choices)
  );

drop policy "guests read their own Orders" on app.orders;
create policy "guests read Orders in their chosen open Visit" on app.orders
  for select to authenticated using (
    visit_id in (select visit_id from app.guest_table_choices)
    and visit_id in (select id from app.visits where closed_at is null)
  );
-- Keep the Send response and idempotent replay scoped to the guest who sent this request.
create policy "guests read their own Send result" on app.orders
  for select to authenticated using (
    (select auth.jwt()->>'is_anonymous') = 'true' and guest_user_id = (select auth.uid())
    and request_id::text = current_setting('app.order_request_id', true)
  );

-- Keep each phone's existing private topic. Broadcast refresh signals only to phones
-- whose Table Choice still points to the changed Visit.
create or replace function app.notify_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app.notify_waiter_orders(new.waiter_id);
  else
    insert into app.order_changes (order_id, state, actor_user_id, changed_at)
      values (new.id, new.state, auth.uid(), new.accepted_at);
    perform app.notify_waiter_orders(new.accepted_by);
  end if;
  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
  from app.guest_table_choices g where g.visit_id = new.visit_id;
  return new;
end
$$;

create or replace function app.notify_venue_guests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
  from app.guest_table_choices g join app.visits v on v.id = g.visit_id
  where g.venue_id = new.venue_id
    and (case when tg_table_name = 'visits' then v.id = new.id else v.closed_at is null end);
  return new;
end
$$;
