-- Social links are public Brand artwork/identity data. Existing Brand select
-- grants and the Owner-only update policy apply to the new column.
alter table app.brands add column social_links jsonb not null default '[]'::jsonb
  check (jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 8);
grant update (social_links) on app.brands to authenticated;
