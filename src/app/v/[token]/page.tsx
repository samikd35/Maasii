import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { cache, type CSSProperties } from "react";
import { getPublishedMenu, publicActor, type DisplayFont, type GuestMenuSection } from "@/core";
import { setGuestLanguage } from "@/i18n/actions";
import { LanguageSwitch } from "@/ui/language-switch";
import { Price } from "@/ui/price";
import { serifEthiopic, serifLatin } from "../../fonts";
import { OpenDishButton, Ordering } from "./ordering";

const displayFontClasses: Record<DisplayFont, string> = {
  "noto-sans-ethiopic": "", // Inherits the default face from the root layout.
  "noto-serif-ethiopic": `${serifEthiopic.variable} ${serifLatin.variable}`,
};

const loadMenu = cache(async (venueLinkToken: string) => {
  await connection();
  return getPublishedMenu(publicActor, { venueLinkToken, language: await getLocale() });
});

export async function generateMetadata({ params }: PageProps<"/v/[token]">): Promise<Metadata> {
  const [menu, t] = await Promise.all([loadMenu((await params).token), getTranslations("GuestMenu")]);
  if (!menu) return { title: t("notFoundTitle") };
  return { title: t("title", { brand: menu.brand.name, venue: menu.venue.name }) };
}

export default async function GuestMenuPage({ params }: PageProps<"/v/[token]">) {
  const [menu, t] = await Promise.all([loadMenu((await params).token), getTranslations("GuestMenu")]);
  if (!menu) notFound();
  const { Ordering: orderingMessages, Price: priceMessages } = await getMessages();
  const { brand, theme, fastingDishes, houseFavourite } = menu;
  const sections = fastingDishes.length > 0
    ? [
        { id: "fasting", name: t("fastingSection"), dishes: fastingDishes },
        ...menu.sections
          .map((section) => ({ ...section, dishes: section.dishes.filter((dish) => !dish.fasting) }))
          .filter((section) => section.dishes.length > 0),
      ]
    : menu.sections;
  const colours = {
    "--color-paper": theme.paper,
    "--color-paper-deep": theme.paperDeep,
    "--color-brand-accent": theme.accent,
    "--color-brand-readable": theme.readable,
  } as CSSProperties;

  return (
    <div className={`mx-auto max-w-xl pb-28 font-sans ${displayFontClasses[brand.displayFont]}`} style={colours}>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-t-2 border-brand-accent bg-paper px-5 pt-3">
        {brand.logoUrl ? (
          // A plain <img>: next/image would add client JavaScript to a page with a tight weight budget.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.name} height={48} className="h-12 w-auto" />
        ) : (
          <span className="font-display text-xl font-semibold">{brand.name}</span>
        )}
        <LanguageSwitch area="guest" action={setGuestLanguage} />
      </header>

      <main>
        <div className="px-5 pt-6">
          <p className="text-sm text-ink-muted">
            {brand.name} · {menu.venue.name}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-tight text-brand-readable">{t("heading")}</h1>
          {brand.coverUrl && brand.coverUrl !== houseFavourite?.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.coverUrl} alt="" loading="lazy" decoding="async" className="mt-4 aspect-[3/1] w-full rounded-lg bg-paper-deep object-cover" />
          )}
        </div>

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

        {sections.length === 0 ? (
          <p className="px-5 pt-6 text-ink-muted">{t("comingSoon")}</p>
        ) : (
          <>
            <SectionChips sections={sections} />
            {sections.map((section) => (
              <MenuSection key={section.id} section={section} />
            ))}
          </>
        )}
      </main>
      <NextIntlClientProvider messages={{ Ordering: orderingMessages, Price: priceMessages }}>
        <Ordering venueLinkToken={menu.venue.linkToken} sections={menu.sections} recordBrowsing />
      </NextIntlClientProvider>
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
  const ordering = useTranslations("Ordering");
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
          <li key={dish.id} className="relative flex items-start justify-between gap-4 border-b border-rule py-3.5">
            <div className="min-w-0">
              <h3 id={`dish-${dish.id}-name`} className="mr-2 inline text-[1.0625rem] leading-snug font-semibold">
                {dish.name}
              </h3>
              {dish.fasting && (
                <span id={`dish-${dish.id}-fasting`} className="inline-block rounded-full border border-brand-readable px-2 text-xs font-medium text-brand-readable">
                  {ordering("fasting")}
                </span>
              )}
              {dish.description && (
                <p id={`dish-${dish.id}-description`} className="mt-0.5 text-sm leading-snug text-ink-muted">
                  {dish.description}
                </p>
              )}
            </div>
            <Price santim={dish.priceSantim} />
            <OpenDishButton
              dishId={dish.id}
              labelledBy={`dish-${dish.id}-name`}
              describedBy={[
                dish.fasting && `dish-${dish.id}-fasting`,
                dish.description && `dish-${dish.id}-description`,
              ].filter(Boolean).join(" ") || undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
