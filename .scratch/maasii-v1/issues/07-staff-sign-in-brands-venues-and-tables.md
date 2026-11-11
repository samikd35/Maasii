# 07: Staff sign-in, brands, venues and tables

**What to build:** The platform admin creates a Brand and invites its Owner. The Owner signs in with email or phone and a password, creates Venues, manages each venue's Tables, invites a Manager per venue, and downloads each venue's Venue Link and its QR image. Managers sign in the same way and can manage their own venue's tables. Database-level visibility rules make sure no brand or venue can see another's data. Covers spec user stories 75, 92, 93, 96, 97, 98 and 121.

**Blocked by:** 01 (Guest sees Bilo's published menu)

**Status:** resolved

- [x] A platform admin role exists. The admin can create a brand and send its owner an invitation.
- [x] Owners and managers accept invitations and sign in with email or phone plus a password, through Supabase Auth.
- [x] Staff memberships link a person to a role: Owner for a brand, Manager for a venue. Owners can act as a manager at any venue of their brand.
- [x] An owner can create venues, and an owner or that venue's manager can add, renumber and deactivate tables.
- [x] An owner or manager can see and download the Venue Link and a QR image of it.
- [x] Row-level security and core checks prevent any staff member from reading or changing another brand's or venue's data. Core tests prove this for both reads and commands.
- [x] Every management screen built here is usable on a phone.
