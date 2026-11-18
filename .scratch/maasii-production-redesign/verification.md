# Production redesign verification — 2026-11-17

> Round 2: the [audit implementation record](audit-round-2/implementation.md) documents the production fixes, revised workflows and fresh verification. The original audit remains historical evidence; manual release gates remain open.

## Delivery status

The redesign is implemented in the actual Next.js application and Maasii core in this checkout. Tickets 02–16 have local implementations; ticket 17 has passing automated integration evidence. The parent remains open for release acceptance. Nothing has been deployed to production, and no production data has been reset or migrated.

The [coverage register](coverage.md) maps routes, shared surfaces, exceptional states and all twelve recommendations to delivery tickets and tests. The approved concept remains a design reference, not a source of production Menu data. Existing Brand identity, routes, Draft keys, authorization and money calculations remain in use.

## Required checks

Final checks ran against this checkout and its own local Supabase stack.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | Passed | [Typecheck log](audit-round-2/implemented/typecheck.log) |
| `pnpm lint` | Passed | [Lint log](audit-round-2/implemented/lint.log) |
| `pnpm test` | 32 files, 125 tests passed | [Core log](audit-round-2/implemented/core-tests.log) |
| `pnpm test:e2e` | 120 tests passed in the final round 2 run, no retries configured locally | [Browser log](audit-round-2/implemented/browser-tests.log) |
| `pnpm build` | Passed as the browser suite's configured production-server prerequisite | `playwright.config.ts`; passing browser run |
| `git diff --check` | Passed | Local working-tree check |
| `node scripts/cleanup-serving-media.mjs` | Dry run exited successfully; no eligible old unreferenced objects reported; nothing deleted | Local stack, default dry-run mode |

The browser suite uses a production build, not the development overlay. Chromium covers the existing full suite. WebKit additionally covers guest Home, Orders/service, Venue editing, redesign/media/recovery journeys and web reliability; this does not mean every test runs in both engines.

## Behaviour evidence

- Existing domain suites verify authorization, Order idempotence, Table/Visit and Bill rules, review eligibility/deduplication and Waiter session revocation.
- Media core tests cover authorized upload, tenant/scope isolation, poster-required publication, Venue inheritance/override/removal/restoration, malformed/truncated/oversized files and invalid duration, dimensions and audio tracks. Uploads use actual local Supabase Storage.
- Browser tests upload real photo and MP4 fixtures through the editor, reject an unsupported clip, Save and Publish separately, and verify that the guest sees the new thumbnail only after publication.
- Guest tests cover localized discovery, required choices, Draft editing, explicit Table confirmation, uncertain acknowledgement and retry, accepted/declined/dropped states, Bill/payment handoff and eligible feedback.
- The final stale-feed test reproduces an out-of-order response: an old successful read cannot clear a newer connection failure. Stale status clears only after a newer successful refresh.
- Editor tests cover internal navigation and browser Back, explicit tab recovery after reload, revision conflicts without discarding local edits, denied recovery storage and Save-and-leave. The shared guard also intercepts external form navigation such as sign-out.
- Playback tests cover no initial video request, reduced motion, session automatic-video preference, data-saving signals, manual play, preserving an explicit pause and an ordering interface that survives media failure. Real-device background, offscreen and autoplay behavior remain in the manual gate below.
- Staff suites cover independent Order actions, corrections, Quick add, moves, Bill prepare/reopen/payment confirmation, empty receipt entry, Shift/assignment setup and access removal.

## Visual and accessibility evidence

[36 retained screenshots](evidence/screenshots/README.md) cover Chromium and WebKit. Guest Menu widths are 320, 375, 390, 768 and 1440px, plus enlarged Amharic text. Management captures cover Owner, operations, Brand Menu/branding, Venue setup, floor, shifts, availability, Venue editor, payment settings, closing and insights at 320px.

The browser checks exercise landscape action reachability, long names and large prices, focus return and Back dismissal, native dialog behavior and denied browser storage. Selected real application screenshots were visually inspected during implementation. The screenshots and assertions do not constitute human review of every route/state, screen-reader certification or a fluent Amharic review.

Both configured sample Brand themes are retained. Ethiopic font optimization removed unused PostScript glyph names only. [Font integrity hashes](evidence/font-integrity.json) verify unchanged character mapping, glyph outlines, positioning, substitution and horizontal metrics against the original fonts.

## Performance measurements

Final production-browser measurements sum response body and response header sizes, include fonts and exclude image requests. KB here means 1024 bytes, matching the existing budget tests. No speculative route prefetch is permitted by these checks.

| Representative page | English | Amharic | Budget |
| --- | ---: | ---: | ---: |
| Bilo Home | 153.3 KB | 225.9 KB | Under 250 KB |
| Bilo Menu | 174.5 KB | 248.6 KB | Under 250 KB |
| Saba House Menu | 162.5 KB | 210.9 KB | Under 250 KB |

The uploaded-photo scenario transfers 12.4 KB of initial serving imagery and no video before detail/play, against the 350 KB image target. This fixture is not a guarantee for arbitrary legacy external photographs or every production Menu. Recheck representative production content before release; the Amharic Bilo Menu has little budget headroom.

MP4Box stays in the server-only core. A search of generated public browser chunks found no MP4Box/ISOFile parser code. Staff styles and editor components remain outside public browsing; service functionality remains lazily loaded.

## Migration, operations and rollback

`supabase/migrations/20261117093036_dish_serving_media.sql` was applied only to the local stack. It adds immutable scoped video asset records, an optional published dish reference and the video storage bucket. Existing published Menus require neither backfill nor republishing. Photos retain their existing URLs; new uploads get optional thumbnails. Historical Order/Bill snapshots are unchanged.

Apply the additive migration to the deployment environment before deploying the application. Use a coordinated replacement without percentage rollout or a second permanent UI. Roll back application code if needed while retaining the additive schema and all existing content, Visits and media references. Never reset production data as rollback.

The cleanup script defaults to a reference-aware dry run, retains saved-draft/revision/published references and ignores objects younger than seven days. Replacement/removal does not immediately delete assets. Review dry-run output before using `--delete`; an unsaved browser-only edit is not a durable media reference. See the README maintenance instructions.

## Release blockers — still open

- [ ] Human visual review of every coverage-register route and exceptional state against the approved direction.
- [ ] Screen-reader announcements, keyboard-only cross-role walkthroughs and actual software-keyboard/safe-area behavior on supported phones.
- [ ] Real-device video autoplay rejection, background/offscreen pause, explicit pause preservation and data-saving behavior across supported browsers.
- [ ] Recorded real-phone foreground, background and locked-screen notification delivery. Enrollment alone does not establish delivery.
- [ ] Fluent Amharic review of wording, layout and font rendering.
- [ ] First-time guest and working staff task observation, including Table Send, Waiter decisions and editor Save/Publish.
- [ ] Production migration/deployment and post-deployment guest-to-Waiter and Brand/Venue media-publication smoke tests.
- [ ] Production checks for Order failures/duplicates, stale recovery, media upload failures and transfer sizes, without sensitive payload logging.

These are explicit release blockers, not silently deferred acceptance criteria. No prototype interaction, passing automated test or local deployment substitutes for this evidence.

## Round 2 acceptance evidence

All twelve audit findings now have implemented corrections and regression/visual evidence in the [round 2 implementation record](audit-round-2/implementation.md). The latest full suite is 120/120 passing. The editor is a focused workspace and the Waiter queue has separate Menu lookup, with the original domain operations preserved. Placeholder content was not replaced. Manual release gates above are still open.
