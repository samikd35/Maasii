# 14: Notifications and escalation

**What to build:** Waiters can install Maasii to their home screen and get a web push notification and a sound when an Order arrives at one of their tables. A scheduled job runs every minute. Any Order nobody accepts within 2 minutes then reaches every waiter on the Shift, and Orders at unassigned tables go to everyone on the Shift immediately. Covers spec user stories 52, 55 and 56.

**Blocked by:** 11 (Guest sends an Order and the waiter accepts it live)

**Status:** resolved

- [x] The staff area is an installable progressive web app with a service worker.
- [x] A waiter can allow notifications. Their push subscription is stored for their device and removed when they are removed or sign out.
- [x] A new Order at a waiter's table sends a push notification. If the app is open, it plays a sound and highlights the row.
- [x] Orders at tables with no assigned waiter go to every waiter on the Shift.
- [x] A scheduled job runs every minute. Orders still Sent after 2 minutes then appear for and notify every waiter on the Shift, and are marked as escalated.
- [x] Tapping a notification opens that table's detail.
- [x] The scheduled job uses only features that also run on self-hosted Supabase.
- [x] Core tests with controlled time cover routing for unassigned tables, the 2-minute escalation, and that accepted Orders never escalate.
