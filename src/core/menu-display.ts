import { inLanguage, type Bilingual, type Language } from "./language";
import type { GuestMenuSection, MenuDraftContent } from "./menu";

export function localizeMenuSections(
  sections: MenuDraftContent["sections"],
  language: Language,
): GuestMenuSection[] {
  const text = ({ en, am }: Bilingual) => inLanguage({ en: en.trim(), am: am.trim() }, language);
  return sections.map((section) => ({
    id: section.sectionId,
    name: text(section.name),
    dishes: section.dishes.map((dish) => ({
      id: dish.dishId,
      name: text(dish.name),
      description: text(dish.description),
      priceSantim: dish.priceSantim,
      fasting: dish.fasting,
      photoUrl: dish.photoUrl ?? null,
      optionGroups: dish.optionGroups.map((group) => ({
        id: group.optionGroupId,
        name: text(group.name),
        kind: group.kind,
        required: group.required,
        choices: group.choices.map((choice) => ({
          id: choice.choiceId,
          name: text(choice.name),
          priceChangeSantim: choice.priceChangeSantim,
        })),
      })),
    })),
  }));
}
