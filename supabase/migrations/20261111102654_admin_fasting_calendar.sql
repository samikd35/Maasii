grant insert, update, delete on app.fasting_calendar_periods to authenticated;

create policy "platform admins add fasting periods" on app.fasting_calendar_periods
  for insert to authenticated with check ((select app.is_platform_admin ()));
create policy "platform admins edit fasting periods" on app.fasting_calendar_periods
  for update to authenticated
  using ((select app.is_platform_admin ())) with check ((select app.is_platform_admin ()));
create policy "platform admins remove fasting periods" on app.fasting_calendar_periods
  for delete to authenticated using ((select app.is_platform_admin ()));
