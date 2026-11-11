drop policy "anyone reads tables" on app.tables;

create policy "venue managers read tables" on app.tables
  for select to authenticated using (app.can_manage_venue (venue_id));
