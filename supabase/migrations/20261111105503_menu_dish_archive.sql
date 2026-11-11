-- Keep the published archive under the same owner-only policy as the Menu draft.
alter table app.brand_menu_drafts
  alter column revision drop not null,
  alter column content drop not null,
  drop constraint brand_menu_drafts_content_check,
  add constraint brand_menu_drafts_content_check check (content is null or jsonb_typeof(content->'sections') is not distinct from 'array'),
  add column published_archive jsonb not null default '[]' check (jsonb_typeof(published_archive) = 'array'),
  add constraint draft_revision_and_content_agree check ((revision is null) = (content is null));
