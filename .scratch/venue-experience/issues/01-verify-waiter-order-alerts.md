# 01: Make existing Waiter Order alerts dependable

**What to build:** Verify and repair the existing path from a Guest's Send to the responsible Waiter's visible/chiming Order and device notification. Reuse the current worker, routing, delivery and escalation rather than rebuild them.

**Blocked by:** None (can start immediately).

**Priority:** P1 — service reliability.

**Status:** ready-for-agent

**Spec coverage:** User stories 34–38, 40; notification and service-readiness decisions.

- [ ] Trace and reproduce existing behavior before edits. Record a working baseline where no defect exists; passing existing behavior does not require replacement code.
- [ ] An assigned Waiter sees the incoming Order and gets the foreground chime after the required user interaction, without refreshing; realtime failure retains the existing polling fallback.
- [ ] Device setup explains missing configuration, denied permission, unsupported capability and save/subscription failure. Retry is possible where the browser permits it. Do not report successful delivery based only on permission.
- [ ] Keep the existing routing for assigned and unassigned Tables, escalation of still-Sent Orders at two minutes, retry of transient failures, and removal of expired subscriptions. Accepted Orders stop qualifying for escalation.
- [ ] Notification clicks open the correct Table and respect PIN lock; notifications do not grant access to another Venue or continue after device/session revocation.
- [ ] Keep the worker scoped to Waiter service; do not cache live Orders for offline use or control guest pages.
- [ ] Add only missing regression checks at the existing public-core and browser worker boundaries. Preserve English/Amharic notification behavior.
- [ ] Write a reproducible real-phone check for HTTPS, configuration, job delivery, enrollment, permissions, foreground/background/locked-screen receipt and notification click. Record the no-assigned-Waiters setup case and keep credentials out of evidence.
- [ ] Distinguish automated fixture results from actual provider/device delivery. Real-phone execution is required by ticket 10; an unavailable phone/environment is pending evidence, not a passing result.

**Verification:** Existing notification core and staff-notification browser scenarios plus focused regressions for reproduced failures. No unrelated Order/billing redesign.

## Implementation evidence

- Baseline: 7 notification core checks and the Chromium notification flow passed. A new browser assertion then reproduced the false “enabled” state after the browser lost its subscription while the server still showed a registration.
- Setup now checks server configuration and browser support/permission/subscription separately. The same regression verifies a dismissed or denied permission, retry, then a saved registration. “Setup completed” asks for a test Order and does not claim delivery.
- Verified after the change: all 7 notification core checks and the Chromium production-build notification flow passed. Routing, escalation, polling fallback, worker scope and PIN handling use the existing paths.
- Follow [Check delivery on a real staff phone](../../../README.md#check-delivery-on-a-real-staff-phone) for ticket 10. Real provider/device delivery: pending target HTTPS environment and supported staff phone.
