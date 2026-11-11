# 25: AI menu import and translation drafts

**What to build:** An owner can photograph a paper menu and get its sections, dishes and prices as editable entries in the draft Menu. They can also ask Maasii to draft the missing Amharic or English names and descriptions. Everything the AI produces lands in the draft for the owner to review. Nothing is ever published automatically, and only Menu content (never personal data) is sent to the external AI model. Covers spec user stories 112 and 113.

**Blocked by:** 23 (Photos, Option Groups and archiving in the editor)

**Status:** resolved

- [x] An owner can upload one or more photos of a paper menu. Maasii extracts sections, dish names, descriptions and prices into the draft, marked "Imported, please check".
- [x] Imported entries never overwrite existing dishes. The owner reviews and keeps or discards each one.
- [x] For any dish or section missing a language, the owner can request a translation draft, which fills the empty field marked "Suggested" until edited or accepted.
- [x] Requests to the AI model contain only Menu text and menu photos.
- [x] If the AI service fails or times out, the owner sees a clear message and the draft is unchanged.
- [x] The AI model sits behind one replaceable interface. Core tests use a fake model to cover the import and translation flows, including failures.
