create table app.venue_menu_drafts (
  venue_id uuid primary key references app.venues (id),
  revision uuid not null default gen_random_uuid(),
  changes jsonb not null
);

create table app.venue_menu_revisions (
  id bigint generated always as identity primary key,
  venue_id uuid not null references app.venues (id),
  changes jsonb not null,
  published_at timestamptz not null,
  published_by uuid default auth.uid()
);

create index venue_menu_revision_latest on app.venue_menu_revisions (venue_id, id desc);
alter table app.venue_menu_drafts enable row level security;
alter table app.venue_menu_revisions enable row level security;
create policy "venue managers maintain their menu draft" on app.venue_menu_drafts
  for all to authenticated using (app.can_manage_venue(venue_id)) with check (app.can_manage_venue(venue_id));
create policy "read published venue revisions" on app.venue_menu_revisions
  for select to anon, authenticated using (true);
create policy "venue managers publish their menus" on app.venue_menu_revisions
  for insert to authenticated with check (app.can_manage_venue(venue_id) and published_by = auth.uid());
grant select, insert, update, delete on app.venue_menu_drafts to authenticated;
grant select on app.venue_menu_revisions to anon, authenticated;
grant insert (venue_id, changes, published_at) on app.venue_menu_revisions to authenticated;

-- Venue-specific dishes share the stable identities used by Orders, reviews and browsing.
alter table app.dishes add column venue_id uuid references app.venues (id);
create policy "venue dish identities belong to their brand" on app.dishes
  as restrictive for insert to authenticated with check (
    venue_id is null or exists (
      select 1 from app.venues v where v.id = venue_id and v.brand_id = dishes.brand_id
    )
  );
create policy "venue managers read local dishes" on app.dishes
  for select to authenticated using (venue_id is not null and app.can_manage_venue(venue_id));
create policy "venue managers add local dishes" on app.dishes
  for insert to authenticated with check (venue_id is not null and app.can_manage_venue(venue_id));

-- The prior Owner price settings remain live until the first Venue publish, which carries
-- them into that revision. Availability continues to use the existing immediate settings.
drop policy "manage venue dish settings" on app.venue_dish_settings;
create policy "manage venue dish settings" on app.venue_dish_settings
  for all to authenticated using (app.can_manage_venue(venue_id)) with check (
    app.can_manage_venue(venue_id) and (
      exists (
        select 1 from app.venues v join app.brands b on b.id = v.brand_id
        join app.menu_version_dishes d on d.menu_version_id = b.published_menu_version_id
        where v.id = venue_dish_settings.venue_id and d.dish_id = venue_dish_settings.dish_id
      ) or exists (
        select 1 from app.dishes d
        where d.venue_id = venue_dish_settings.venue_id and d.id = venue_dish_settings.dish_id
      )
    )
  );

alter policy "guests record browsing of the published Menu" on app.browsing_events with check (
  dish_id is null or exists (
    select 1 from app.venues v join app.brands b on b.id = v.brand_id
    join app.menu_version_dishes d on d.menu_version_id = b.published_menu_version_id
    where v.id = browsing_events.venue_id and d.dish_id = browsing_events.dish_id
  ) or exists (
    select 1 from (
      select changes from app.venue_menu_revisions
      where venue_id = browsing_events.venue_id order by id desc limit 1
    ) revision
    cross join lateral jsonb_array_elements(revision.changes->'additions') s
    cross join lateral jsonb_array_elements(s->'dishes') d
    where d->>'dishId' = browsing_events.dish_id::text
  )
);
