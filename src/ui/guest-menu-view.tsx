import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { GuestMenu, GuestMenuSection } from "@/core";
import { OpenDishButton } from "@/app/v/[token]/ordering";
import { GuestDishRow, GuestMenuHeader, GuestMenuIntro } from "./guest-menu-parts";
import { brandThemeStyle, displayFontClasses } from "./guest-theme";
import { Price } from "./price";

/** The same Menu layout for a Venue Link and the Owner's preview. */
export function GuestMenuView({
  brand, venueName, theme, sections, fastingDishes, houseFavourite, languageSwitch, ordering, preview,
}: Pick<GuestMenu, "brand" | "theme" | "sections" | "fastingDishes" | "houseFavourite"> & {
  venueName: string | null;
  languageSwitch: ReactNode;
  ordering: ReactNode;
  preview?: boolean;
}) {
  const t = useTranslations("GuestMenu");
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
    <div className={`mx-auto max-w-xl font-sans ${preview ? "pb-8" : "pb-28"} ${displayFontClasses[brand.displayFont]}`} style={brandThemeStyle(theme)}>
      <GuestMenuHeader brand={brand}>{languageSwitch}</GuestMenuHeader>

      <Content>
        <GuestMenuIntro
          label={venueName ? `${brand.name} · ${venueName}` : brand.name}
          heading={preview ? "h3" : "h1"}
          coverUrl={brand.coverUrl !== houseFavourite?.photoUrl ? brand.coverUrl : null}
        />

        {houseFavourite?.photoUrl && (
          <article aria-labelledby="house-favourite-label" className="relative mx-5 mt-4 flex items-center gap-4 overflow-hidden rounded-lg border border-rule bg-paper-deep">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={houseFavourite.photoUrl} alt="" loading="lazy" decoding="async" className="size-28 shrink-0 object-cover" />
            <div className="py-3 pr-3">
              <p id="house-favourite-label" className="text-xs font-semibold tracking-wide text-brand-readable uppercase">{t("houseFavourite")}</p>
              <h2 id="house-favourite-name" className="mt-1 font-display text-xl leading-tight">{houseFavourite.name}</h2>
              <Price santim={houseFavourite.priceSantim} />
            </div>
            <OpenDishButton dishId={houseFavourite.id} labelledBy="house-favourite-name" />
          </article>
        )}

        {shownSections.length === 0 ? (
          <p className="px-5 pt-6 text-ink-muted">{t("comingSoon")}</p>
        ) : (
          <>
            <SectionChips sections={shownSections} />
            {shownSections.map((section) => (
              <MenuSection key={section.id} section={section} />
            ))}
          </>
        )}
      </Content>
      {ordering}
    </div>
  );
}

function SectionChips({ sections }: { sections: GuestMenuSection[] }) {
  const t = useTranslations("GuestMenu");
  return (
    <nav
      aria-label={t("sections")}
      className="sticky top-16 z-10 mt-4 border-b border-rule bg-paper/95 backdrop-blur-sm"
    >
      <ul className="flex gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none]">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#section-${section.id}`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-ink/25 px-4 text-sm font-medium whitespace-nowrap hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {section.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MenuSection({ section }: { section: GuestMenuSection }) {
  const t = useTranslations("Price");
  const headingId = `section-${section.id}-heading`;
  return (
    <section id={`section-${section.id}`} aria-labelledby={headingId} className="scroll-mt-36 px-5 pt-8">
      <div className="flex items-baseline justify-between border-b border-ink/70 pb-1.5">
        <h2 id={headingId} className="text-sm font-semibold tracking-wide text-brand-readable uppercase">
          {section.name}
        </h2>
        <span aria-hidden className="text-xs font-medium text-ink-muted">
          {t("currency")}
        </span>
      </div>
      <ul>
        {section.dishes.map((dish) => (
          <GuestDishRow key={dish.id} dish={dish}>
            <OpenDishButton
              dishId={dish.id}
              labelledBy={`dish-${dish.id}-name`}
              describedBy={[
                dish.fasting && `dish-${dish.id}-fasting`,
                dish.description && `dish-${dish.id}-description`,
              ].filter(Boolean).join(" ") || undefined}
            />
          </GuestDishRow>
        ))}
      </ul>
    </section>
  );
}
