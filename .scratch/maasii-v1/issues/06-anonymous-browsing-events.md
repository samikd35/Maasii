# 06: Anonymous browsing events

**What to build:** From the first pilot day, Maasii records anonymous browsing events: a menu being opened, and a dish's details being opened. Each event holds the Venue, the kind, the dish if any, the time, and a random identifier for that page load only, so events can never link a guest across visits. Nothing reads them in v1. They exist so "viewed but rarely ordered" can be analysed later. Covers spec user story 124.

**Blocked by:** 05 (Dish details, Option Groups and the Draft)

**Status:** resolved

- [x] Opening a Venue Link records one menu-opened event, and opening a dish sheet records one dish-opened event for that dish.
- [x] Events carry only Venue, kind, dish, time and a page-load identifier that is regenerated on every page load and never stored on the phone.
- [x] Recording an event never slows down or breaks the guest menu. A failure to record is silently dropped.
- [x] Event recording can be switched off for a page, so that owner preview (ticket 22) can turn it off.
- [x] Core tests confirm that events are stored with the expected fields and that no guest or device identifier is stored.
