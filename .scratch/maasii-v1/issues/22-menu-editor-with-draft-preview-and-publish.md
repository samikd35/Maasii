# 22: Menu editor with draft, preview and publish

**What to build:** An owner edits the brand's Menu in a draft: sections and dishes with Amharic and English names and descriptions side by side, base price, fasting label and House favourite. They preview the exact guest view of the draft, labelled Draft, then publish it in one step to every venue. Guests never see the draft. Covers spec user stories 102, 103, 104, 107, 108 and 109.

**Blocked by:** 07 (Staff sign-in, brands, venues and tables), 05 (Dish details, Option Groups and the Draft)

**Status:** resolved

- [x] Owners can create, rename, reorder and remove sections, and create, edit and reorder dishes, in a draft that guests cannot see.
- [x] The dish form shows the Amharic and English name and description side by side, plus base price, fasting label and House favourite.
- [x] On wide screens the form and a live guest preview sit side by side. On phones there are Edit and Preview tabs. The preview is labelled Draft and uses the real guest layout and theme.
- [x] Preview sessions record no browsing events.
- [x] Publish turns the draft into a new immutable Menu version used by all venues of the brand. The editor shows when the last publish happened and whether there are unpublished changes.
- [x] A dish missing a translation is flagged before publishing, and the owner can still publish.
- [x] Core tests cover draft invisibility to guests, publishing, stable dish identifiers across versions, and Order line snapshots staying unchanged after a publish.
