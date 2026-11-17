# 07: Let a Manager draft and publish a Venue price

**What to build:** The first complete Venue Menu publishing slice: an assigned Manager saves a local price Draft, previews it, publishes it and sees that price used by Guests and Waiter Quick add only at that Venue.

**Blocked by:** None (can start immediately).

**Priority:** P2 — Venue Menu expansion, still required for this release.

**Status:** ready-for-agent

**Spec coverage:** User stories 20, 22–23, 27–33, 39; ADR 0007 and Venue Menu publishing decisions.

- [ ] Introduce only the scoped draft/published-revision/override structures needed for this price slice. Brand Menu ownership remains unchanged; do not clone full menus or grant Managers Brand-wide editing.
- [ ] Preserve existing live Venue price overrides and Sold Out values in an additive migration. No production reset or sudden fallback to Brand prices. Replace the legacy immediate price-edit UI so Owner and Manager edits both follow the new publication semantics.
- [ ] An assigned Manager and the Brand's Owner can Save draft → Preview → Publish a price or reset it to inherit. Other actors/scopes cannot write, including crafted cross-Venue requests and writes against unrelated dish identities.
- [ ] Drafts and previews are private to authorized management; the public Menu and Quick add retain the old value until atomic publication. Attribute publication to the editor.
- [ ] Preserve integer-santim validation, including an explicit zero price. Distinguish a local zero from “inherit.” Resetting inheritance follows the current Brand price.
- [ ] A Brand price update changes an inheriting Venue but does not overwrite a local published price. Test two Venues under one Brand and an unrelated Brand.
- [ ] Detect stale draft revisions and a changed Brand base before publish. Explain the conflict and preserve the editor's work; do not silently replace a concurrent edit.
- [ ] Resolve the effective published price consistently in public Menu reads, Draft repricing, Guest Send and Waiter Quick add. Existing accepted Order snapshots, Bills and reviews retain historical values.
- [ ] Keep Sold Out as an immediate service control with its existing permissions. A price publication must not toggle availability or change Payment Options access.
- [ ] Add the small UI entry through existing Venue operations, compatible with ticket 02 when present. Labels, preview and validation work in both languages, with failure recovery preserving edits.

**Verification:** Core permission, migration-preservation, inheritance/reset, stale-write and snapshot tests; browser Manager publish → Guest/Waiter ordering plus another Venue unchanged. Update the superseded Owner-only price tests without removing negative scope coverage.

## Comments

- Implemented with 08–09 in `b2a8c00`. Existing price settings continue to apply until the first Venue publish carries them into the local revision. The old immediate price edit is no longer a staff screen action.
- Verified the Manager editor's save, preview and publish, including zero price, Brand updates, reset to inherit, stale edits and the second Venue's unchanged price. The publication core scenarios also check active Waiter pricing and historical snapshots.
