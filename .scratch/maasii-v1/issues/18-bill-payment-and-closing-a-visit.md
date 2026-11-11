# 18: Bill, payment and closing a Visit

**What to build:** When a guest asks for the bill, the waiter taps Prepare bill, which locks it. Every phone at the table then sees the Bill (dish prices and one total, labelled "Not a tax receipt") followed by the venue's Payment Options with copy buttons and any QR image. The guest pays outside Maasii. The waiter taps Confirm payment, picks the method and types the amount from the Official Receipt into an empty box. Maasii records the Payment Confirmation and any Receipt Difference, and closes the Visit. The next scan at that table starts fresh. Covers spec user stories 36-40, 47, 68-71 and 91.

**Blocked by:** 13 (Several phones share one Visit), 17 (Owner manages Payment Options)

**Status:** resolved

- [x] Prepare bill locks the Bill. Every phone at the table switches to the Bill view: each accepted dish with its price, one total, and the label "Not a tax receipt".
- [x] Below the Bill, guests see the venue's active Payment Options in order: provider, recipient name, a copy button for the account number or merchant code, and the QR image if provided.
- [x] While the Bill is prepared, a phone that has already sent an Order in this Visit cannot send more, and sees a message to ask the waiter. Orders from other phones are handled in ticket 19.
- [x] The waiter or a manager can reopen a prepared Bill, which unlocks ordering for that Visit.
- [x] Confirm payment asks for the method (cash or one of the venue's Payment Options) and the amount from the Official Receipt, in a box that is never pre-filled.
- [x] After the amount is typed, the screen shows the Bill total and any Receipt Difference, and confirming is still allowed.
- [x] The Payment Confirmation stores the method, the typed amount, the Bill total at that moment, the difference, who confirmed it and when. Confirming twice is harmless.
- [x] Confirming closes the Visit. The guest phones keep access to that Visit's Bill, and anyone choosing that table afterwards starts a new Visit without seeing the previous one.
- [x] Core tests cover locking, the same-party block, reopening, confirmation with and without a difference, closing and visibility after closing. A Playwright test continues the ticket 11 flow through to payment confirmation.

Before ticket 19, a phone that has not sent to a prepared Visit gets an ask-the-waiter message. Ticket 19 replaces that refusal with the pending new-party Order flow.
