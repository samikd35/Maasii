create table app.browsing_events (
  venue_id uuid not null references app.venues (id),
  kind text not null check (kind in ('menu_opened', 'dish_opened')),
  dish_id uuid references app.dishes (id),
  occurred_at timestamptz not null,
  page_load_id uuid not null,
  check ((kind = 'dish_opened') = (dish_id is not null))
);

create unique index on app.browsing_events (venue_id, page_load_id) where kind = 'menu_opened';

alter table app.browsing_events enable row level security;
grant insert on app.browsing_events to anon;

create policy "guests record browsing of the published Menu" on app.browsing_events
  for insert to anon with check (
    dish_id is null or exists (
      select 1 from app.venues v
      join app.brands b on b.id = v.brand_id
      join app.menu_version_dishes d on d.menu_version_id = b.published_menu_version_id
      where v.id = browsing_events.venue_id and d.dish_id = browsing_events.dish_id
    )
  );
