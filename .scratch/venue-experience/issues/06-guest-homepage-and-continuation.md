# 06: Open the Venue Link on a homepage and preserve guest progress

**What to build:** Switch the existing Venue Link to a branded homepage with four working destinations and seamless continuation of the guest's Draft, Orders and Bill.

**Blocked by:** 03 (Payment details), 04 (private Reviews), 05 (Brand social links).

**Priority:** P1 — guest homepage, within the first release.

**Status:** ready-for-agent

**Spec coverage:** User stories 1–9, 32; guest navigation and performance decisions.

- [x] Existing NFC/QR Venue Links keep their address and now open the homepage. The global Maasii landing page remains separate. Move Menu browsing to a directly addressable destination without changing the order/review APIs.
- [x] Display Menu, Reviews, Payment details and Social media as real links. Each page provides Home and navigation to the other destinations; empty payment/social and ineligible review states remain valid destinations.
- [x] Preserve venue-scoped Draft storage keys, quantities, Option choices, notes, guest identity and language preference. Reloads with working storage and internal navigation must not lose or duplicate them.
- [x] When storage is denied, internal navigation preserves the in-memory Draft; do not use a full reload or remount that drops it. Retain existing import/network recovery and storage-failure feedback.
- [x] Show Continue your order for an unfinished Draft/current Orders and View your bill when a Bill exists. If both exist, keep both accessible. The shortcut opens the relevant existing view rather than merely navigating to the top of a long Menu.
- [x] Navigation alone must not Send, choose/change a Table, start a Visit or create an anonymous session. A new browser with no state sees the four choices without unnecessary service initialization.
- [x] Ordinary browser Back, direct destination links and switching between two Venues preserve correct scope. Invalid tokens remain not found; a Venue with no published Menu can still present its valid homepage/payment/social content.
- [x] Public homepage, Menu and links are server-readable without JavaScript. Keep ordering and review interactions lazy; avoid eager prefetching all destination bundles and keep staff styles out of the guest initial load.
- [x] Home and direct Menu each remain below 250 KB transferred before photos, including fonts, in English and Amharic. Measure actual initial requests, including automatic prefetching. Check keyboard/focus behavior and narrow-screen reflow in Chromium and focused WebKit.
- [x] Update guest navigation-dependent tests and browsing-event expectations. The homepage is not itself a Dish-browsing event; language switching and previews still work.

**Verification:** Browser journeys for Draft → Payment details → Social media → Menu, Draft/Bill continuation, paid feedback access, denied storage, reload, two-Venue isolation, no-JavaScript browsing and network budget. No dependency on Venue Menu editing is required.

## Comments

- The existing Venue Link now opens four destinations; /menu is the direct Menu route. Old Order and review submission routes are unchanged. Continue your order opens the Draft or Orders, and View your bill opens and focuses the Bill.
- The same Venue keeps its Draft even when storage writes fail, and each Venue has its own in-memory state. The dish editor stays available after a signal loss. No destination is prefetched.
- Verified the production build, lint, type checking, 122 core tests and all 90 browser tests on this worktree, including Chromium and focused WebKit. The guest homepage measured 150.9 KiB English and 225.1 KiB Amharic; Bilo's direct Menu measured 173.0 KiB English and 248.6 KiB Amharic before photos, including headers and fonts.
