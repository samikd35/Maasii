create table app.brand_menu_drafts (
  brand_id uuid primary key references app.brands (id),
  revision uuid not null,
  content jsonb not null check (jsonb_typeof(content->'sections') is not distinct from 'array')
);

alter table app.brand_menu_drafts enable row level security;

create policy "owners edit their Menu drafts" on app.brand_menu_drafts
  for all to authenticated
  using (app.is_brand_owner (brand_id))
  with check (app.is_brand_owner (brand_id));

grant select, insert, update, delete on app.brand_menu_drafts to authenticated;
