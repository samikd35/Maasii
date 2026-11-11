# 13: Several phones share one Visit

**What to build:** When several guests at one table use their phones, each builds their own Draft, which stays private until sent. Everyone who chose that table sees every Order sent from any phone, with its status, and the shared Bill's running total of accepted dishes. Covers spec user stories 33, 34 and 35.

**Blocked by:** 11 (Guest sends an Order and the waiter accepts it live)

**Status:** ready-for-agent

- [x] Two or more phones that choose the same table during an open Visit all see that Visit's sent Orders and their statuses, live.
- [x] Each phone's Draft is visible only on that phone until sent.
- [x] The "Your table" sheet shows the running Bill total from Accepted Orders minus Dropped Dishes, updating live.
- [x] A phone that has not chosen this table, or chose a different table, cannot read this Visit.
- [x] Core tests cover visibility across devices and the running total. A Playwright test with two guest contexts and one waiter context checks that both guests see each other's accepted Orders.

The running total excludes lines with a `dropReason`. Ticket 12 adds the Waiter action that records it.
