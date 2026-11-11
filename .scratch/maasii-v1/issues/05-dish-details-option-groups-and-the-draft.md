# 05: Dish details, Option Groups and the Draft

**What to build:** A guest taps a dish to open a bottom sheet with its photo, description, fasting label and Option Groups. They choose from any required "choose one" group, pick extras that may change the price, add a note, set a quantity and tap "Add to order". The dish joins their Draft, shown in the docked slip at the bottom with the number of dishes and the running total. The Draft can be edited, and it survives a reload or lost signal. Sending comes in ticket 11. Covers spec user stories 12 and 16-22.

**Blocked by:** 01 (Guest sees Bilo's published menu)

**Status:** ready-for-agent

- [x] Published dishes can carry Option Groups of two kinds: "choose one", which may be required, and "add extras", with an optional price change per choice. The seed adds realistic Bilo's examples such as bagel type and omelette extras.
- [x] Tapping a dish opens a bottom sheet with photo (if any), description, fasting label, Option Groups, a note field, quantity and "Add to order".
- [x] "Add to order" is disabled until every required "choose one" group has a choice, and the sheet says what is missing.
- [x] The price in the sheet updates as extras are chosen, and the core calculates the line price from the published Menu.
- [x] The docked slip shows the number of dishes and the Draft total. Opening it lets the guest change quantities, edit choices and notes, and remove dishes.
- [x] The Draft is kept in the phone's local storage and survives a reload and going offline.
- [x] A Draft that refers to a dish or choice no longer in the published Menu tells the guest which line needs attention, rather than silently changing it.
- [x] Core tests cover the line price calculation. A Playwright test adds a dish with options, reloads, and finds the Draft intact.
