# 12: Decline, partial acceptance and undo

**What to build:** When accepting, a waiter can expand an Order and mark individual dishes as sold out. Those become Dropped Dishes, the rest is accepted, and the dish disappears from the venue's menu immediately. A waiter can also decline a whole Order, for example when nobody is at the table. Any accept or decline can be undone within 5 seconds. The guest sees exactly what was dropped and why, or that their Order was declined. Covers spec user stories 28, 29, 58, 59, 60 and 61.

**Blocked by:** 11 (Guest sends an Order and the waiter accepts it live), 10 (Sold Out and venue prices)

**Status:** ready-for-agent

- [x] Expanding an Order lets the waiter mark individual lines "Sold out" before accepting. Accepting then records those lines as Dropped Dishes with the reason.
- [x] Marking a line sold out also switches the dish to Sold Out at that venue, using the same setting as ticket 10.
- [x] A waiter can decline a whole Order. A Declined Order never counts towards the Bill.
- [x] A Visit whose only Orders are all Declined ends automatically, so the table is free again.
- [x] Accept and decline show a 5-second undo, which returns the Order to Sent with no trace on the Bill.
- [x] The guest's slip shows the Dropped Dishes with their reason, or a clear "Declined" message asking them to speak to a waiter.
- [x] If two waiters act on the same Order at once, exactly one action wins and the other sees a clear message.
- [x] Core tests cover partial acceptance, the Sold Out side effect, declining, the auto-ending Visit, undo and the race.
