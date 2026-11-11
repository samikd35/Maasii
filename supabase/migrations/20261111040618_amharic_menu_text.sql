-- The Menu is in Amharic and English. A section or dish needs a name in at least one language;
-- guests reading the other language see that name instead of a blank. Missing text is ''.

alter table app.menu_version_sections
  add column name_am text not null default '',
  alter column name_en set default '',
  drop constraint menu_version_sections_name_en_check,
  add constraint menu_version_sections_named check (length(trim(name_en)) > 0 or length(trim(name_am)) > 0);

alter table app.menu_version_dishes
  add column name_am text not null default '',
  add column description_am text not null default '',
  alter column name_en set default '',
  drop constraint menu_version_dishes_name_en_check,
  add constraint menu_version_dishes_named check (length(trim(name_en)) > 0 or length(trim(name_am)) > 0);
