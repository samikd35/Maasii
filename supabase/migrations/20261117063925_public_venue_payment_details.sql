-- Deliberately narrow public read. Keep the existing Payment Option table and audit RLS.
create function app.guest_payment_details(venue_link_token text)
returns table (
  kind text, provider text, recipient_name text, account_or_merchant_code text,
  qr_image text, display_order integer
)
language sql stable security definer set search_path = '' as $$
  select p.kind, p.provider, p.recipient_name, p.account_or_merchant_code, p.qr_image, p.display_order
  from app.venues v join app.payment_options p on p.venue_id = v.id
  where v.link_token = venue_link_token and p.active
  order by p.display_order, p.id;
$$;

revoke execute on function app.guest_payment_details(text) from public;
grant execute on function app.guest_payment_details(text) to anon, authenticated;
