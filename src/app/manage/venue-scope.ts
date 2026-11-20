import type { MyAccess } from "@/core";

export const operationVenueCookie = "maasii-operation-venue";

export function accessibleVenues(access: MyAccess) {
  return [
    ...access.venues,
    ...access.brands.flatMap(brand => brand.venues.map(venue => ({ ...venue, brandId: brand.id, brandName: brand.name, role: brand.role }))),
  ];
}
