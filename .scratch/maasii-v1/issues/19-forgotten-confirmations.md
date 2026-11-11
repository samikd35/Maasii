# 19: Forgotten confirmations

**What to build:** Guests sometimes pay and nobody records it. A Bill prepared for 20 minutes without a Payment Confirmation appears as "Paid?" in the waiter's list and in the manager's exceptions. When a new party orders at a table whose Bill is still prepared, the Order is never blocked. It reaches the waiter as "New party at Table N?", with two choices. "Previous party paid" takes the receipt amount, closes the old Visit and starts a new one for the new Order. "Same party" reopens the Bill and adds the Order. Covers spec user stories 72 and 73.

**Blocked by:** 18 (Bill, payment and closing a Visit), 14 (Notifications and escalation)

**Status:** resolved

- [x] The every-minute job flags prepared Bills without a Payment Confirmation after 20 minutes. They appear as "Paid?" rows in the waiter's list and notify the waiter.
- [x] An Order from a phone that has not sent an Order in the current Visit, at a table whose Bill is prepared, is accepted by the core and shown to the waiter as "New party at Table N?".
- [x] "Previous party paid" asks for the method and the typed receipt amount, records the Payment Confirmation, closes the old Visit, and places the new Order in a new Visit.
- [x] "Same party" reopens the existing Bill and adds the Order to the existing Visit.
- [x] The "Paid?" flag disappears once the payment is confirmed or the Bill is reopened.
- [x] Core tests with controlled time cover the 20-minute flag and both answers to "New party at Table N?", including what each guest phone can see afterwards.
