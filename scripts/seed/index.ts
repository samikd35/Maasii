// Seeds the local database through the Maasii core. Run with `pnpm db:seed`
// (or `pnpm db:reset`, which resets the database first).
import {
  addBrandOwner,
  addTables,
  createBrand,
  createVenue,
  getPublishedMenu,
  publicActor,
  publishMenu,
  staffActor,
  systemActor,
} from "@/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { bilosMenu, LANCHA_LINK_TOKEN } from "./bilos";
import { sabaMenu, SABA_LINK_TOKEN } from "./saba";

const seeds = [
  {
    brand: {
      name: "Bilo's Pastry",
      logoUrl: "/brands/bilos/logo.webp",
      coverUrl: "/brands/bilos/almond-cake.webp",
      colour: "#EC6728",
      displayFont: "noto-sans-ethiopic",
    },
    ownerEmail: "owner@bilos.test",
    venue: "Lancha",
    linkToken: LANCHA_LINK_TOKEN,
    tableCount: 16,
    menu: bilosMenu,
  },
  {
    brand: { name: "Saba House", colour: "#568F69", displayFont: "noto-serif-ethiopic" },
    ownerEmail: "owner@saba.test",
    venue: "Bole",
    linkToken: SABA_LINK_TOKEN,
    tableCount: 8,
    menu: sabaMenu,
  },
] as const;

async function main() {
  process.loadEnvFile(".env.local");

  for (const seed of seeds) {
    if (await getPublishedMenu(publicActor, { venueLinkToken: seed.linkToken, language: "en" })) {
      console.log(`${seed.brand.name} is already seeded.`);
      continue;
    }

    const brand = await createBrand(systemActor, seed.brand);
    const { data, error } = await createAdminClient().auth.admin.createUser({
      email: seed.ownerEmail,
      email_confirm: true,
    });
    if (error) throw error;
    await addBrandOwner(systemActor, { brandId: brand.id, userId: data.user.id });

    const venue = await createVenue(systemActor, { brandId: brand.id, name: seed.venue, linkToken: seed.linkToken });
    await addTables(systemActor, { venueId: venue.id, numbers: Array.from({ length: seed.tableCount }, (_, i) => i + 1) });
    const menu = await publishMenu(staffActor(data.user.id), { brandId: brand.id, menu: seed.menu });

    const dishCount = menu.sections.reduce((n, s) => n + s.dishes.length, 0);
    console.log(`Seeded ${brand.name}: ${venue.name} with tables 1-${seed.tableCount}, Menu v${menu.number} with ${dishCount} dishes.`);
    console.log(`Guest menu: http://localhost:${process.env.PORT ?? 3000}/v/${seed.linkToken}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
