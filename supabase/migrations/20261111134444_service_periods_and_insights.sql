create table app.venue_service_settings (
  venue_id uuid primary key references app.venues (id),
  opens_at time not null check (opens_at < time '24:00'),
  closes_at time not null check (closes_at < time '24:00' and closes_at <> opens_at),
  periods jsonb not null check (jsonb_typeof(periods) = 'array')
);
alter table app.venue_service_settings enable row level security;
grant select, insert, update on app.venue_service_settings to authenticated;
create policy "Owners manage their Venue service settings" on app.venue_service_settings
  for all to authenticated
  using (app.is_brand_owner((select brand_id from app.venues where id = venue_id)))
  with check (app.is_brand_owner((select brand_id from app.venues where id = venue_id)));

create index on app.orders (venue_id, accepted_at) where state = 'accepted';
