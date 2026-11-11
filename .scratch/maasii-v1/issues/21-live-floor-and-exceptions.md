# 21: Live floor and exceptions

**What to build:** A manager's main screen during service. It shows exceptions first: Orders not accepted after 2 minutes, prepared Bills unconfirmed after 20 minutes, tables with no waiter, and Receipt Differences. Below them are all open tables. On a phone it is a list. On a tablet or laptop it becomes a room grid with a status word on every table. Covers spec user stories 82 and 83.

**Blocked by:** 19 (Forgotten confirmations), 20 (Manager corrections, unpaid closing and end of day)

**Status:** ready-for-agent

- [x] The Live floor lists exceptions at the top, each with table, what is wrong, how long it has been, and one action that opens the relevant table or flow.
- [x] Below the exceptions, every open table shows its waiter, status in words, Bill total and age of its oldest unaccepted Order.
- [x] On narrow screens the view is a list. On wide screens it is a room grid of table tiles, each with a status word next to any status colour.
- [x] The view updates live.
- [x] Owners can open the Live floor for any of their venues.
- [x] Core tests cover the exceptions query for each exception type. A Playwright test checks the list and grid layouts at phone and laptop widths.
