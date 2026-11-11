# 02: Amharic and English everywhere

**What to build:** A guest can switch the menu between Amharic and English from the header, and the choice is remembered on their phone. All interface text goes through one translation setup that later staff screens reuse, and dish content (names, descriptions, section names) comes from bilingual Menu fields. Covers spec user stories 3 and 4.

**Blocked by:** 01 (Guest sees Bilo's published menu)

**Status:** resolved

- [x] The header shows an አማ/EN switch. Switching changes all interface text and all Menu content without losing the guest's place on the page.
- [x] The choice is remembered on the phone and applied on the next visit to any venue.
- [x] The guest menu's default language follows the phone's language when Amharic or English, and English otherwise.
- [x] Every user-facing string comes from translation messages, with no hard-coded text left in guest screens.
- [x] Menu sections and dishes store Amharic and English names and descriptions. A dish missing one language falls back to the other rather than showing a blank.
- [x] Ethiopic text renders in a readable Ethiopic font at body and heading sizes.
- [x] A Playwright test switches language and checks that the dish names and interface text change, and that the choice persists after a reload.
