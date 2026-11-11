create table app.venue_dish_settings (
  venue_id uuid not null references app.venues (id),
  dish_id uuid not null references app.dishes (id),
  sold_out boolean not null default false,
  price_santim integer check (price_santim >= 0),
  primary key (venue_id, dish_id)
);

alter table app.venue_dish_settings enable row level security;

-- Availability and prices are public like the published Menu.
create policy "read venue dish settings" on app.venue_dish_settings
  for select to anon, authenticated using (true);

create policy "manage venue dish settings" on app.venue_dish_settings
  for all to authenticated using (app.can_manage_venue (venue_id))
  with check (app.can_manage_venue (venue_id) and exists (
    select 1 from app.venues v
    join app.brands b on b.id = v.brand_id
    join app.menu_version_dishes d on d.menu_version_id = b.published_menu_version_id
    where v.id = venue_dish_settings.venue_id and d.dish_id = venue_dish_settings.dish_id
  ));

grant select on app.venue_dish_settings to anon, authenticated;
grant insert (venue_id, dish_id, sold_out, price_santim), update (sold_out, price_santim)
  on app.venue_dish_settings to authenticated;

create table app.venue_dish_changes (
  id bigint generated always as identity primary key,
  venue_id uuid not null references app.venues (id),
  dish_id uuid not null references app.dishes (id),
  actor_user_id uuid,
  changed_at timestamptz not null,
  sold_out boolean not null,
  price_santim integer
);

create index venue_dish_changes_venue_time on app.venue_dish_changes (venue_id, changed_at desc, id desc);
alter table app.venue_dish_changes enable row level security;

create policy "owners read their venue dish changes" on app.venue_dish_changes
  for select to authenticated using (
    app.is_brand_owner ((select brand_id from app.venues where id = venue_id))
  );
grant select on app.venue_dish_changes to authenticated;

-- RLS scopes the row to Venue staff. Check the changed price separately so a Manager
-- can still change availability on a dish that already has a Venue price.
create function app.record_venue_dish_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed_by uuid := auth.uid();
begin
  if new.price_santim is distinct from (case when tg_op = 'UPDATE' then old.price_santim end)
    and changed_by is not null
    and not app.is_brand_owner ((select brand_id from app.venues where id = new.venue_id))
  then
    raise insufficient_privilege using message = 'Only the Brand Owner can change a Venue price.';
  end if;

  if (tg_op = 'UPDATE' and old is not distinct from new)
    or (tg_op = 'INSERT' and not new.sold_out and new.price_santim is null)
  then
    return null;
  end if;

  insert into app.venue_dish_changes (venue_id, dish_id, actor_user_id, changed_at, sold_out, price_santim)
  values (
    new.venue_id,
    new.dish_id,
    changed_by,
    coalesce(nullif(current_setting('app.venue_dish_changed_at', true), '')::timestamptz, statement_timestamp()),
    new.sold_out,
    new.price_santim
  );
  return null;
end
$$;

revoke execute on function app.record_venue_dish_change () from public;
create trigger record_venue_dish_change
  after insert or update on app.venue_dish_settings
  for each row execute function app.record_venue_dish_change ();
