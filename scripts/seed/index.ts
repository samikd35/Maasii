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

const seed = {
  brand: {
    name: "Bilo's Pastry",
    logoUrl: "/brands/bilos/logo.webp",
    coverUrl: "/brands/bilos/almond-cake.webp",
    colour: "#EC6728",
    displayFont: "noto-sans-ethiopic",
  },
  ownerEmail: "owner@bilos.test",
  venue: "Lancha",
  tableCount: 16,
} as const;

async function main() {
  process.loadEnvFile(".env.local");

  if (await getPublishedMenu(publicActor, { venueLinkToken: LANCHA_LINK_TOKEN, language: "en" })) {
    console.log(`${seed.brand.name} is already seeded.`);
    return;
  }

  const brand = await createBrand(systemActor, seed.brand);
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: seed.ownerEmail,
    email_confirm: true,
  });
  if (error) throw error;
  await addBrandOwner(systemActor, { brandId: brand.id, userId: data.user.id });

  const venue = await createVenue(systemActor, { brandId: brand.id, name: seed.venue, linkToken: LANCHA_LINK_TOKEN });
  await addTables(systemActor, { venueId: venue.id, numbers: Array.from({ length: seed.tableCount }, (_, i) => i + 1) });
  const menu = await publishMenu(staffActor(data.user.id), { brandId: brand.id, menu: bilosMenu });

  const dishCount = menu.sections.reduce((n, s) => n + s.dishes.length, 0);
  console.log(`Seeded ${brand.name}: ${venue.name} with tables 1-${seed.tableCount}, Menu v${menu.number} with ${dishCount} dishes.`);
  console.log(`Guest Venue Link: http://localhost:${process.env.PORT ?? 3000}/v/${LANCHA_LINK_TOKEN}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
