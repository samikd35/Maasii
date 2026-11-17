# 05: Manage social links once per Brand and show them to guests

**What to build:** Owner editing of the Brand's named social links and a guest Social media destination that displays those links consistently at every Venue of that Brand.

**Blocked by:** None (can start immediately).

**Priority:** P1 — guest homepage destination.

**Status:** ready-for-agent

**Spec coverage:** User stories 7–8, 16–17, 22.

- [x] Add the smallest Brand-owned representation for a named, ordered list of social links. Existing Brands start with no links; do not fabricate profiles or create per-Venue copies.
- [x] Reuse Owner Brand management to add, edit, remove and order links. Only that Brand's Owner can mutate them; reject Manager, Waiter, Guest, other-Brand and read-only-support writes at both application and database boundaries.
- [x] Validate names and external HTTPS URLs server-side with bounded input. Reject executable schemes and embedded credentials; render names as text. Do not fetch previews or build an embed/feed service.
- [x] Guests can open a branded Social media page without a login, Order or Table Choice. Every Venue of the Brand reads the same configuration; another Brand's links never appear.
- [x] Empty configuration gives a helpful message. Link changes are reflected on the next guest read, including removals.
- [x] Provide a Menu/entry return link now; ticket 06 supplies shared Home/cross-destination navigation. Guest navigation must preserve the existing Draft.
- [x] Preserve Owner save failures without clearing the edit form and provide clear errors for invalid links. Keep labels and empty/error states in English and Amharic.

**Verification:** Public-core actor and Brand-isolation tests with two Venues sharing one Brand, plus an unrelated Brand; browser Owner-edit → both-Venues-display and invalid/empty state checks.

## Comments

Implemented Brand-owned links at `/v/[token]/social`, edited from Owner Branding. Social links and existing Brand theme core suite (7 passed), social links and existing Branding production Chromium browser flows (2 passed), lint and diff checks passed. The checks cover both Venues, another Brand, role refusals, invalid addresses, reordering, removal and retaining edits on a failed save.
