// Seeds the local database through the Maasii core: Bilo's Pastry, its Lancha venue with
// tables 1-16, an Owner, and Bilo's Menu published by that Owner. Run with `pnpm db:seed`
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
const OWNER_EMAIL = "owner@bilos.test";

async function main() {
  process.loadEnvFile(".env.local");

  if (await getPublishedMenu(publicActor, { venueLinkToken: LANCHA_LINK_TOKEN })) {
    console.log("Already seeded. Run `pnpm db:reset` to start again from an empty database.");
    return;
  }

  const brand = await createBrand(systemActor, { name: "Bilo's Pastry", logoUrl: "/brands/bilos/logo.webp" });
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: OWNER_EMAIL,
    email_confirm: true,
  });
  if (error) throw error;
  await addBrandOwner(systemActor, { brandId: brand.id, userId: data.user.id });

  const lancha = await createVenue(systemActor, { brandId: brand.id, name: "Lancha", linkToken: LANCHA_LINK_TOKEN });
  await addTables(systemActor, { venueId: lancha.id, numbers: Array.from({ length: 16 }, (_, i) => i + 1) });

  const menu = await publishMenu(staffActor(data.user.id), { brandId: brand.id, menu: bilosMenu });

  const dishCount = menu.sections.reduce((n, s) => n + s.dishes.length, 0);
  console.log(`Seeded Bilo's Pastry: Lancha with tables 1-16, Menu v${menu.number} with ${dishCount} dishes.`);
  console.log(`Guest menu: http://localhost:${process.env.PORT ?? 3000}/v/${LANCHA_LINK_TOKEN}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
