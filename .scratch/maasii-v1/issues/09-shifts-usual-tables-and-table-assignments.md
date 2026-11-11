# 09: Shifts, Usual Tables and Table Assignments

**What to build:** A manager saves each waiter's Usual Tables. At the start of service they see a suggested assignment ("Sam 1-8, Hana 9-16"), adjust it if needed and start the Shift with one tap. Tables can move between waiters at any time, with the history kept, and the manager can end the Shift. Covers spec user stories 78, 79 and 80, and the Shift side of 81. Carrying over open Visits comes in ticket 20.

**Blocked by:** 08 (Waiters join with a QR code and PIN)

**Status:** ready-for-agent

- [x] A manager can set each waiter's Usual Tables.
- [x] Starting a Shift proposes a Table Assignment from Usual Tables, lets the manager change it, and starts the Shift with one tap. Only one Shift can run at a venue at a time.
- [x] A manager can move any table to another waiter during a Shift. Table Assignments are kept as history with time ranges, never overwritten.
- [x] Tables nobody is assigned to are listed clearly when the Shift starts.
- [x] A manager can end the Shift.
- [x] A core query answers "who is responsible for table N at time T", which later tickets use for routing and attribution.
- [x] Core tests cover starting, reassigning, history, the single-Shift rule and ending.
