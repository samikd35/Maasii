# 10: Sold Out and venue prices

**What to build:** A manager or owner can switch a dish to Sold Out at their venue, and back, with an immediate effect: the dish disappears from that venue's guest menu straight away, while other venues are unaffected. An owner can also set a venue price that differs from the brand price, again taking effect immediately without publishing. Covers spec user stories 10, 11, 84 and 111.

**Blocked by:** 07 (Staff sign-in, brands, venues and tables)

**Status:** ready-for-agent

- [ ] Each venue has a per-dish setting for Sold Out and an optional venue price.
- [ ] Managers (for their venue) and owners (for any venue of their brand) can toggle Sold Out from an inline switch in a dish list.
- [ ] Owners can set or clear a venue price for a dish.
- [ ] The guest menu hides Sold Out dishes and shows the venue price wherever one is set, immediately after the change.
- [ ] Changes are written to the audit log with who made them and when.
- [ ] Core tests cover the Sold Out effect at one venue but not another, venue prices, and permissions.
