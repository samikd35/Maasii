# 03: Let guests open Payment details without ordering

**What to build:** A directly addressable, branded Payment details page for a Venue, reachable from its current Menu, using the existing Owner-managed Payment Options.

**Blocked by:** None (can start immediately).

**Priority:** P1 — guest homepage destination.

**Status:** ready-for-agent

**Spec coverage:** User stories 4, 7–8, 10–12, 22.

- [x] A Guest can open Payment details without authentication, Table Choice, a Draft, an Order or a Bill. Browsing must not create an anonymous identity or Visit.
- [x] Expose only active public-facing details for the Venue resolved by its link: provider/method, recipient, payment code, QR image and display ordering. Do not expose inactive records, audit history, revision tokens or another Venue's configuration.
- [x] Enforce the narrow public projection at the core/database boundary; do not make the existing management query or entire table publicly readable.
- [x] Reuse payment presentation and copy feedback where appropriate. The payment code remains selectable when clipboard access is denied; QR images fit a narrow screen.
- [x] No configured options produces a clear ask-your-Waiter message, not an error or a fabricated payment destination. Invalid Venue Links follow existing not-found behavior.
- [x] Owner changes appear on the next read; inactive/removed options disappear. Managers, Waiters and Guests still cannot change payment destinations.
- [x] Link back to the existing Venue entry/Menu without resetting a Draft. Ticket 06 will add the complete Home/cross-destination navigation.
- [x] Preserve English/Amharic labels and existing Bill/payment confirmation behavior. Do not introduce payment collection, automatic confirmation or a guest account page.

**Verification:** Core tests for active-only projection and cross-Venue isolation; browser tests for no-session access, QR/copy success and failure, empty state and Owner-only writes. Confirm ordinary Bill payment still works.

## Comments

- Ticket implemented at the guest Payment details destination, available from the Menu and before any order. Payment writes and audit reads keep their existing permissions. Home and full navigation remain in ticket 06.
- Verified: nine core checks for Payment Options, Quick add and Reviews; 22 Chromium checks for payment, Orders and Menu; lint, type checking and production build. After consolidating the guest navigation client module, reran four focused browser checks successfully.
- The production Bilo's Menu made no payment prefetch requests. Measured 172,900 bytes English and 250,070 bytes Amharic before photos (response bodies, fonts included). Amharic is 70 bytes over the decimal 250 KB release target; confirm and make room for complete navigation during ticket 06.
