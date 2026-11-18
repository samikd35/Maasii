import { OpenDishButton } from "@/app/v/[token]/ordering";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { GuestMenu, GuestMenuSection } from "@/core";
import { GuestDishRow, GuestMenuHeader } from "./guest-menu-parts";
import { brandThemeStyle, displayFontClasses } from "./guest-theme";
import { MenuTools } from "./guest-menu-tools";

/** The same Menu layout for a Venue Link and the Owner's preview. */
export function GuestMenuView({
  brand, venueName, theme, sections, fastingDishes, languageSwitch, navigation, ordering, preview,
}: Pick<GuestMenu, "brand" | "theme" | "sections" | "fastingDishes" | "houseFavourite"> & {
  venueName: string | null;
  languageSwitch: ReactNode;
  navigation?: ReactNode;
  ordering: ReactNode;
  preview?: boolean;
}) {
  const t = useTranslations("GuestMenu");
  const locale = useLocale();
  const Content = preview ? "div" : "main";
  const shownSections = fastingDishes.length > 0
    ? [
        { id: "fasting", name: t("fastingSection"), dishes: fastingDishes },
        ...sections
          .map((section) => ({ ...section, dishes: section.dishes.filter((dish) => !dish.fasting) }))
          .filter((section) => section.dishes.length > 0),
      ]
    : sections;
  return (
    <div data-menu className={`mx-auto max-w-xl wrap-anywhere font-sans ${preview ? "pb-8" : "pb-48"} ${displayFontClasses[brand.displayFont]}`} style={brandThemeStyle(theme)}>
      <GuestMenuHeader brand={brand}>{languageSwitch}</GuestMenuHeader>

      {navigation}
      <Content>
        <div className="px-5 pt-4">
          <p className="text-sm text-ink-muted">{venueName ? `${brand.name} · ${venueName}` : brand.name}</p>
          {preview ? <h3 className="mt-1 text-3xl font-semibold text-brand-readable">{t("heading")}</h3> : <h1 className="mt-1 text-3xl font-semibold text-brand-readable">{t("heading")}</h1>}
        </div>
        {shownSections.length === 0 ? (
          <p className="px-5 pt-6 text-ink-muted">{t("comingSoon")}</p>
        ) : (
          <>
            <MenuTools preview={preview} locale={locale} sections={shownSections.map(({ id, name }) => ({ id, name }))} labels={{ sections: t("sections"), search: t("search"), all: t("all"), empty: t("noResults") }} />
            {shownSections.map((section, index) => (
              <MenuSection key={section.id} section={section} index={index} />
            ))}
          </>
        )}
      </Content>
      {ordering}
    </div>
  );
}

function MenuSection({ section, index }: { section: GuestMenuSection; index: number }) {
  const headingId = `section-${section.id}-heading`;
  return (
    <section data-menu-section={section.id} id={`section-${section.id}`} aria-labelledby={headingId} className="menu-section">
      <h2 id={headingId}>{section.name}</h2>
      <ul>
        {section.dishes.map((dish, row) => {
          // DOM label IDs only need to be unique in this rendered Menu. Keep persistence on dish.id.
          const labelId = `dish-${index}-${row}`;
          return (
            <GuestDishRow key={dish.id} dish={dish} labelId={labelId}>
              <OpenDishButton
                dishId={dish.id}
                labelId={labelId}
                fasting={dish.fasting}
                hasDescription={!!dish.description}
              />
            </GuestDishRow>
          );
        })}
      </ul>
    </section>
  );
}
