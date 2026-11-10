# 04: Fasting days and the House favourite

**What to build:** Fasting dishes carry a clear fasting label. On fasting days, taken from a fasting calendar (Wednesdays and Fridays by default, plus dated fasting seasons and exceptions), the fasting section moves to the top of the guest menu. The owner can mark one dish as the House favourite, which appears as a single photo card at the top. Covers spec user stories 7, 8 and 9. The admin screen for editing the calendar comes in ticket 29. Here the calendar is seeded.

**Blocked by:** 01 (Guest sees Bilo's published menu)

**Status:** ready-for-agent

- [ ] Dishes have a fasting flag, shown as a labelled tag (with a word, not just a colour) on dish rows.
- [ ] A fasting calendar holds Wednesdays and Fridays by default, plus dated seasons and dated exceptions such as non-fasting periods. Seed data covers the current year.
- [ ] Core tests confirm whether a given date in Addis Ababa time is a fasting day, including season and exception cases.
- [ ] On a fasting day the guest menu shows a fasting section first, containing every fasting dish. On other days sections appear in their normal order.
- [ ] A dish marked House favourite appears as one photo card above the first section. With none marked, no card appears.
- [ ] A Playwright test with a controlled date checks the fasting section's position on a fasting day and a normal day.
