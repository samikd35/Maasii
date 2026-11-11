# 20: Manager corrections, unpaid closing and end of day

**What to build:** Managers can remove any dish from a Bill or discount the whole Bill, always with a reason. They can close a Visit without payment as walked out, on the house or entered by mistake. They have an end-of-day closing list of every Visit still open, and a daily list of Payment Confirmations and Receipt Differences for reconciling with the cash register. When a Shift ends, open Visits pass to whoever takes those tables, labelled "Carried over from Sam". Covers spec user stories 74, 81, 85, 86, 87, 88 and 89.

**Blocked by:** 18 (Bill, payment and closing a Visit), 09 (Shifts, Usual Tables and Table Assignments)

**Status:** ready-for-agent

- [x] A manager or owner can remove any line or apply a whole-Bill discount at any time before the Visit closes. A reason is required, and the guest's Bill updates live.
- [x] Every Bill adjustment is written to the audit log with who, when and why. Managers can view a Visit's adjustment history.
- [x] A manager can close a Visit without payment by choosing walked out, on the house or entered by mistake. Waiters cannot.
- [x] The end-of-day list shows every Visit still open at the venue, with table, age, Bill total and waiter, and an action for each.
- [x] The daily payments view lists each Payment Confirmation with method, typed amount, Bill total and Receipt Difference, with the day's totals.
- [x] When a Shift ends with Visits open, they stay open and are marked carried over. Whoever is assigned the table next sees them labelled "Carried over from Sam".
- [x] Core tests cover adjustment permissions and audit entries, unpaid closing, the end-of-day list, daily totals and carry-over.
