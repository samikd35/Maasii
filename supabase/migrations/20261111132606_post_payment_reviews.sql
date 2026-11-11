-- This per-Visit checklist prevents duplicate submissions without putting device identity in a Review.
alter table app.guest_table_choices add column reviewed_parts text[] not null default '{}';

create function app.reset_review_checklist() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.reviewed_parts := '{}';
  return new;
end
$$;
create trigger reset_review_checklist before update of visit_id on app.guest_table_choices
  for each row when (old.visit_id is distinct from new.visit_id) execute function app.reset_review_checklist();

create table app.reviews (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null,
  venue_id uuid not null,
  kind text not null check (kind in ('visit', 'dish', 'waiter')),
  dish_id uuid references app.dishes (id),
  waiter_id uuid,
  rating text not null,
  topics text[] not null default '{}',
  comment text check (char_length(comment) <= 500),
  language text not null check (language in ('am', 'en')),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (visit_id, venue_id) references app.visits (id, venue_id),
  foreign key (venue_id, waiter_id) references app.memberships (venue_id, id),
  check ((kind = 'dish') = (dish_id is not null) and (kind = 'waiter') = (waiter_id is not null)),
  check (
    kind = 'dish' and rating in ('yes', 'maybe', 'no') and topics <@ array['taste', 'portion', 'temperature', 'value']
    or kind = 'visit' and rating in ('great', 'okay', 'needs_work') and topics <@ array['food', 'service', 'wait_time', 'paying']
    or kind = 'waiter' and rating in ('great', 'okay', 'needs_work') and topics <@ array['service', 'wait_time']
  )
);
create index on app.reviews (venue_id, kind, created_at);
create index on app.reviews (waiter_id) where kind = 'waiter';
alter table app.reviews enable row level security;
grant select on app.reviews to authenticated;

create function app.can_read_waiter_ratings(p_venue uuid, p_waiter uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_manage_venue(p_venue) and (
    select count(*) >= 10 from app.reviews
    where kind = 'waiter' and venue_id = p_venue and waiter_id = p_waiter
  )
$$;
revoke execute on function app.can_read_waiter_ratings(uuid, uuid) from public;
grant execute on function app.can_read_waiter_ratings(uuid, uuid) to authenticated;
create policy "management reads its Venue's reviews" on app.reviews
  for select to authenticated using (
    app.can_manage_venue(venue_id) and (kind <> 'waiter' or app.can_read_waiter_ratings(venue_id, waiter_id))
  );

create function app.review_waiter(p_visit uuid) returns table (id uuid, name text)
language sql stable set search_path = '' as $$
  select accepted_by, min(accepted_by_name) from app.orders
  where visit_id = p_visit and state = 'accepted' and accepted_by is not null
  group by accepted_by order by count(*) desc, min(accepted_at), accepted_by limit 1
$$;
revoke execute on function app.review_waiter(uuid) from public;
grant execute on function app.review_waiter(uuid) to authenticated;

create function app.submit_guest_review(
  p_token text, p_visit uuid, p_kind text, p_dish uuid, p_rating text, p_topics text[], p_comment text, p_language text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v app.visits;
  rated_waiter uuid;
  part text;
begin
  if auth.jwt()->>'is_anonymous' is distinct from 'true' then return 'unavailable'; end if;
  select visit.* into v from app.visits visit
    join app.venues venue on venue.id = visit.venue_id
    join app.guest_table_choices g on g.visit_id = visit.id and g.venue_id = venue.id
    where visit.id = p_visit and venue.link_token = p_token and visit.closed_reason = 'paid'
      and g.guest_user_id = auth.uid();
  if not found then return 'unavailable'; end if;

  if p_kind = 'dish' then
    if not exists (select 1 from jsonb_array_elements(v.bill_lines) line where line->>'dishId' = p_dish::text) then
      return 'unavailable';
    end if;
    part := 'dish:' || p_dish;
  elsif p_kind = 'waiter' then
    select id into rated_waiter from app.review_waiter(v.id);
    if rated_waiter is null then return 'unavailable'; end if;
    part := 'waiter';
  elsif p_kind = 'visit' then
    part := 'visit';
  else
    return 'unavailable';
  end if;

  update app.guest_table_choices set reviewed_parts = array_append(reviewed_parts, part)
    where guest_user_id = auth.uid() and venue_id = v.venue_id and visit_id = v.id and not (part = any(reviewed_parts));
  if not found then return 'unavailable'; end if;

  insert into app.reviews (visit_id, venue_id, kind, dish_id, waiter_id, rating, topics, comment, language)
    values (v.id, v.venue_id, p_kind, p_dish, rated_waiter, p_rating, p_topics, p_comment, p_language);
  return 'saved';
end
$$;
revoke execute on function app.submit_guest_review(text, uuid, text, uuid, text, text[], text, text) from public;
grant execute on function app.submit_guest_review(text, uuid, text, uuid, text, text[], text, text) to authenticated;
