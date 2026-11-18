-- Immutable, validated serving clips. Object writes stay behind the Maasii core.
create table app.dish_video_assets (
  id uuid primary key,
  brand_id uuid not null references app.brands(id),
  venue_id uuid references app.venues(id),
  storage_path text not null unique,
  content_type text not null check (content_type = 'video/mp4'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 1048576),
  duration_ms integer not null check (duration_ms between 2000 and 5000),
  width integer not null check (width between 1 and 720),
  height integer not null check (height between 1 and 720),
  created_at timestamptz not null
);
create index on app.dish_video_assets(brand_id);
create index on app.dish_video_assets(venue_id);
alter table app.dish_video_assets enable row level security;
grant select, insert on app.dish_video_assets to authenticated;
create policy "authorized staff read video metadata" on app.dish_video_assets for select to authenticated
using (app.is_brand_owner(brand_id) or (venue_id is not null and app.can_manage_venue(venue_id))
  or (venue_id is null and exists(select 1 from app.venues v where v.brand_id = dish_video_assets.brand_id and app.can_manage_venue(v.id))));
create policy "authorized staff register serving clips" on app.dish_video_assets for insert to authenticated
with check ((venue_id is null and app.is_brand_owner(brand_id)) or
  (venue_id is not null and app.can_manage_venue(venue_id) and exists(select 1 from app.venues v where v.id = venue_id and v.brand_id = dish_video_assets.brand_id)));
alter table app.menu_version_dishes add column video_asset_id uuid references app.dish_video_assets(id);
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('dish-videos', 'dish-videos', true, 1048576, array['video/mp4']);
