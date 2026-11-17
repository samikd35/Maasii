# 04: Give eligible guests a dedicated private Reviews page

**What to build:** A directly addressable Reviews destination that reuses existing paid-Visit feedback, with clear states for guests who cannot review yet.

**Blocked by:** None (can start immediately).

**Priority:** P1 — guest homepage destination.

**Status:** ready-for-agent

**Spec coverage:** User stories 7–8, 13–15, 39.

- [x] Reach the page from the current guest Menu/service flow and provide a return link. Choose a page address that does not conflict with the existing review submission endpoint; preserve current submission clients.
- [x] Reuse the same eligible Visit, accepted Dish choices, optional Waiter Rating and submission rules as the existing feedback form. The label is Reviews; clearly state that feedback is private to the business.
- [x] Before payment, explain that feedback opens after payment. If the phone has no eligible associated Visit, explain that feedback is unavailable without revealing another party's Table, Bill or Visit.
- [x] Do not attach a phone to a paid Visit by selecting a Table, guess a Visit, create an identity just to browse, or add a special claim/review link. Review access after Waiter-only ordering for an unlinked phone is explicitly deferred.
- [x] Submitted parts remain submitted across this page, the existing review location and reloads. Preserve optional/skippable sections and per-phone/per-Visit duplicate protection.
- [x] Keep existing language recording, review privacy and staff visibility/Waiter Rating threshold. No public feed or third-party review redirect.
- [x] Handle request failure without discarding unsent feedback, and show successful submission clearly. Make the page usable in both languages with labeled controls and keyboard navigation.

**Verification:** Existing review public-core tests for unpaid/paid/outsider/duplicate behavior and browser coverage from payment to this destination, plus a direct unlinked-phone visit. Do not modify or close the earlier v1 review ticket.

## Comments

Implemented the Reviews page at `/v/[token]/feedback` alongside the existing review submission endpoint. Core paid-Visit review coverage and the production Chromium flow passed: no-session, unpaid and outsider states; navigation from paid Orders; error preserves rating/comment; retry, reload and existing review view remember the submission.
