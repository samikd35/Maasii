# 03: Brand theme with readable colours

**What to build:** Each Brand's branding settings (logo, one brand colour, a cover photo and a display font from a curated list) turn into the guest menu's theme. Maasii derives text and button shades from the brand colour so that they always reach at least 4.5:1 contrast, while the original colour stays available for decoration. Bilo's looks like Bilo's, and a second seeded brand looks clearly different with no code change. Covers spec user stories 2 and 95.

**Blocked by:** 01 (Guest sees Bilo's published menu)

**Status:** ready-for-agent

- [ ] Brands store branding settings: logo, brand colour, cover photo and display font chosen from a curated list that includes Ethiopic faces such as Noto Serif Ethiopic and Noto Sans Ethiopic.
- [ ] The core derives theme colours from the brand colour in a perceptual colour space. Text and button colours reach at least 4.5:1 contrast against their backgrounds.
- [ ] Bilo's orange #EC6728 produces an accessible text and button shade close to #B4461A, while the original orange is still used for decorative accents.
- [ ] A core test checks the contrast guarantee for a wide range of input colours, including very light, very dark and saturated ones.
- [ ] The guest menu uses the brand's logo, cover photo, display font and derived colours.
- [ ] A second seeded brand with a different colour and font renders with its own theme, with no code change.
