# 16: Quick-add and waiter corrections

**What to build:** A waiter can open any of their tables to see its Orders, Bill and actions in one place. From there, a quick-add screen with search, recently used dishes and Option Groups lets them enter spoken orders into the same Visit, so the Bill is always complete. Until the Bill is prepared, a waiter can also correct lines on Orders they accepted, with every change logged. Covers spec user stories 63, 64 and 65.

**Blocked by:** 11 (Guest sends an Order and the waiter accepts it live)

**Status:** ready-for-agent

- [ ] Tapping a table opens its detail: Orders with status and source (guest or waiter), the running Bill and available actions.
- [ ] Quick-add lets the waiter search dishes in either language, see recently used dishes first, choose options, quantity and note, and add the Order to the table's Visit. It creates the Visit if none is open.
- [ ] Waiter-entered Orders count as Accepted immediately and are recorded as entered by that waiter.
- [ ] A waiter can change the quantity of, or remove, a line on an Order they accepted, until the Bill is prepared. Each change asks for a short reason and is written to the audit log.
- [ ] A waiter cannot correct Orders accepted by someone else, or any Order once the Bill is prepared.
- [ ] Core tests cover quick-add, Visit creation, correction permissions and the audit entries.
