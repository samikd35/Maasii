# 23: Photos, Option Groups and archiving in the editor

**What to build:** In the menu editor, an owner can upload a dish photo, which is compressed automatically so the guest menu stays fast. They can build a dish's "choose one" and "add extras" Option Groups with an optional price change per choice. They can archive a dish without losing its history, so past Orders and reviews still make sense. Covers spec user stories 105, 106 and 110.

**Blocked by:** 22 (Menu editor with draft, preview and publish)

**Status:** ready-for-agent

- [x] Owners can upload, replace and remove a dish photo. Uploads are resized and compressed for the guest menu, and stored in Supabase Storage.
- [x] Owners can add, edit, reorder and remove Option Groups on a dish: choose the kind, whether a "choose one" group is required, and the choices with bilingual names and optional price changes.
- [x] All of these changes stay in the draft until published.
- [x] Archiving a dish removes it from the next published Menu, while past Orders, Dish Reviews and insights still show its name.
- [x] An archived dish can be restored into the draft.
- [x] Core tests cover Option Group validation, archiving and restoring, and that history survives archiving.
