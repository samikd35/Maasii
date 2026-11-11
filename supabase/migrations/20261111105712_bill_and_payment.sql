alter table app.visits
  add column bill_prepared_at timestamptz check (bill_prepared_at >= opened_at),
  add column bill_lines jsonb check (jsonb_typeof(bill_lines) = 'array'),
  add column bill_total_santim bigint check (bill_total_santim >= 0),
  add column closed_reason text check (closed_reason is null or (closed_reason = 'paid' and closed_at is not null and bill_prepared_at is not null)),
  add check (
    (bill_prepared_at is null) = (bill_lines is null)
    and (bill_prepared_at is null) = (bill_total_santim is null)
  ),
  add unique (id, venue_id);

drop policy "guests read their chosen open Visit" on app.visits;
create policy "guests read their chosen open or paid Visit" on app.visits
  for select to authenticated using (
    (closed_at is null or closed_reason = 'paid')
    and id in (select visit_id from app.guest_table_choices)
  );

drop policy "guests read Orders in their chosen open Visit" on app.orders;
create policy "guests read Orders in their chosen open or paid Visit" on app.orders
  for select to authenticated using (
    visit_id in (select visit_id from app.guest_table_choices)
    and visit_id in (select id from app.visits where closed_at is null or closed_reason = 'paid')
  );

create policy "managers read their Venue's Visits" on app.visits
  for select to authenticated using (app.can_manage_venue(venue_id));
create policy "managers read their Venue's Orders" on app.orders
  for select to authenticated using (app.can_manage_venue(venue_id));

create policy "Waiters read closed Visits at their assigned Tables" on app.visits
  for select to authenticated using (closed_at is not null and app.waiter_serves_order_table(venue_id, table_id));

grant update (bill_prepared_at, bill_lines, bill_total_santim, closed_at, closed_reason) on app.visits to authenticated;
create policy "authorized staff update their Visit's Bill" on app.visits
  for update to authenticated
  using (closed_at is null and (app.can_manage_venue(venue_id) or app.waiter_serves_order_table(venue_id, table_id)))
  with check (app.can_manage_venue(venue_id) or app.waiter_serves_order_table(venue_id, table_id));

-- Send, Accept and Bill commands already serialize on the Venue's transaction lock.
-- Enforce the prepared state for other order-writing paths as well.
create function app.guard_prepared_bill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  locked_visit uuid;
begin
  if tg_op <> 'INSERT' and (
    old.state = 'accepted' or (tg_op = 'UPDATE' and old.visit_id <> new.visit_id)
  ) then
    locked_visit := old.visit_id;
  end if;
  if exists (
    select 1 from app.visits v where v.bill_prepared_at is not null and (
      v.id = locked_visit or (
        tg_op <> 'DELETE' and v.id = new.visit_id and (
          new.state = 'accepted' or (
            tg_op = 'INSERT' and auth.jwt()->>'is_anonymous' = 'true' and exists (
              select 1 from app.orders o where o.visit_id = v.id and o.guest_user_id = auth.uid()
            )
          )
        )
      )
    )
  ) then
    raise check_violation using constraint = 'visit_bill_prepared', message = 'The Bill is prepared.';
  end if;
  -- An unseen device cannot attach to the previous party's prepared Visit.
  -- The new-party flow can give this branch its own pending Order.
  if tg_op = 'INSERT' and auth.jwt()->>'is_anonymous' = 'true' and exists (
    select 1 from app.visits v where v.id = new.visit_id and v.bill_prepared_at is not null
  ) then
    raise check_violation using constraint = 'visit_bill_needs_waiter', message = 'Ask the Waiter before ordering.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke execute on function app.guard_prepared_bill() from public;

create trigger guard_prepared_bill before insert or delete or update of state, lines, visit_id, table_id on app.orders
  for each row execute function app.guard_prepared_bill();

create policy "guests see active Payment Options for their Prepared Bill" on app.payment_options
  for select to authenticated using (
    active and exists (
      select 1 from app.guest_table_choices g join app.visits v on v.id = g.visit_id
      where g.venue_id = payment_options.venue_id and v.bill_prepared_at is not null
        and v.closed_at is null
    )
  );
create policy "Waiters read active Payment Options for assigned Prepared Bills" on app.payment_options
  for select to authenticated using (
    active and exists (
      select 1 from app.visits v where v.venue_id = payment_options.venue_id
        and v.bill_prepared_at is not null and v.closed_at is null
        and app.waiter_serves_order_table(v.venue_id, v.table_id)
    )
  );

create table app.bill_changes (
  id bigint generated always as identity primary key,
  visit_id uuid not null references app.visits (id),
  action text not null check (action in ('prepared', 'reopened', 'paid')),
  actor_user_id uuid not null,
  changed_at timestamptz not null
);
create index on app.bill_changes (visit_id);
alter table app.bill_changes enable row level security;

drop trigger notify_visit_closed on app.visits;

create function app.notify_bill_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed_at timestamptz := coalesce(
    nullif(current_setting('app.bill_changed_at', true), '')::timestamptz,
    statement_timestamp()
  );
begin
  if new.closed_reason = 'paid' and old.closed_at is null
    or new.bill_prepared_at is distinct from old.bill_prepared_at then
    insert into app.bill_changes (visit_id, action, actor_user_id, changed_at)
    values (new.id, case when new.closed_reason = 'paid' then 'paid'
      when new.bill_prepared_at is not null then 'prepared' else 'reopened' end, auth.uid(), changed_at);
  end if;

  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
  from app.guest_table_choices g where g.visit_id = new.id;
  perform app.notify_waiter_orders(a.waiter_id)
  from app.table_assignments a where a.venue_id = new.venue_id and a.table_id = new.table_id
    and a.started_at <= changed_at and (a.ended_at is null or a.ended_at > changed_at);
  return new;
end
$$;
revoke execute on function app.notify_bill_change() from public;

create trigger notify_bill_change after update of bill_prepared_at, bill_lines, bill_total_santim, closed_at on app.visits
  for each row when (
    old.bill_prepared_at is distinct from new.bill_prepared_at
    or old.bill_lines is distinct from new.bill_lines
    or old.bill_total_santim is distinct from new.bill_total_santim
    or old.closed_at is distinct from new.closed_at
  ) execute function app.notify_bill_change();

create table app.payment_confirmations (
  visit_id uuid primary key,
  venue_id uuid not null,
  method jsonb not null,
  receipt_amount_santim bigint not null check (receipt_amount_santim >= 0),
  bill_total_santim bigint not null check (bill_total_santim >= 0),
  difference_santim bigint generated always as (receipt_amount_santim - bill_total_santim) stored,
  confirmed_by uuid not null default auth.uid(),
  confirmed_at timestamptz not null,
  foreign key (visit_id, venue_id) references app.visits (id, venue_id)
);
create index on app.payment_confirmations (venue_id, confirmed_at);
alter table app.payment_confirmations enable row level security;
grant select, insert (visit_id, venue_id, method, receipt_amount_santim, bill_total_santim, confirmed_at)
  on app.payment_confirmations to authenticated;

create policy "authorized staff read Payment Confirmations" on app.payment_confirmations
  for select to authenticated using (
    app.can_manage_venue(venue_id) or exists (
      select 1 from app.visits v where v.id = payment_confirmations.visit_id
        and app.waiter_serves_order_table(v.venue_id, v.table_id)
    )
  );
create policy "authorized staff record Payment Confirmations" on app.payment_confirmations
  for insert to authenticated with check (
    confirmed_by = (select auth.uid()) and exists (
      select 1 from app.visits v where v.id = payment_confirmations.visit_id
        and v.closed_at is null and v.bill_prepared_at is not null
        and v.bill_total_santim = payment_confirmations.bill_total_santim
        and (app.can_manage_venue(v.venue_id) or app.waiter_serves_order_table(v.venue_id, v.table_id))
    )
  );

-- A destination edit must wake guest and waiter screens already displaying the Bill.
create function app.notify_bill_payment_options_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed_venue uuid := coalesce(new.venue_id, old.venue_id);
begin
  perform realtime.send('{}'::jsonb, 'changed', 'guest-orders:' || g.guest_user_id, true)
  from app.guest_table_choices g join app.visits v on v.id = g.visit_id
  where g.venue_id = changed_venue and v.bill_prepared_at is not null and v.closed_at is null;

  perform app.notify_waiter_orders(w.waiter_id)
  from (
    select distinct a.waiter_id from app.table_assignments a
    join app.visits v on v.table_id = a.table_id and v.venue_id = a.venue_id
    where a.venue_id = changed_venue and v.bill_prepared_at is not null and v.closed_at is null
      and a.started_at <= statement_timestamp() and (a.ended_at is null or a.ended_at > statement_timestamp())
  ) w;
  return null;
end
$$;
revoke execute on function app.notify_bill_payment_options_change() from public;

create trigger notify_bill_payment_options_change after insert or update or delete on app.payment_options
  for each row execute function app.notify_bill_payment_options_change();
