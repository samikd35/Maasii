# 10: Verify the complete release and real-phone alerts

**What to build:** Execute and record the integrated acceptance journey and real-phone notification check for the completed release. This is a release gate, not a placeholder for tests omitted from earlier tickets.

**Blocked by:** 01 (alerts), 02 (staff homes), 06 (complete guest homepage), 09 (complete Venue Menu). Tickets 03–05 and 07–08 are covered transitively.

**Priority:** Release gate — required before declaring this release ready.

**Status:** ready-for-agent

**Spec coverage:** All user stories; especially 5–9, 20–22, 28–40.

- [x] Start with a Brand containing two Venues, an Owner, a Manager assigned to only one Venue, and a Waiter on a running Shift. Demonstrate separate staff homes and Owner operational access.
- [x] Publish a local dish/price/content change as Manager; show that the other Venue is unchanged and a later Brand update preserves local edits/removals while updating inherited fields.
- [x] In the mobile browser suite, use the existing Venue Link, visit all four destinations, preserve a Draft across pages/languages, Send, accept as Waiter, use Quick add, prepare/pay the Bill, return through the homepage and submit private feedback.
- [x] Verify Payment Options are active-only and Owner-editable; Brand social edits appear at both Venues; an unlinked phone cannot access the paid party's review form. Confirm no video controls or deferred review-claim flow were introduced.
- [x] Run lint, type checking, production build, core tests and browser tests with the documented local stack. Keep meaningful failed assertions visible; do not skip them to make the suite green.
- [x] Verify English/Amharic narrow-screen and keyboard flows, focused WebKit behavior, denied-storage navigation, error recovery, security headers and both homepage/direct-Menu initial transfer budgets below 250 KiB before photos.
- [ ] Execute ticket 01's actual delivery procedure on an installed, enrolled supported staff phone against the target HTTPS environment, including permission grant, foreground receipt, background receipt, locked-screen receipt and opening the correct Table through PIN unlock.
- [ ] Record device/browser, environment, configuration checks without secrets, observed routing/timing, test date, result and limitations. If the pilot includes iPhones, record their supported installed-app flow separately. Automated worker events are not proof of provider delivery.
- [x] If hardware/environment access is unavailable, record that check as pending and do not claim the release ready. Fix reproduced integration defects with focused regressions; do not begin deferred features.
- [x] Provide updated setup/navigation guidance and a concise release report showing automated results, remaining limitations and the next deferred work.

**Verification:** Combined production-build/browser/core evidence plus actual phone observations. This ticket does not authorize an unrequested public deployment, a database reset, or changes to production credentials.

## Comments

- **2026-11-17 — automated acceptance passed locally on `codex/venue-experience`.** A fresh branch-local database applied the migrations and seed. Lint, type checking, and the production build passed. Vitest: 122 passed across 31 files. Playwright: 91 passed (82 Android-sized Chromium, 9 focused WebKit).
- The [combined browser journey](../../../e2e/venue-experience.spec.ts) verifies that a Manager's local prices and new Dish are isolated to their Venue and flow through Guest Send, Quick add, the Bill, Payment Confirmation and private Reviews. The existing language, offline navigation, error recovery and authorization regressions also passed.
- Measured before photos, fonts included: Amharic homepage **225.4 KiB** and Menu **248.9 KiB**; English homepage **151.2 KiB** and Menu **173.3 KiB**. The original transfer cap and offline dish behavior were retained.
- **Release gate open.** No target HTTPS deployment and enrolled physical staff phone were available for this run. Automated tests exercise realtime, foreground chime, subscription setup and the worker click path, but do not prove provider delivery. Follow the [real-phone procedure](../../../README.md#check-delivery-on-a-real-staff-phone) and record background and locked-screen results before release.
- Deferred scope remains dish videos and paid reviews for unlinked phones after Waiter-only ordering.
