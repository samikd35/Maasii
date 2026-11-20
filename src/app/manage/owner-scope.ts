import { notFound } from "next/navigation";
import { cache } from "react";
import { getMyAccess } from "@/core";
import { requireStaff } from "@/lib/session";

export const ownerBrandCookie = "maasii-owner-brand";
export const managementAccess = cache(async () => getMyAccess(await requireStaff()));

export async function ownerBrand(brandId: string) {
  const brand = (await managementAccess()).brands.find(option => option.id === brandId);
  if (!brand) notFound();
  return brand;
}
