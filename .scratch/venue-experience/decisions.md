# Venue experience: feedback decisions

Recorded 2026-11-17 through ask-matt → grill-with-docs.

This records the user's answers. All twelve interview questions are answered, and the user confirmed the consolidated scope on 2026-11-17 and requested a specification and prioritized implementation tickets. GLOSSARY.md reflects the agreed domain meanings; the current implementation does not yet implement all of them.

## Agreed first-release scope

- Include the guest homepage alongside clearer staff workflows and dependable notifications in the first priority. Videos are excluded from this release.
- Give Owners and Managers distinct everyday experiences. Owners keep operational access for stepping in; Managers prominently access shifts, Table Assignments, tables and Waiters.
- Managers get menu access only for their assigned Venue. They can add/remove Dishes and change names, descriptions, photos and prices through Save draft → Preview → Publish without Owner approval. Owners retain access. Changes must not silently change another Venue's menu.
- Venue Menus inherit unchanged information from the shared brand Menu. Local additions, edits, price overrides and removals survive later brand Menu updates. Removing a Dish removes it from that Venue's offering, not from historical Orders.
- Keep editing Payment Options, including bank accounts, wallet numbers and payment QR codes, Owner-only.
- The Venue Link opens a guest homepage with Menu, Reviews, Payment details and Social media destinations, with navigation home and between destinations.
- Reviews mean private feedback about a paid Visit, not public reviews or a Google Reviews link. Keep eligibility limited to guest phones already associated with a paid Visit. A new way to connect an unlinked guest phone after Waiter-only ordering is deferred; explain unavailable reviews rather than offering another party's Visit.
- Social links belong to the Brand and appear across its Venues, rather than being configured independently per Venue. The user's correction to Q12 changes the scope to Brand-wide; retain Owner editing as part of Brand management, without introducing new Manager rights over Brand data.
- Preserve a guest's Draft and Visit across navigation. On the homepage, offer Continue your order or View your bill when applicable.
- Waiter alerts must cover both an open staff page and background/locked-phone push delivery. Verify the existing implementation and deployment on actual staff phones; browser permission, device setup and connectivity affect delivery.
- Reuse and verify existing Waiter Quick add for assigned Tables rather than create a second ordering flow.

## Current implementation and model boundary

The current shared /manage screens contain Owner and Manager views; Managers already handle Shifts, Table Assignments, Waiters and sold-out Dishes. Master Menu editing/publishing and price changes are currently Owner-only. Foreground alerts and push delivery already exist, but deployed phone behavior has not been checked in this interview.

[ADR 0005](../../docs/adr/0005-brand-owns-the-menu-venue-owns-service.md) gives the Brand ownership of the master Menu and the Venue ownership of service, sold-out status and price differences. [ADR 0007](../../docs/adr/0007-managers-publish-venue-local-menu-changes.md) extends that boundary to local additions, edits and removals. Do not grant Managers write access to the shared master Menu as a shortcut.

## Deferred: Dish photos and videos

The user wants both photo and video support. When a video is uploaded, the intended experience is automatic playback rather than tap-to-play. Keep this out of the current implementation.

The user supplies real Dish photographs and generates videos externally, initially considering Gemini. The assistant will help prepare short prompts for approximately 2–5 second orbit/360-style Dish clips, then the product will support attaching the approved media to the Dish.

Fast loading is an explicit requirement. Before implementation, decide where autoplay happens (list, detail or both), the number of simultaneously active videos, media size/format and delivery, loading near the viewport, poster/photo fallback, and behavior when autoplay is blocked or reduced motion/data preferences apply. Do not promise immediate autoplay on every device or select a generation provider, encoding stack or delivery service yet. Preserve the real Dish's appearance and review generated unseen surfaces before publishing.

## Final interview answers

9. Yes: Managers may edit prices/content and explicitly publish their Venue Menu without Owner approval.
10. Yes: inherit unchanged brand Menu information while preserving Venue-specific additions, edits and removals.
11. Yes: defer review access for unlinked guest phones after Waiter-only ordering.
12. Correct the proposed scope: social media is managed Brand-wide because the profiles generally belong to the Brand, not each Venue.

## Proposed delivery order

1. Verify and repair existing foreground/background Order alerts and Waiter Quick add, including deployment/device configuration.
2. Separate Owner and Manager everyday navigation, retaining Owner operational access and Manager access boundaries.
3. Deliver Venue Menu drafting, preview and publishing with local changes surviving shared Menu updates.
4. Deliver the guest homepage, navigation, existing Draft/Visit continuation, standalone Payment details and private Reviews access, plus Brand-wide social link management and display.

All four are part of the first release; guest homepage work can proceed independently of Venue Menu editing where dependencies permit. Use existing public-core tests against real database permissions and browser tests for complete user flows; validate push delivery on actual staff phones separately.

The specification and ordered implementation tickets are in [spec.md](spec.md) and [README.md](README.md). The interview is complete at twelve questions; do not restart it during planning. The user explicitly authorized publishing these planning artifacts; application implementation is a subsequent step.
