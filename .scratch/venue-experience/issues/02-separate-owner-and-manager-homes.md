# 02: Give Owners and Managers distinct operational entry points

**What to build:** Provide a Brand-oriented Owner home and Venue-oriented Manager home while retaining shared operational screens, Owner access to operations and the existing Waiter Quick add flow.

**Blocked by:** None (can start immediately).

**Priority:** P1 — staff clarity.

**Status:** ready-for-agent

**Spec coverage:** User stories 18–22, 33; role and ownership decisions.

- [ ] Owners default to their Brand/Venue overview with existing insights, Brand Menu, branding, payment administration and an explicit way into Venue operations.
- [ ] Manager-only accounts default to their assigned Venue(s), with Shifts, Tables/Table Assignments, Waiters and Venue Menu clearly accessible. The two homes are visibly and navigationally distinct, not the same generic page with a different title.
- [ ] Owners can operate all Venues they own without separate Manager memberships. People with multiple authorized roles/Brands/Venues can switch contexts without losing access or acquiring another role's privileges.
- [ ] Existing management bookmarks, sign-in/invitation completion and back links remain useful. Waiters retain their existing staff entry/PIN flow; platform admin and read-only support paths remain intact.
- [ ] New home addresses participate in staff language selection, session refresh, cookies/security headers and staff styling. Guest language preferences remain separate; default staff language remains Amharic.
- [ ] Managers cannot write Brand settings, another Venue's data or Payment Options by typing a URL or crafting a request. Do not change the shared permission helper into an unrestricted Manager grant.
- [ ] Verify Manager Shift start/reassignment/end and Waiter enrollment through the new navigation. Do not rebuild already-working operations.
- [ ] Verify Quick add is discoverable from an assigned Table during a running Shift, uses current prices/options, creates an accepted Order and updates its Bill. Preserve prepared-Bill restrictions and Order correction rules.
- [ ] Add browser coverage for Owner-only, Manager-only and mixed access, plus an unauthorized context. Keep keyboard, mobile layout and English/Amharic navigation usable.

**Verification:** Existing staff sign-in, Shifts and Quick add core/browser scenarios with the new entry paths. Venue-menu publishing rights arrive in tickets 07–09; do not expose incomplete controls in this ticket.

## Comments

- Implemented in `0fb5829`. Owners retain their Brand overview and can open Venue operations. Managers land in operations, with links for their assigned Venues only. Existing Venue links and management screens still work.
- Twenty targeted Chromium tests passed before integration, including staff sign-in, mixed-role access, the other-Venue denial, Shifts, and Quick add. See ticket 10 for the final combined run.
