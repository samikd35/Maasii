# 11: Guest sends an Order and the waiter accepts it live

**What to build:** The slice that proves ordering works end to end. A guest with a Draft taps Send, picks their table from a grid of the venue's table numbers, and sees "Sent". The Order appears live in the assigned waiter's "My tables" list, at the top with a running timer. The waiter taps Accept, and the guest's slip changes live to "Accepted by Sam". The first Order at a table opens a Visit. Retrying a failed send never creates a duplicate, and ordering is unavailable while no Shift is running. Covers spec user stories 14, 23, 24, 26, 27, 30, 31, 32, 53, 54, 57 and 67.

**Blocked by:** 05 (Dish details, Option Groups and the Draft), 09 (Shifts, Usual Tables and Table Assignments)

**Status:** resolved

- [x] At the first Send, the guest picks a table from a grid of the venue's active tables. The Table Choice is remembered on the phone until the Visit closes.
- [x] The guest device gets an anonymous Supabase session on first Send, used by row-level security to scope what it can read.
- [x] Sending creates an Order with a client-generated request identifier. Sending the same identifier again returns the original Order and never creates a second.
- [x] Order lines snapshot the dish names in both languages, the unit price (including any venue price), the chosen options and prices, the quantity and the note. Publishing a new Menu afterwards does not change them.
- [x] The first Order at a table with no open Visit creates one. Later Orders at that table join it.
- [x] While no Shift is running, Send is disabled with a clear message, and browsing still works.
- [x] The guest sees "Sent" once saved. If the send fails, the slip says "Not sent - tap to retry" and keeps the Draft.
- [x] The Order goes to the waiter assigned to that table. "My tables" shows new Orders first, oldest at the top, with a large table number, the dishes, a running timer and one Accept button.
- [x] Accept is one tap. The guest's slip shows "Accepted by Sam" live through Supabase Realtime, falling back to checking every 10 seconds if the live connection drops.
- [x] Waiters see only their own tables in "My tables".
- [x] Core tests cover the Visit opening, idempotent retries, snapshots, routing to the assigned waiter, the no-Shift block and guest visibility. A Playwright test across two browser contexts covers Send, then live Accept, then the guest seeing "Accepted", plus the offline retry without a duplicate.
