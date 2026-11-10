# 01: Guest sees Bilo's published menu

**What to build:** A guest who opens Bilo's Venue Link on their phone sees Bilo's published Menu: a compact header with the logo, section chips that jump to each section, and dish rows with name, short description and an ETB price aligned to the right, in the Paper & Ink style. This first slice also lays the foundation every later ticket builds on. It covers the Next.js and TypeScript app, a local Supabase stack with migrations, the Maasii core module (commands and queries called as an explicit actor, with no business rules in screens), the scenario builder for core tests, and the Playwright setup. Covers spec user stories 1, 6, 13 and 15 (base accessibility).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The app and a local Supabase stack start with documented commands, and a fresh clone can reach a running guest menu by following the README.
- [ ] Migrations create the Brand, Venue, Table and Menu records this slice needs, including immutable published Menu versions, with dishes keeping a stable identifier across versions.
- [ ] Maasii core exposes "publish the Menu" and "get the published Menu for a Venue Link", each called as an explicit actor. Screens get data only through the core.
- [ ] A seed creates the Bilo's brand, one venue (Lancha) with tables 1-16, and a Menu built from Bilo's real dishes in sections such as Breakfast, Sandwiches & Wraps, Pastries, Cakes and Drinks. Prices are placeholders clearly marked as such. The Menu is published through the core, not inserted directly.
- [ ] Opening the Venue Link shows the logo header, section chips that jump to their section, and dish rows with name, description and a right-aligned ETB price.
- [ ] Publishing a new Menu version changes what guests see. An unknown Venue Link shows a friendly not-found page.
- [ ] The page is server-rendered with a warm paper background, ink text and touch targets of at least 44 by 44 pixels.
- [ ] The core test harness runs against the local Supabase stack, with a scenario builder that can create a brand, venue, tables and published Menu in a few lines. The first core tests pass.
- [ ] A Playwright test opens the Venue Link, sees the seeded dishes, and checks that the page weighs under about 150 KB before photos.
