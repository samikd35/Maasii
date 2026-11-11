# 28: Weekly Finding and the owner's home screen

**What to build:** Each week the owner sees one Weekly Finding, chosen by ordered rules with minimum sample sizes, with links to the Orders and reviews behind it. The owner's home screen shows the Live floor during the venue's service hours and the Weekly Finding outside them. Covers spec user stories 114 and 119.

**Blocked by:** 27 (Service Periods and dish insights), 21 (Live floor and exceptions)

**Status:** resolved

- [x] Rule 1: a dish with at least 5 Dish Reviews in the week where one topic chip appears in at least 25% of them. For example: "Croissant: 5 of 16 reviews said temperature".
- [x] Rule 2: the largest week-over-week drop in accepted quantity for a dish within a Service Period, from a base of at least 10.
- [x] Rule 3: a rise in the share of "Needs work" Visit Reviews, from at least 10 reviews.
- [x] The first qualifying rule, in order, becomes the Weekly Finding. When none qualifies, the finding says there isn't enough data yet and shows the counts.
- [x] Every finding links to a filtered view of the Orders or reviews it is based on.
- [x] The thresholds are configuration values, not hard-coded in the rules.
- [x] The owner's home screen shows the Live floor while any of their venues is within service hours, and the Weekly Finding otherwise.
- [x] Core tests cover each rule, the order of rules, the thresholds and the "not enough data" case.
