create table app.waiter_sign_ins (
  waiter_id uuid primary key references app.memberships(id) on delete cascade,
  phone text not null unique check (phone ~ '^[+][1-9][0-9]{7,14}$'),
  pin_verifier text not null,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  blocked_until timestamptz
);

alter table app.waiter_sign_ins enable row level security;
revoke all on app.waiter_sign_ins from public, anon, authenticated;
