# 15: Moving Orders and Visits

**What to build:** When a guest picks the wrong table, the waiter who receives the Order taps "Move order to table…" and picks the right number. The Order then joins the right table's Visit and waiter, and the guest's phone follows it. A guest can also change their own Table Choice until their first Order is accepted. When a whole party moves, a waiter can move their Visit, with Orders and Bill, to a free table. Covers spec user stories 25, 62 and 66.

**Blocked by:** 11 (Guest sends an Order and the waiter accepts it live)

**Status:** ready-for-agent

- [ ] A waiter can move a single Order to another table before that Visit's Bill is prepared. The Order joins the target table's open Visit, or creates one, and goes to that table's waiter.
- [ ] The guest device that sent the moved Order switches its Table Choice to the new table and sees the new Visit.
- [ ] A guest can change their Table Choice from the slip until their first Order is accepted, and not after.
- [ ] A waiter can move a whole Visit to a table with no open Visit. A move to an occupied table is refused with a clear message, because merging is not supported.
- [ ] Every move is kept in the Order's or Visit's history, with who moved it and when.
- [ ] Core tests cover single-Order moves, guest changes before and after acceptance, Visit moves and refused moves.
