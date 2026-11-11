-- The existing "owners update their brand" policy also covers these columns.
grant update (logo_url, colour, cover_url, display_font) on app.brands to authenticated;

-- Guests read artwork by URL. The core checks ownership and decodes the image before storing it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-artwork', 'brand-artwork', true, 4194304, array['image/webp']);
