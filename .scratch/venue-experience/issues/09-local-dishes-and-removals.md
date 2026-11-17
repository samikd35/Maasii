# 09: Add, remove and restore dishes only at one Venue

**What to build:** Complete Manager menu maintenance with Venue-only dishes and reversible local removals, preserving shared Brand updates and historical service records.

**Blocked by:** 08 (complete local dish fields, photos, identities and publishing).

**Priority:** P2 — Venue Menu expansion, still required for this release.

**Status:** ready-for-agent

**Spec coverage:** User stories 25–33, 39.

- [ ] A Manager adds a complete local Dish with existing bilingual fields, price, photo and Option Groups in the Venue draft, previews it, and publishes it without Owner approval.
- [ ] Give local sections/dishes/options stable Venue-scoped identities. Local dishes appear only at the target Venue and can be ordered by Guests and Waiter Quick add; they never enter another Venue's recent-dish suggestions or the shared Brand Menu.
- [ ] Permit grouping local dishes in inherited or local sections without modifying Brand structure. If an inherited section disappears, keep local dishes in a valid visible local grouping rather than dropping or duplicating them.
- [ ] Removing a shared or local dish archives it from that Venue's offering after publish; it does not delete the Brand Dish, accepted Orders, Bills, reviews or their historical snapshots. Restore with the same identity.
- [ ] A subsequent Brand publish does not resurrect a locally removed dish or erase a local addition. Sold Out remains distinct; clearing Sold Out alone cannot restore an archived dish.
- [ ] Guest Drafts containing removed/unavailable dishes or choices show the existing actionable problem and cannot Send stale invalid lines. Waiter Quick add uses the same effective offering and prices.
- [ ] Protect all add/remove/restore operations through core permission checks and row-level security. Another Venue's Manager, an unrelated Owner, Guests and Waiters cannot publish local changes.
- [ ] Preserve drafts across save/publish failure and stale revisions. Keep language fallback, required options, effective House favourite rules and existing menu rendering/performance checks.
- [ ] Verify historical insight/review lookup still resolves stable identities for local dishes without rewriting past labels/prices. Do not build new analytics features.

**Verification:** Two-Venue/second-Brand core scenarios for local additions, inheritance, archive/restore, changed Drafts and snapshots; browser local-dish publish → Guest/Quick add Order → Bill → archive → historical record intact.

## Comments

- Venue additions get stable dish and choice identities; archiving changes only the local offering. Sold Out can be toggled independently. Local dishes can appear in browsing records, Guest and Waiter Orders and paid Reviews.
- Verified the Manager's local add, photo, archive and restore in Chromium with another Venue unaffected. Core checks exercise browsing, local options in Quick add, preserved Order snapshots and local changes surviving Brand publication.
