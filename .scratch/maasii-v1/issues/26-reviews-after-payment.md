# 26: Reviews after payment

**What to build:** Once a Visit closes, each guest phone's slip asks "How was your visit?" (Great, Okay or Needs work), "Would you order it again?" (Yes, Maybe or No) for each dish the table ordered, and an optional Waiter Rating. Each answer can carry optional topic chips and a comment in the guest's own language, and everything can be skipped. The form says "Shared privately with [brand]" before submitting. Managers see Waiter Ratings only once a waiter has at least 10. Covers spec user stories 41-46 and 90.

**Blocked by:** 18 (Bill, payment and closing a Visit)

**Status:** ready-for-agent

- [x] After a Visit closes, each phone that took part sees the review section in its slip. Phones that never chose the table do not.
- [x] The Visit Review offers Great, Okay or Needs work, with optional chips (food overall, service, wait time, paying) and a comment.
- [x] A Dish Review is offered for each distinct dish accepted in the Visit, with Yes, Maybe or No, optional chips (taste, portion, temperature, value) and a comment.
- [x] An optional Waiter Rating is offered for the waiter who accepted most of the Visit's Orders.
- [x] Every part can be skipped or submitted on its own. "Shared privately with [brand]" appears above the submit button.
- [x] Reviews store the language they were written in and nothing that identifies the guest. One phone can submit each part once per Visit.
- [x] Managers and owners see each waiter's ratings only once that waiter has at least 10. Waiters never see ratings.
- [x] Core tests cover who can review, one submission per phone, and the 10-response rule. The full Playwright happy path runs from browsing through Send, Accept, Bill and payment to a submitted review.
