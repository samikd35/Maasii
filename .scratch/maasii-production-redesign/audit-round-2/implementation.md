# Round 2 audit implementation — 2026-11-17

The findings in [the audit](analysis.md) have been addressed in the production application. Placeholder Menu content and artwork were left unchanged. Existing authorization, santim calculations, Order idempotence, media validation, publication and recovery mechanisms remain in use.

## Finding coverage

| Finding | Implemented result | Verification |
| --- | --- | --- |
| F01: detached errors | Photo/video controls own filename, progress, result, associated error and Retry. Errors scroll into view locally; save/publish errors receive focus in the reachable action area. | `menu-editor`; `production-redesign`: invalid upload, retained edit, retry and visible Save in Chromium/WebKit |
| F02: unfocused editor | Searchable priced dish list; opening one dish hides sibling workspaces. Return restores list focus and search. Preview category changes stay inside the editor and do not trigger its unsaved-leave guard. Names, price and media lead; descriptions, video, options and maintenance are disclosed. Languages stack on phones. Save/state/Preview remain reachable. | Brand/Venue editor, import/translation, archive/restore, recovery, desktop/mobile preview and publication suites |
| F03: misleading zero Bill | Pending Orders lead with sent/waiting status and submitted amount. Accepted running total and prepared Bill have separate labels. No first-Order zero Bill is shown. | Two-phone service journey, partial acceptance, drops, correction, prepared Bill and payment tests |
| F04: Choose naming | Visible Choose text participates in the full-row button's accessible name. Required choices use the same configuration flow. | Guest, Draft and modal keyboard tests use `Choose <dish>` |
| F05: navigation intent | Home dishes open the exact detail; Your table has its own active state. Category links and Home anchors share filtering and positioning. Native history updates integrate with Next's router, preserving language refresh and detail Back. | Home intent, category orientation, locale refresh and Back/focus/Draft browser tests |
| F06: Table confirmation | Selected Tables have a check and contrasting selected treatment. Initial action says Choose your table; final action names the destination Table. | Explicit selection, idempotent Send, interrupted acknowledgement and two-phone tests |
| F07: Menu density | Images span the name/price rows; price and Choose sit beside imagery at typical phone widths. Narrow and enlarged-text layouts allow the price row to span the card. | Typical sample row ≤152px at 390px; 320–1440px, landscape and enlarged-text tests |
| F08: Waiter workflow | Flat Table groups prioritize the oldest pending Order. Each Order retains its own acceptance and secondary decisions. Accepted history collapses; quiet Tables use a compact grid. A separate searchable Menu view replaces the queue's static Menu. | Orders, corrections, Quick-add, moves, prepared-Bill/new-party, PIN/enrollment and notification suites; local visual walkthrough |
| F09: Manager operations | Actual assigned-Waiter, uncovered-Table, waiting-Table and Receipt Difference counts drive the next action. Shared Venue navigation connects tools. Removal sits under the person's access controls with consequence confirmation. | Running-service readiness test, Shifts, floor, enrollment/removal, closing and authorization suites |
| F10: Owner guidance | Insufficient-evidence guidance distinguishes running service from missing Tables/Waiters/Shift. Existing sample counts remain available. Add Venue is secondary. | Configured-service guidance, insights and Owner setup tests |
| F11: action hierarchy | Shared quiet commands differ from primary/destructive controls; task navigation is consistent. Feedback Submit is primary and Skip quiet. Editor maintenance and access removal are contextual. | Cross-role browser journeys and final visual sweep |
| F12: control contrast | Control outlines use a separate `#74796d` token; decorative rules remain lighter. Existing keyboard focus and minimum touch sizing remain. | Computed contrast and management touch-target/layout checks |

## Evidence

Verified against this checkout's local Supabase stack and a production build:

- `pnpm typecheck`, `pnpm lint` and `git diff --check`: passed.
- `pnpm test`: 125 tests across 32 files passed.
- `pnpm test:e2e`: **120 passed**, Chromium and WebKit, final full run without retries.
- Initial transfer: Bilo Menu EN 175.6 KB / AM 249.6 KB; Home EN 153.6 KB / AM 226.2 KB. Saba Menu EN 162.8 KB / AM 211.3 KB. Initial serving imagery 12.4 KB; no initial video request.
- Control border contrast: 4.47:1 on white, 4.18:1 on the warm canvas.
- Local app restarted at `http://127.0.0.1:3111`; Bilo Home returned HTTP 200.


Final command logs and browser captures are stored in [implemented](implemented/). The automated suite includes six new Chromium/WebKit cases covering the audit-specific editor, navigation and operational readiness issues. Existing tests were updated to exercise the changed user paths, including separate Menu lookup and disclosed maintenance.

The production-build measurements retain the original limits: under 250 KB before photos, no initial video transfer, and under 350 KB of initial serving imagery. The Bilo Amharic Menu remains very close to its budget; do not add eager client dependencies without measuring again.

Screenshots include the focused editor with local upload failure, desktop editor, Table selection, submitted Order, pending/accepted Waiter queue and Venue setup. These use an isolated local audit tenant. They do not replace a real-phone or first-time-user study.

## Release status

Local implementation and automated verification are distinct from production release. No deployment or production-data change was performed. Existing real-phone foreground/background/locked-screen notification checks, fluent Amharic review, first-time guest/staff observation and post-deployment journeys remain release gates in [the verification record](../verification.md). Newly added Amharic strings require that same fluent review.

## Guidance applied

- UI/UX Pro Max informed hierarchy, progressive disclosure, focus, touch targets and feedback placement. No new UI framework was introduced.
- Modern Web Guidance `forms`: upload inputs associate errors with `aria-describedby`; global save failures move focus to an error summary. This follows “DO use aria-describedby to link inputs with help text or error messages.”
- Modern Web Guidance `form-factor-adaptation`: controls use minimum block sizes and narrow layouts reflow, with scroll clearance for reachable actions. This follows “Use min-block-size instead of a fixed height on anything that contains text.”
- The installed Next.js native History API documentation informed category URL updates; reusing Next's private history marker prevented router synchronization, so category replacement now uses the documented `replaceState(null, …)` form.
