# 08: Publish Venue-specific dish content and photos

**What to build:** Extend the local publishing flow to existing dishes' content so Managers can maintain their Venue's presentation without overwriting the Brand or other Venues.

**Blocked by:** 07 (Venue draft/publish and local override behavior).

**Priority:** P2 — Venue Menu expansion, still required for this release.

**Status:** ready-for-agent

**Spec coverage:** User stories 24, 27–33, 39.

- [ ] Extend the established Venue draft/preview/publish flow to bilingual names/descriptions, photos and the existing relevant dish fields/options. Reuse editor controls and validation; do not introduce a second set of pricing or Option Group rules.
- [ ] Apply overrides to changed fields only. Unchanged fields still inherit later Brand updates. Explicitly clearing an optional photo/description differs from removing its override; offer reset-to-inherit.
- [ ] Stable dish/Option Group/choice identities survive ordinary edits. Local Option Group edits override that collection rather than silently merging incompatible structures; reject invalid choices using the existing rules.
- [ ] Enforce effective Menu invariants, including required choices, valid bilingual names and at most one House favourite. Present conflicts for deliberate resolution rather than overriding a local choice automatically.
- [ ] Permit photo uploads only for an authorized target Venue, using existing file validation, processing and storage conventions. Do not weaken the Brand-only uploader or allow a Manager to replace another Venue's/Brand's assets.
- [ ] Saving/uploading/previewing remains nonpublic. Publish changes only the assigned Venue; the Owner retains access and other Venues/Brands remain unchanged.
- [ ] Brand updates do not erase local values. If an inherited Brand dish disappears, retain local overrides recoverably without exposing the absent dish as orderable; restoring the same identity reapplies eligible local overrides. Show the state clearly in the editor.
- [ ] Use the same resolved content and options for guest rendering, Draft validation, Send and Quick add; preserve historical Order/Bill/review snapshots.
- [ ] Retain revision conflict detection, save/upload failure recovery, language switching, keyboard access and native dialog behavior from existing editors.

**Verification:** Public-core inheritance/reset, identity, permission and effective-validation checks; browser Manager edit/photo → Preview → Publish → Guest and Quick add, with a second Venue unchanged. No video or Manager AI import work.
