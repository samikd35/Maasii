create table app.payment_options (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references app.venues (id),
  kind text not null check (kind in ('bank_transfer', 'mobile_wallet', 'cash')),
  provider text,
  recipient_name text,
  account_or_merchant_code text,
  qr_image text,
  display_order integer not null check (display_order > 0),
  active boolean not null default true,
  revision uuid not null default gen_random_uuid(),
  check (
    kind = 'cash' or (
      nullif(btrim(provider), '') is not null
      and nullif(btrim(recipient_name), '') is not null
      and nullif(btrim(account_or_merchant_code), '') is not null
    )
  )
);

create index payment_options_venue_order on app.payment_options (venue_id, display_order, id);
alter table app.payment_options enable row level security;

create policy "venue managers read payment options" on app.payment_options
  for select to authenticated using (app.can_manage_venue (venue_id));

create policy "owners add payment options" on app.payment_options
  for insert to authenticated with check (
    app.is_brand_owner ((select brand_id from app.venues where id = venue_id))
  );

grant select on app.payment_options to authenticated;
grant insert (venue_id, kind, provider, recipient_name, account_or_merchant_code, qr_image, display_order)
  on app.payment_options to authenticated;

create policy "owners update their payment options" on app.payment_options
  for update to authenticated
  using (app.is_brand_owner ((select brand_id from app.venues where id = venue_id)))
  with check (app.is_brand_owner ((select brand_id from app.venues where id = venue_id)));

grant update (kind, provider, recipient_name, account_or_merchant_code, qr_image, display_order, active, revision)
  on app.payment_options to authenticated;

create policy "owners remove their payment options" on app.payment_options
  for delete to authenticated using (
    app.is_brand_owner ((select brand_id from app.venues where id = venue_id))
  );

grant delete on app.payment_options to authenticated;

-- Keep the history when an option is removed or its Owner's account is deleted.
create table app.payment_option_changes (
  id bigint generated always as identity primary key,
  venue_id uuid not null references app.venues (id),
  actor_user_id uuid,
  actor_name text,
  changed_at timestamptz not null,
  before jsonb,
  after jsonb,
  check (before is not null or after is not null)
);

create index payment_option_changes_venue_time on app.payment_option_changes (venue_id, changed_at desc, id desc);
alter table app.payment_option_changes enable row level security;

create policy "owners read their payment option changes" on app.payment_option_changes
  for select to authenticated using (
    app.is_brand_owner ((select brand_id from app.venues where id = venue_id))
  );
grant select on app.payment_option_changes to authenticated;

-- Runs after the row policies have authorized the change. Staff can only read the audit log.
create function app.record_payment_option_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed_venue_id uuid := coalesce(new.venue_id, old.venue_id);
  changed_by uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and old is not distinct from new then
    return null;
  end if;

  insert into app.payment_option_changes (venue_id, actor_user_id, actor_name, changed_at, before, after)
  values (
    changed_venue_id,
    changed_by,
    (select m.name from app.memberships m
     join app.venues v on v.brand_id = m.brand_id
     where v.id = changed_venue_id and m.user_id = changed_by and m.role = 'owner' and m.active),
    coalesce(nullif(current_setting('app.payment_option_changed_at', true), '')::timestamptz, statement_timestamp()),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );

  return null;
end
$$;

revoke execute on function app.record_payment_option_change () from public;
create trigger record_payment_option_change
  after insert or update or delete on app.payment_options
  for each row execute function app.record_payment_option_change ();
