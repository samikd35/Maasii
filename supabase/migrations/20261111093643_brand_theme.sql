alter table app.brands
  add column colour text not null default '#1C1917' check (colour ~ '^#[0-9A-F]{6}$'),
  add column cover_url text,
  add column display_font text not null default 'noto-sans-ethiopic'
    check (display_font in ('noto-sans-ethiopic', 'noto-serif-ethiopic'));

grant insert (colour, cover_url, display_font) on app.brands to authenticated;
