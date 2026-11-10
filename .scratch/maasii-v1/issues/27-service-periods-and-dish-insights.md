# 27: Service Periods and dish insights

**What to build:** An owner defines each venue's Service Periods (such as breakfast 07:00-11:00, lunch 11:00-15:00, evening 15:00-22:00) and service hours. They then see, for each dish, the quantity accepted per Service Period, the "would order again" share and the most common topic chips, compared with the same Service Periods last week. Every percentage shows its number of responses, and Visit Reviews are shown with the comments behind them. Covers spec user stories 99, 115, 116, 117, 118 and 120.

**Blocked by:** 26 (Reviews after payment)

**Status:** ready-for-agent

- [ ] Owners can set each venue's service hours and named Service Periods in Addis Ababa time. Periods cannot overlap.
- [ ] For a chosen venue and week, each dish shows its accepted quantity per Service Period (Accepted Orders minus Dropped Dishes and removed lines), and the same figures for the previous week.
- [ ] Each dish shows the share of Yes, Maybe and No Dish Reviews and its most common topic chips, always next to the number of responses.
- [ ] Visit Reviews are shown as a distribution with their comments, filterable by rating.
- [ ] All figures are computed in the database or application code.
- [ ] Core tests cover Service Period bucketing (including boundaries and Addis Ababa time), quantity calculation, review shares, and the week-over-week comparison.
