# Venue experience: guest navigation and venue operations

**Status:** ready-for-agent

**Scope confirmed:** 2026-11-17, following twelve interview questions. This is the specification for the next release, not a claim that its features are implemented.

## Problem Statement

Guests land directly in the Menu and cannot easily choose payment details, private feedback or the Brand's social profiles. Owners and Managers share a management interface that obscures their different responsibilities. Managers already run Shifts and Tables, but cannot independently maintain their Venue's dishes and prices. Waiter ordering and notifications exist, yet delivery on actual staff phones still needs verification.

The product must support a Brand with several Venues without letting one Manager change another Venue's offering, losing guest Drafts during navigation, or confusing payment details with a guest login.

## Solution

Keep one web app. Give guests a branded homepage with Menu, Reviews, Payment details and Social media, with a shortcut to their current Order or Bill. Give Owners a Brand overview and Managers a Venue operations home. Owners retain operational access and exclusive control of Payment Options and Brand settings.

Managers can save, preview and publish changes to their assigned Venue Menu without Owner approval. The Venue inherits unchanged Brand Menu information while retaining local edits, prices, additions and removals. Reuse the current ordering, billing, feedback and notification systems. Verify service alerts before release, including background delivery on a real supported phone.

## User Stories

1. As a Guest, I want the existing Venue Link to open a branded homepage, so that I can choose why I came.
2. As a Guest, I want four clear destinations, so that Menu, Reviews, Payment details and Social media are easy to find.
3. As a Guest, I want to navigate home or between destinations, so that I never need to edit the address bar.
4. As a Guest, I want to browse without signing in or choosing a Table, so that reading the Menu stays simple.
5. As a Guest, I want my Draft quantities, options and notes preserved across navigation, so that I do not repeat an order.
6. As a returning Guest, I want Continue your order or View your bill, so that I can resume my current task.
7. As a Guest, I want my language preference preserved, so that the whole visit works in Amharic or English.
8. As a Guest, I want readable pages on a small phone and usable keyboard controls, so that navigation is accessible.
9. As a Guest, I want fast initial pages, so that navigation does not require downloading every feature first.
10. As a Guest, I want current Payment Options before ordering, so that I can see how the Venue accepts payment.
11. As a Guest, I want to copy the recipient's payment code or view its QR image, so that I can pay through my own payment app.
12. As a Guest, I want a clear empty state when no Payment Options are configured, so that I know to ask a Waiter.
13. As an eligible Guest, I want to leave private feedback after payment, so that the business can improve.
14. As an ineligible Guest, I want to understand why feedback is unavailable, so that I do not accidentally review someone else's Visit.
15. As a Guest, I want completed review sections to stay completed across pages and reloads, so that I do not submit duplicates.
16. As a Guest, I want the Brand's official social links, so that I can follow the same business from any of its Venues.
17. As an Owner, I want to manage social links once for the Brand, so that every Venue displays the same profiles.
18. As an Owner, I want an overview of my Brands and Venues, so that I can supervise the business.
19. As a Manager, I want a distinct operations home for my assigned Venues, so that Shifts, Tables, Waiters and the Venue Menu are prominent.
20. As an Owner, I want to enter a Venue's operational screens, so that I can step in when needed.
21. As a person with several memberships, I want to switch among my authorized contexts, so that one role does not hide another.
22. As an Owner, I want payment destinations to remain Owner-only, so that menu delegation does not grant control of where money is sent.
23. As a Manager, I want to draft a local price change and preview it, so that I can check it before guests see it.
24. As a Manager, I want to edit local dish names, descriptions and photos, so that the Menu reflects what my Venue serves.
25. As a Manager, I want to add a dish at my Venue, so that local offerings do not appear at other Venues.
26. As a Manager, I want to remove and restore a local offering, so that I can maintain the Venue Menu without deleting order history.
27. As a Manager, I want to publish my Venue changes without Owner approval, so that daily menu work does not wait on someone else.
28. As a Manager, I want brand updates to preserve my local choices, so that my Venue's prices and removals are not silently overwritten.
29. As a Manager, I want to return an override to the Brand value, so that I can resume inheriting that information.
30. As an Owner, I want changes to inherited information to reach Venues, so that I do not maintain full copies of the Menu.
31. As an editor, I want a stale-edit warning that preserves my work, so that concurrent changes do not silently overwrite another person's changes.
32. As a Guest, I want unavailable or changed Draft items identified before Send, so that I order from the current published offering.
33. As a Waiter, I want Quick add to use the same Venue Menu as the guest, so that spoken Orders have the correct dishes and prices.
34. As a Waiter, I want to see and hear new Orders while using the app, so that I can acknowledge them promptly.
35. As a Waiter, I want a device notification while the app is in the background or the phone is locked, so that I can continue serving away from the screen.
36. As a Waiter, I want a notification to open its Table through the normal PIN check, so that it is useful without bypassing access controls.
37. As a Waiter, I want notification permission and setup failures explained, so that I can recover instead of assuming alerts work.
38. As a Manager, I want unassigned and unattended Orders to retain the existing routing and escalation, so that service does not depend on one missing Waiter.
39. As an Owner, I want historical Orders, Bills and reviews preserved after menu changes, so that past service remains understandable.
40. As the operator, I want real-phone delivery evidence alongside automated checks, so that a mocked push test is not mistaken for production readiness.

## Implementation Decisions

### Roles and ownership

| Capability | Owner | Assigned Manager | Waiter / Guest |
| --- | --- | --- | --- |
| Brand Menu, branding and social links | Manage | No Brand writes | Public published content only |
| Venue Menu drafts and publishing | Manage across owned Brand | Manage assigned Venue only | Published offering only |
| Shifts, Tables, Table Assignments and Waiters | Manage across owned Brand | Manage assigned Venue only | Existing service access |
| Payment Options | Edit | Existing read-only access | Existing service use / public active details |
| Insights and feedback | Existing authorized access | Existing authorized access | Own eligible reviews only; no staff ratings for Waiters |

- Separate Owner and Manager home screens and navigation; retain shared operational components and one authentication system. Do not duplicate the app or introduce a configurable permission framework.
- Use existing membership checks and database row-level security at every new boundary. Hiding a link is not authorization. Platform support remains read-only and platform admin access remains explicit.
- Preserve existing bookmarks, sign-in/invitation destinations and staff language behavior. Owners default to their overview; Manager-only accounts default to operations. Accounts with both roles can enter both authorized contexts; Owners can open operations for their owned Venues even without a separate Manager membership.
- Existing Waiter PIN, enrollment, Quick add, payment confirmation and official-receipt behavior remain in place. Verify Quick add through the UI instead of building another flow.

### Guest navigation and data access

- Keep the same Venue Link/NFC/QR address. It becomes the homepage; Menu browsing moves to a directly addressable child destination. The global Maasii landing page is not the Venue homepage.
- Use addressable destinations for Menu, private Reviews, Payment details and Social media. Preserve existing order and review submission endpoints; choose a distinct review-page address where necessary to avoid a page/endpoint collision.
- All destinations offer visible Home and cross-destination navigation. All four homepage choices remain available, including helpful empty/ineligible states rather than dead links.
- Payment details exposes only active public-facing Payment Option fields for the resolved Venue. It must not expose inactive accounts, revisions, audit history or another Venue's details. No guest identity or Order is required. Editing remains Owner-only; payment happens outside Maasii as in ADR 0002.
- Social links are a small named, ordered list on the Brand, edited by its Owner and shown at all its Venues. Validate external HTTPS URLs on the server; do not accept executable URL schemes or fetch remote previews. Missing links produce an empty state. No embedded feeds, per-Venue overrides or social-login integration.
- Reviews reuse existing paid-Visit eligibility and submission rules, including partial completion, per-phone deduplication and the Waiter Rating visibility threshold. Accessing the page never attaches an unlinked phone to a Visit or exposes table/visit details to an outsider. Payment/review navigation does not create a guest account just for browsing.
- Preserve guest Draft storage keys and guest identity across route changes. Continue your order opens the current Draft/service view; View your bill opens the existing Bill. A Draft plus an active Bill must not hide either state. Do not issue Send, change Table or create a Visit as a navigation side effect.
- Internal navigation must retain in-memory Drafts when browser storage is unavailable. Retain existing failures/retry feedback; do not force a reload that destroys the only copy. Full browser shutdown persistence cannot be promised when storage is denied.
- Server-render public content and keep interactive ordering/review code lazy. Do not eagerly prefetch every destination, load staff styles into guest pages, or download the Menu and order-service bundle just to display four choices. The homepage should not count as browsing a Dish in analytics.

### Venue Menu model and publishing

- Follow ADR 0007, which extends ADR 0005: keep the Brand Menu as the shared source, with a separately scoped Venue draft and immutable published local revision. Do not copy the entire Brand Menu per Venue or grant a Manager Brand write access.
- Store only local overrides, local additions and local removals with stable identities. The effective Venue Menu combines the current published Brand Menu and published local changes. A local override belongs to the Venue and cannot be supplied for another Venue or Brand.
- Unchanged fields inherit Brand updates. Explicit local values take precedence, including a zero price or an intentionally cleared optional description/photo; distinguish these from “inherit.” Returning a field to the Brand value is an explicit reset-to-inherit action.
- Keep local additions and removals through Brand republishes. Treat removal as archiving/hiding from that Venue, reversible with the same identity. Keep Sold Out as the separate existing immediate service control; returning availability must not accidentally undo an archived offering.
- For structural changes to inherited content, do not invent a merge: if the Brand removes a dish, its local overrides remain recoverable but the absent Brand dish is not orderable; restoring the same Brand identity restores its eligible overrides unless locally removed. Keep Venue-added dishes in a valid local section if the inherited section they used disappears. Reuse existing Option Group validation and stable identifiers; explicit local Option Group edits take precedence as a collection rather than an automatic deep merge.
- Save draft → Preview → Publish applies to both Owner and Manager Venue edits. Saving, uploading or previewing does not change the public Menu. Publish validates the effective offering and atomically changes the local published revision. No Owner approval queue is introduced.
- Match existing money, bilingual fallback, fasting, photo processing and Option Group rules. Permit at most one effective House favourite. If inherited and local changes conflict with that or another structural invariant, require an explicit valid resolution rather than silently overriding local choices.
- Identify stale Venue drafts and stale Brand bases at publication. Reject a stale write with a clear reload/review path and retain the editor's work. Attribute publishes to the acting staff member; reuse existing change-history patterns rather than build a new audit product.
- Apply one resolved published Venue Menu consistently to guest rendering, Draft repricing, server-side Send validation, Waiter Quick add and its recent-dish suggestions. Accepted Order snapshots, prepared Bills and historical feedback do not change when a Menu changes.
- New schemas, grants and policies arrive in additive migrations. Preserve existing Venue price overrides and Sold Out settings as effective live values during migration; do not require a production reset. Replace legacy immediate price-edit UI with the publishing flow so it cannot bypass draft semantics.
- Menu-related permission expansion does not expand payment, Brand settings, other-Venue or platform access. Venue photo upload authorization must be checked for the target Venue; do not simply weaken the existing Brand upload authorization.

### Notifications and service readiness

- Verify existing foreground realtime updates, polling fallback, visual indicators, user-gesture-enabled chime, subscription setup, push delivery, notification click navigation, retry and escalation before changing implementation. Fix reproduced defects only; keep working routing and delivery logic.
- Retain assigned-Waiter routing, current on-duty recipients for unassigned Tables, and escalation of still-Sent Orders at the existing two-minute threshold. An accepted Order must not keep escalating. No assigned Waiters means no eligible recipients; make this setup condition explicit in operational verification.
- Keep the worker scoped to staff service. Guest navigation and Owner/Manager homes must not acquire the Waiter worker or offline-cache live Orders.
- Document HTTPS, push credentials, job endpoint/wake delivery, permissions and installation prerequisites without recording secrets. Show truthful device states for unavailable, denied and failed setup; do not label notification permission alone as verified delivery.
- Record real foreground/background/locked-phone receipt and click behavior on a supported staff phone in the target environment. Android remains the documented staff target; record iPhone checks separately when iPhone is part of the pilot. Do not promise delivery while offline, permission-denied or otherwise blocked by the OS.

## Testing Decisions

- Use the existing two test boundaries: public Maasii core commands/queries against the real local database and row-level security, and browser journeys against a production build. No additional framework or parallel mock implementation is needed.
- Each test creates isolated Brands/Venues through the existing scenario builder. Include two Venues under one Brand and another unrelated Brand, not just a happy-path single Venue. Do not depend on mutable seeded prices.
- Core checks cover actor permissions, public payment/social projections, draft-versus-published visibility, local inheritance/reset/removal, stale revisions, migrations of existing settings, guest pricing versus server pricing, review eligibility and historical snapshots. Test behavior rather than table layout or helper signatures.
- Reuse prior notification, Quick add, Venue Menu, menu publishing, dish photo, bilingual menu, payment, review and tenant-isolation scenarios. Update tests whose Owner-only price assumption is intentionally replaced; retain negative tests for forbidden scopes.
- Browser checks cover Manager publish → Guest order → Waiter acceptance/Quick add → Bill/payment → private feedback, plus independent payment/social browsing, homepage continuation, Owner operational access and unauthorized direct navigation/mutations.
- Preserve English and Amharic coverage, guest versus staff language preferences, keyboard operation, meaningful labels, focus behavior, narrow-screen reflow, loading/error states and existing security headers. Use Chromium and the existing focused WebKit suite for navigation/storage/focus regressions.
- Verify ordinary reload and language switches keep persisted Drafts; separately deny storage and ensure internal navigation keeps the in-memory Draft. Abort save/upload/navigation data requests where needed to test preservation of user work.
- Keep both guest homepage and direct Menu initial loads under the existing 250 KB transferred-before-photos budget, fonts included, in both languages. Inspect actual requests so eager destination prefetching does not hide outside the measurement. The existing largest guest load has very little headroom.
- Browser push fixtures validate application behavior only. Real-device delivery is a distinct release check with device/browser/environment, setup, observations and result recorded; never substitute mocked results or mark an unavailable hardware check passed.
- Run targeted checks per ticket. At release, run lint, type checking, production build, core suite and browser suite. The first-release gate requires the integrated journey and real-phone notification evidence; retain honest pending status for unavailable deployment/device work.

## Out of Scope

- Dish video generation, prompts, uploads, encoding/delivery infrastructure and autoplay implementation. Preserve the future requirement: support photos and videos; uploaded videos autoplay with fast loading. Location of autoplay, media limits, accessibility and fallback behavior are decisions for that later work.
- Connecting an unlinked guest phone to a paid Visit after Waiter-only ordering, including claim codes or special review links.
- Public review feeds, Google Reviews integration and exposing private reviews publicly.
- Payment processing/gateways, automatic bank confirmation, or Manager editing of payment destinations.
- Per-Venue social profiles, social feeds, social login, a new staff authentication system, native apps or a general permissions framework.
- Expanding AI menu import/translation to Manager workflows; existing Owner tools remain functional. The local editor reuses ordinary menu fields and validation.
- Unrelated changes to insights, tax receipts, Order acceptance, waiter-rating thresholds or existing v1 tickets.

## Further Notes

- Priority 1 includes reliable service, clear staff roles and the complete guest homepage. Venue-menu expansion is the next build lane, still part of this release. Do not hold homepage work behind the larger menu model change.
- Small vertical slices introduce only what they exercise: local price publication first, then content edits, then local dishes/removals. Each includes its data/authorization changes, UI, guest-visible outcome and tests.
- Product decisions above were confirmed by the user. Structural merge behavior, destination addressing and slice boundaries are concrete implementation defaults chosen to make those decisions buildable, not additional interview answers.
- Planning does not start deployment or claim real-phone verification. Existing uncommitted audit fixes and unrelated issue edits must remain intact.
