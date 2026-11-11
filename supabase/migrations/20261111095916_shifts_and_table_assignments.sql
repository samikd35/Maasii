-- Composite references keep Waiters and Tables in the same Venue.
alter table app.memberships add unique (venue_id, id);
alter table app.tables add unique (venue_id, id);

create table app.usual_tables (
  venue_id uuid not null,
  waiter_id uuid not null,
  table_id uuid not null,
  primary key (venue_id, waiter_id, table_id),
  foreign key (venue_id, waiter_id) references app.memberships (venue_id, id) on delete cascade,
  foreign key (venue_id, table_id) references app.tables (venue_id, id)
);
create index on app.usual_tables (venue_id, table_id);
alter table app.usual_tables enable row level security;

grant select, insert, delete on app.usual_tables to authenticated;
create policy "venue managers read Usual Tables" on app.usual_tables
  for select to authenticated using (app.can_manage_venue (venue_id));
create policy "venue managers save Usual Tables" on app.usual_tables
  for insert to authenticated with check (
    app.can_manage_venue (venue_id) and exists (
      select 1 from app.memberships m
      where m.id = usual_tables.waiter_id and m.role = 'waiter' and m.active
    )
  );
create policy "venue managers remove Usual Tables" on app.usual_tables
  for delete to authenticated using (app.can_manage_venue (venue_id));

create table app.shifts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references app.venues (id),
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at >= started_at),
  unique (venue_id, id)
);
create unique index shifts_one_running_per_venue on app.shifts (venue_id) where ended_at is null;
create index on app.shifts (venue_id, started_at desc);
alter table app.shifts enable row level security;

grant select, insert (venue_id, started_at), update (ended_at) on app.shifts to authenticated;
create policy "venue managers read Shifts" on app.shifts
  for select to authenticated using (app.can_manage_venue (venue_id));
create policy "venue managers start Shifts" on app.shifts
  for insert to authenticated with check (app.can_manage_venue (venue_id));
create policy "venue managers end Shifts" on app.shifts
  for update to authenticated
  using (ended_at is null and app.can_manage_venue (venue_id))
  with check (ended_at is not null and app.can_manage_venue (venue_id));

create table app.table_assignments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null,
  shift_id uuid not null,
  table_id uuid not null,
  waiter_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at >= started_at),
  foreign key (venue_id, shift_id) references app.shifts (venue_id, id),
  foreign key (venue_id, table_id) references app.tables (venue_id, id),
  foreign key (venue_id, waiter_id) references app.memberships (venue_id, id)
);
create unique index table_assignments_one_open_per_table on app.table_assignments (table_id) where ended_at is null;
create index on app.table_assignments (venue_id, shift_id);
create index on app.table_assignments (venue_id, table_id, started_at desc);
create index on app.table_assignments (venue_id, waiter_id);
alter table app.table_assignments enable row level security;

grant select, insert (venue_id, shift_id, table_id, waiter_id, started_at), update (ended_at)
  on app.table_assignments to authenticated;
create policy "venue managers read Table Assignments" on app.table_assignments
  for select to authenticated using (app.can_manage_venue (venue_id));
create policy "venue managers add Table Assignments" on app.table_assignments
  for insert to authenticated with check (
    app.can_manage_venue (venue_id) and exists (
      select 1 from app.memberships m
      where m.id = table_assignments.waiter_id and m.role = 'waiter' and m.active
    )
  );
create policy "venue managers close Table Assignments" on app.table_assignments
  for update to authenticated
  using (ended_at is null and app.can_manage_venue (venue_id))
  with check (ended_at is not null and app.can_manage_venue (venue_id));
