import { expect, test } from "vitest";
import { createBrand, listBrands, publicActor } from "@/core";
import { createPlatformAdmin, createStaffUser } from "../support/users";

test("the platform admin creates a brand and sees it in the brand list", async () => {
  const admin = await createPlatformAdmin();

  const brand = await createBrand(admin.actor, { name: "Saba House" });

  expect(brand).toMatchObject({ name: "Saba House" });
  expect(await listBrands(admin.actor)).toContainEqual(expect.objectContaining({ id: brand.id, name: "Saba House" }));
});

test("nobody but the platform admin can create brands or list them", async () => {
  const someone = await createStaffUser("someone");

  for (const actor of [someone.actor, publicActor]) {
    await expect(createBrand(actor, { name: "Saba House" })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(listBrands(actor)).rejects.toMatchObject({ code: "not_allowed" });
  }
});
