-- The core sets this transaction-local scope after verifying the platform admin and Brand.
create function app.can_read_brand_support(p_brand_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_brand_id::text = current_setting('app.brand_support_id', true)
    and app.is_platform_admin()
$$;
revoke execute on function app.can_read_brand_support(uuid) from public;
grant execute on function app.can_read_brand_support(uuid) to authenticated;

create policy "platform admin support reads Brand staff" on app.memberships
  for select to authenticated using (
    app.can_read_brand_support(coalesce(brand_id, (select v.brand_id from app.venues v where v.id = venue_id)))
  );
create policy "platform admin support reads Brand tables" on app.tables
  for select to authenticated using (
    app.can_read_brand_support((select v.brand_id from app.venues v where v.id = venue_id))
  );
create policy "platform admin support reads Brand Payment Options" on app.payment_options
  for select to authenticated using (
    app.can_read_brand_support((select v.brand_id from app.venues v where v.id = venue_id))
  );

create table app.brand_support_openings (
  id bigint generated always as identity primary key,
  brand_id uuid not null references app.brands(id),
  admin_user_id uuid not null,
  opened_at timestamptz not null
);
create index brand_support_openings_brand_time on app.brand_support_openings (brand_id, opened_at desc, id desc);
alter table app.brand_support_openings enable row level security;
grant select, insert (brand_id, admin_user_id, opened_at) on app.brand_support_openings to authenticated;

create policy "platform admins record their support openings" on app.brand_support_openings
  for insert to authenticated with check (
    admin_user_id = (select auth.uid()) and app.can_read_brand_support(brand_id)
  );
create policy "platform admins read support openings" on app.brand_support_openings
  for select to authenticated using ((select app.is_platform_admin()));
