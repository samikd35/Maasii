# 08: Progressive private feedback

Status: ready-for-human

Blocked by: 03

Parent: [01 — Complete product redesign](01-complete-product-redesign.md)

## What to build

Visit-first feedback with independently submitted optional tried-dish and Waiter sections.

## Acceptance

- [ ] Deliver the approved production behaviour, including English/Amharic and failure states.
- [x] Preserve the existing domain and authorization rules (covered by passing regression suites).
- [x] Verify the affected workflow through existing core/browser test seams.
- [x] Record visual verification and outstanding external checks in the coverage register.

## Implementation record — 2026-11-17

Implemented in the production application. Implementation dependencies are delivered locally. See [coverage](../coverage.md) for this ticket’s surfaces/states and [verification](../verification.md) for runnable evidence. Human release validation remains open; the checklist is not a claim of production release.

## Round 2 audit follow-up — 2026-11-17

Implemented the applicable non-placeholder findings, including structural editor and Waiter changes. [Traceability and verification](../audit-round-2/implementation.md). Human release gates remain open.
