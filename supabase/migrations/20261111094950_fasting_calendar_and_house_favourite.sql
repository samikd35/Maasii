-- Dated periods override the regular Wednesday and Friday fasts. Dates are inclusive in Ethiopia.
create table app.fasting_calendar_periods (
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  fasting boolean not null,
  primary key (starts_on, ends_on, fasting)
);

alter table app.fasting_calendar_periods enable row level security;
grant select on app.fasting_calendar_periods to anon, authenticated;
create policy fasting_calendar_periods_read on app.fasting_calendar_periods
  for select to anon, authenticated using (true);

-- 2026 Gregorian dates: https://www.debreenqueotc.org/church-calendar
-- Weekly fasts and feast exceptions: https://eotcmk.org/sa/wp-content/uploads/The-Orders-of-the-Fast.pdf
insert into app.fasting_calendar_periods (starts_on, ends_on, fasting) values
  ('2025-11-24', '2026-01-06', true),  -- Fast of the Prophets (2025 carryover)
  ('2026-02-02', '2026-02-04', true),  -- Fast of Nineveh
  ('2026-02-16', '2026-04-11', true),  -- Great Lent
  ('2026-06-01', '2026-07-11', true),  -- Fast of the Apostles
  ('2026-08-07', '2026-08-21', true),  -- Filseta
  ('2026-11-24', '2027-01-06', true),  -- Fast of the Prophets
  ('2026-01-07', '2026-01-07', false), -- Christmas
  ('2026-01-19', '2026-01-19', false), -- Epiphany
  ('2026-04-12', '2026-05-31', false); -- Easter through Pentecost

alter table app.menu_version_dishes
  add column house_favourite boolean not null default false check (not house_favourite or photo_url is not null);

create unique index one_house_favourite_per_menu_version
  on app.menu_version_dishes (menu_version_id) where house_favourite;
