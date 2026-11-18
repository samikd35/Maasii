import type { MenuDraftContent } from "./menu";

type Section = MenuDraftContent["sections"][number];
type Dish = Section["dishes"][number];

export type VenueMenuChanges = {
  edits: Record<string, Partial<Omit<Dish, "dishId" | "photoUrl" | "videoAssetId" | "name" | "description">> & {
    photoUrl?: string | null;
    videoAssetId?: string | null;
    name?: Partial<Dish["name"]>;
    description?: Partial<Dish["description"]>;
  }>;
  additions: Section[];
  removed: string[];
};

export function mergeVenueMenu(base: Section[], changes?: VenueMenuChanges | null): MenuDraftContent {
  if (!changes) return { sections: base, archivedDishes: [] };
  const sections = base.map((section) => ({
    ...section,
    dishes: section.dishes.map((dish) => {
      const patch = changes.edits[dish.dishId];
      if (!patch) return dish;
      const { photoUrl, videoAssetId, name, description, ...fields } = patch;
      return {
        ...dish, ...fields, name: { ...dish.name, ...name }, description: { ...dish.description, ...description },
        photoUrl: photoUrl === undefined ? dish.photoUrl : photoUrl ?? undefined,
        videoAssetId: videoAssetId === undefined ? dish.videoAssetId : videoAssetId ?? undefined,
      };
    }),
  }));
  for (const local of changes.additions) {
    const section = sections.find(({ sectionId }) => sectionId === local.sectionId);
    if (section) section.dishes.push(...local.dishes);
    else sections.push({ ...local, dishes: [...local.dishes] });
  }
  const removed = new Set(changes.removed);
  return {
    sections: sections.map((section) => ({ ...section, dishes: section.dishes.filter((dish) => !removed.has(dish.dishId)) })),
    archivedDishes: sections.flatMap(({ sectionId, name, dishes }) => dishes.filter((dish) => removed.has(dish.dishId))
      .map((dish) => ({ sectionId, sectionName: name, dish }))),
  };
}
