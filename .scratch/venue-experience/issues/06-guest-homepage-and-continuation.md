# 06: Open the Venue Link on a homepage and preserve guest progress

**What to build:** Switch the existing Venue Link to a branded homepage with four working destinations and seamless continuation of the guest's Draft, Orders and Bill.

**Blocked by:** 03 (Payment details), 04 (private Reviews), 05 (Brand social links).

**Priority:** P1 — guest homepage, within the first release.

**Status:** ready-for-agent

**Spec coverage:** User stories 1–9, 32; guest navigation and performance decisions.

- [ ] Existing NFC/QR Venue Links keep their address and now open the homepage. The global Maasii landing page remains separate. Move Menu browsing to a directly addressable destination without changing the order/review APIs.
- [ ] Display Menu, Reviews, Payment details and Social media as real links. Each page provides Home and navigation to the other destinations; empty payment/social and ineligible review states remain valid destinations.
- [ ] Preserve venue-scoped Draft storage keys, quantities, Option choices, notes, guest identity and language preference. Reloads with working storage and internal navigation must not lose or duplicate them.
- [ ] When storage is denied, internal navigation preserves the in-memory Draft; do not use a full reload or remount that drops it. Retain existing import/network recovery and storage-failure feedback.
- [ ] Show Continue your order for an unfinished Draft/current Orders and View your bill when a Bill exists. If both exist, keep both accessible. The shortcut opens the relevant existing view rather than merely navigating to the top of a long Menu.
- [ ] Navigation alone must not Send, choose/change a Table, start a Visit or create an anonymous session. A new browser with no state sees the four choices without unnecessary service initialization.
- [ ] Ordinary browser Back, direct destination links and switching between two Venues preserve correct scope. Invalid tokens remain not found; a Venue with no published Menu can still present its valid homepage/payment/social content.
- [ ] Public homepage, Menu and links are server-readable without JavaScript. Keep ordering and review interactions lazy; avoid eager prefetching all destination bundles and keep staff styles out of the guest initial load.
- [ ] Home and direct Menu each remain below 250 KB transferred before photos, including fonts, in English and Amharic. Measure actual initial requests, including automatic prefetching. Check keyboard/focus behavior and narrow-screen reflow in Chromium and focused WebKit.
- [ ] Update guest navigation-dependent tests and browsing-event expectations. The homepage is not itself a Dish-browsing event; language switching and previews still work.

**Verification:** Browser journeys for Draft → Payment details → Social media → Menu, Draft/Bill continuation, paid feedback access, denied storage, reload, two-Venue isolation, no-JavaScript browsing and network budget. No dependency on Venue Menu editing is required.
