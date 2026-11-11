-- Maasii keeps its records in the `app` schema, which the Data API does not expose.
-- The Maasii core reads and writes through a direct Postgres connection, acting as the caller
-- (role `anon` or `authenticated` plus JWT claims), so the row-level security below applies to it.
create schema app;
grant usage on schema app to anon, authenticated;

-- Brands, Venues and Tables -------------------------------------------------------------------

create table app.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  logo_url text,
  published_menu_version_id uuid,
  created_at timestamptz not null default now()
);

create table app.venues (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references app.brands (id),
  name text not null check (length(trim(name)) > 0),
  -- The Venue Link is /v/<link_token>. It is printed on every table, so it is public, not a secret.
  link_token text not null unique check (link_token ~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$'),
  created_at timestamptz not null default now()
);
create index on app.venues (brand_id);

create table app.tables (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references app.venues (id),
  number integer not null check (number > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, number)
);

-- Staff memberships (only Owners are used so far) ----------------------------------------------

create table app.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'waiter')),
  brand_id uuid references app.brands (id),
  venue_id uuid references app.venues (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'owner') = (brand_id is not null and venue_id is null)),
  check ((role <> 'owner') = (venue_id is not null and brand_id is null))
);
create index on app.memberships (user_id) where active;

-- SECURITY DEFINER so that policies on other tables can call it without recursing through
-- the memberships policies. Roles always come from database state, never from JWT claims.
create function app.is_brand_owner(p_brand_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.role = 'owner'
      and m.brand_id = p_brand_id
  )
$$;
revoke execute on function app.is_brand_owner (uuid) from public;
grant execute on function app.is_brand_owner (uuid) to anon, authenticated;

-- Menu -----------------------------------------------------------------------------------------
-- menu_sections and dishes hold only identity, so a dish keeps one id across Menu versions.
-- Everything a guest reads lives in an immutable, published menu version.

create table app.menu_sections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references app.brands (id),
  created_at timestamptz not null default now()
);
create index on app.menu_sections (brand_id);

create table app.dishes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references app.brands (id),
  created_at timestamptz not null default now()
);
create index on app.dishes (brand_id);

create table app.menu_versions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references app.brands (id),
  number integer not null check (number > 0),
  published_at timestamptz not null,
  published_by uuid,
  unique (brand_id, number),
  unique (id, brand_id)
);

create table app.menu_version_sections (
  menu_version_id uuid not null references app.menu_versions (id),
  section_id uuid not null references app.menu_sections (id),
  position integer not null,
  name_en text not null check (length(trim(name_en)) > 0),
  primary key (menu_version_id, section_id),
  unique (menu_version_id, position)
);

create table app.menu_version_dishes (
  menu_version_id uuid not null,
  dish_id uuid not null references app.dishes (id),
  section_id uuid not null,
  position integer not null,
  name_en text not null check (length(trim(name_en)) > 0),
  description_en text not null default '',
  -- Prices are whole santim (1 ETB = 100 santim) to keep Bill arithmetic exact.
  price_santim integer not null check (price_santim >= 0),
  primary key (menu_version_id, dish_id),
  unique (menu_version_id, section_id, position),
  foreign key (menu_version_id, section_id)
    references app.menu_version_sections (menu_version_id, section_id)
);

alter table app.brands
  add constraint brands_published_menu_version_fk
  foreign key (published_menu_version_id, id) references app.menu_versions (id, brand_id);

create function app.reject_change_to_published_menu() returns trigger
language plpgsql as $$
begin
  raise exception 'A published Menu version cannot be changed. Publish a new version instead.';
end
$$;

create trigger menu_versions_are_immutable
  before update or delete on app.menu_versions
  for each row execute function app.reject_change_to_published_menu();
create trigger menu_version_sections_are_immutable
  before update or delete on app.menu_version_sections
  for each row execute function app.reject_change_to_published_menu();
create trigger menu_version_dishes_are_immutable
  before update or delete on app.menu_version_dishes
  for each row execute function app.reject_change_to_published_menu();

-- Row-level security ---------------------------------------------------------------------------

alter table app.brands enable row level security;
alter table app.venues enable row level security;
alter table app.tables enable row level security;
alter table app.memberships enable row level security;
alter table app.menu_sections enable row level security;
alter table app.dishes enable row level security;
alter table app.menu_versions enable row level security;
alter table app.menu_version_sections enable row level security;
alter table app.menu_version_dishes enable row level security;

-- A Venue Link opens the menu for anyone, so brand, venue and table basics are public.
create policy "anyone reads brands" on app.brands
  for select to anon, authenticated using (true);
create policy "owners update their brand" on app.brands
  for update to authenticated
  using (app.is_brand_owner (id)) with check (app.is_brand_owner (id));

create policy "anyone reads venues" on app.venues
  for select to anon, authenticated using (true);

create policy "anyone reads tables" on app.tables
  for select to anon, authenticated using (true);

create policy "people read their own memberships" on app.memberships
  for select to authenticated using (user_id = (select auth.uid()));

create policy "owners read their menu sections" on app.menu_sections
  for select to authenticated using (app.is_brand_owner (brand_id));
create policy "owners add menu sections" on app.menu_sections
  for insert to authenticated with check (app.is_brand_owner (brand_id));

create policy "owners read their dishes" on app.dishes
  for select to authenticated using (app.is_brand_owner (brand_id));
create policy "owners add dishes" on app.dishes
  for insert to authenticated with check (app.is_brand_owner (brand_id));

-- Guests read only the brand's current Menu version. Owners read every version of their brand.
create policy "read the published menu version" on app.menu_versions
  for select to anon, authenticated
  using (
    exists (select 1 from app.brands b where b.published_menu_version_id = menu_versions.id)
    or app.is_brand_owner (brand_id)
  );
create policy "owners publish menu versions" on app.menu_versions
  for insert to authenticated with check (app.is_brand_owner (brand_id));

create policy "read sections of a readable menu version" on app.menu_version_sections
  for select to anon, authenticated
  using (exists (select 1 from app.menu_versions v where v.id = menu_version_id));
create policy "owners add sections to their menu versions" on app.menu_version_sections
  for insert to authenticated
  with check (exists (
    select 1 from app.menu_versions v where v.id = menu_version_id and app.is_brand_owner (v.brand_id)
  ));

create policy "read dishes of a readable menu version" on app.menu_version_dishes
  for select to anon, authenticated
  using (exists (select 1 from app.menu_versions v where v.id = menu_version_id));
create policy "owners add dishes to their menu versions" on app.menu_version_dishes
  for insert to authenticated
  with check (exists (
    select 1 from app.menu_versions v where v.id = menu_version_id and app.is_brand_owner (v.brand_id)
  ));

grant select on app.brands, app.venues, app.tables,
  app.menu_versions, app.menu_version_sections, app.menu_version_dishes
  to anon, authenticated;
grant select on app.memberships, app.menu_sections, app.dishes to authenticated;
grant update (published_menu_version_id) on app.brands to authenticated;
grant insert on app.menu_sections, app.dishes,
  app.menu_versions, app.menu_version_sections, app.menu_version_dishes
  to authenticated;
