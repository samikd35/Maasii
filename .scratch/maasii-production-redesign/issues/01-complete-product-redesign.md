# 01: Implement the approved redesign throughout NFC

Status: needs-triage

Blocked by: None (scope and design direction approved)

## What to build

Implement the approved Maasii visual and interaction design in the actual NFC application across every role and workflow. Guests and staff should encounter a consistent, polished interface throughout the product, including pages and states absent from the twelve-screen prototype. Deliver the original twelve UX improvements and the previously deferred dish-photo/video experience as part of this effort.

This is the parent scope ticket for a separate production implementation effort. It is not a single-context implementation assignment. Break it into independently verifiable child tickets with explicit blocking edges before marking those tickets ready-for-agent.

## Design reference

Use the [approved concept and specification](../../maasii-redesign/spec.md) and [interactive prototype](../../maasii-redesign/prototype/index.html). The eight draft tickets accompanying the concept are planning references, not completed production work or the execution backlog for this new effort. Existing release tickets and historical decisions remain unchanged.

## Acceptance criteria

- [ ] Inventory every production page, role, reusable component, dialog, form, navigation destination, button, and loading/error/empty/success state; record its implementation and verification status.
- [ ] Apply the approved typography, colour, spacing, imagery, card, input, button and navigation system throughout that inventory, retaining meaningful distinctions between primary, secondary and destructive actions.
- [ ] Deliver every original audit recommendation, with an explicit child-ticket and verification mapping for each item below.
- [ ] Support real serving-photo and optional short-video upload, validation, storage, preview and publication; guest playback includes a photo fallback, muted inline playback, visible controls, and motion/data-saving handling.
- [ ] Preserve Brand/Venue permissions, Drafts, Order idempotence, Table/Visit rules, external payment handling, manual Official Receipt amount entry, and private-feedback eligibility.
- [ ] Verify complete guest, Waiter, Manager, Owner and support workflows, including authentication, setup and settings surfaces outside the prototype.
- [ ] Verify narrow mobile, landscape and desktop layouts, English/Amharic, keyboard access, enlarged text, focus, contrast, reduced motion, interrupted connectivity and failed media uploads.
- [ ] Run the required production checks and measure media performance; record real-device notification and usability results separately from browser automation.
- [ ] Every inventory item and recommendation is implemented and verified, or explicitly identified as an unresolved release blocker. Prototype-only behaviour does not count as completion.

## Original twelve recommendations

1. Keep prices and currencies intact and readable on narrow screens.
2. Give Home a clear primary task and useful continuation for returning guests.
3. Reduce Menu introduction overhead and improve search/category orientation.
4. Make dish selection and configuration visibly actionable.
5. Separate Table selection from the explicit Send action.
6. Explain availability without guest-facing Shift jargon; expose stale state and acknowledge uncertain sends truthfully.
7. Protect unsaved editor changes and distinguish unsaved, saved/unpublished and published states.
8. Prioritize routine dish editing and make Brand/Venue scope and inheritance clear.
9. Organize Waiter work around Table context, concise Orders and distinct service-readiness/empty states.
10. Separate live Manager operations from setup and confirm consequential Waiter removal.
11. Give Owner findings and empty states actionable guidance with evidence.
12. Make private feedback clear, progressive and appropriate for shared Bills without assuming which dishes each guest ate.

## Delivery approach

Create a dedicated implementation backlog under this effort. Each child ticket must deliver a complete, demonstrable user outcome and depend only on genuine prerequisites. Introduce shared UI changes safely, then migrate complete workflows while preserving working service behaviour. Include page coverage and the twelve-recommendation mapping in the final integration check.

## Implementation record — 2026-11-17

Production code, additive local migration, media storage, child tickets 02–17 and automated checks are delivered in this checkout. See [coverage](../coverage.md) and [verification](../verification.md). Release acceptance remains open for the explicitly listed external and manual gates; no production deployment is claimed.

## Follow-up design audit — 2026-11-17

[Round 2](../audit-round-2/analysis.md) records twelve concrete UI/UX findings, excluding placeholders as requested. Design acceptance remains open for those implementation gaps as well as external validation. Automated test success must not be treated as completed visual/workflow acceptance.

## Round 2 audit follow-up — 2026-11-17

Implemented the applicable non-placeholder findings, including structural editor and Waiter changes. [Traceability and verification](../audit-round-2/implementation.md). Human release gates remain open.
