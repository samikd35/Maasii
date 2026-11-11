-- What a guest sees when they open a dish: its photo, its fasting label and its Option Groups.
-- Like the rest of a published Menu version, these rows never change once written.

alter table app.menu_version_dishes
  add column fasting boolean not null default false,
  add column photo_url text;

-- An Option Group is either "choose one" (optionally required) or "add extras". Group and choice
-- ids stay the same across Menu versions when the publisher passes them, so a guest's Draft
-- still recognises its choices after a republish.
create table app.menu_version_option_groups (
  menu_version_id uuid not null,
  option_group_id uuid not null,
  dish_id uuid not null,
  position integer not null,
  kind text not null check (kind in ('choose_one', 'add_extras')),
  required boolean not null default false check (not required or kind = 'choose_one'),
  name_en text not null check (length(trim(name_en)) > 0),
  primary key (menu_version_id, option_group_id),
  unique (menu_version_id, dish_id, position),
  foreign key (menu_version_id, dish_id) references app.menu_version_dishes (menu_version_id, dish_id)
);

create table app.menu_version_option_choices (
  menu_version_id uuid not null,
  choice_id uuid not null,
  option_group_id uuid not null,
  position integer not null,
  name_en text not null check (length(trim(name_en)) > 0),
  -- Added to the dish's price when chosen, in whole santim.
  price_change_santim integer not null default 0 check (price_change_santim >= 0),
  primary key (menu_version_id, choice_id),
  unique (menu_version_id, option_group_id, position),
  foreign key (menu_version_id, option_group_id)
    references app.menu_version_option_groups (menu_version_id, option_group_id)
);

create trigger menu_version_option_groups_are_immutable
  before update or delete on app.menu_version_option_groups
  for each row execute function app.reject_change_to_published_menu();
create trigger menu_version_option_choices_are_immutable
  before update or delete on app.menu_version_option_choices
  for each row execute function app.reject_change_to_published_menu();

alter table app.menu_version_option_groups enable row level security;
alter table app.menu_version_option_choices enable row level security;

create policy "read option groups of a readable menu version" on app.menu_version_option_groups
  for select to anon, authenticated
  using (exists (select 1 from app.menu_versions v where v.id = menu_version_id));
create policy "owners add option groups to their menu versions" on app.menu_version_option_groups
  for insert to authenticated
  with check (exists (
    select 1 from app.menu_versions v where v.id = menu_version_id and app.is_brand_owner (v.brand_id)
  ));

create policy "read option choices of a readable menu version" on app.menu_version_option_choices
  for select to anon, authenticated
  using (exists (select 1 from app.menu_versions v where v.id = menu_version_id));
create policy "owners add option choices to their menu versions" on app.menu_version_option_choices
  for insert to authenticated
  with check (exists (
    select 1 from app.menu_versions v where v.id = menu_version_id and app.is_brand_owner (v.brand_id)
  ));

grant select on app.menu_version_option_groups, app.menu_version_option_choices to anon, authenticated;
grant insert on app.menu_version_option_groups, app.menu_version_option_choices to authenticated;
