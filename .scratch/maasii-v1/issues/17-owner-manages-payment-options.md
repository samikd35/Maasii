# 17: Owner manages Payment Options

**What to build:** For each venue, an owner sets up the Payment Options that venue accepts: kind (bank transfer, mobile wallet or cash), provider, recipient name, account number or merchant code, an optional QR image and a display order. Every change is logged, so a wrong or tampered account number can be traced. Guests see these in ticket 18. Covers spec user stories 100 and 101.

**Blocked by:** 07 (Staff sign-in, brands, venues and tables)

**Status:** ready-for-agent

- [ ] Owners can add, edit, reorder, deactivate and remove Payment Options for any venue of their brand.
- [ ] Each Payment Option has a kind, provider, recipient name, account number or merchant code, an optional QR image and a display order.
- [ ] Before saving a change to an account number or merchant code, the owner sees the old and new values side by side and confirms.
- [ ] Every change is written to a change log with who made it, when, and the before and after values. Owners can view this log.
- [ ] Managers can view their venue's Payment Options but not change them.
- [ ] Core tests cover permissions, ordering and the change log.
