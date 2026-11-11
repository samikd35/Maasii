import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { cache } from "react";
import { getPublishedMenu, publicActor } from "@/core";
import { setGuestLanguage } from "@/i18n/actions";
import { LanguageSwitch } from "@/ui/language-switch";
import { GuestMenuView } from "@/ui/guest-menu-view";
import { Ordering } from "./ordering";

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
  const menu = await loadMenu((await params).token);
  if (!menu) notFound();
  const { Ordering: orderingMessages, Price: priceMessages } = await getMessages();
  return (
    <GuestMenuView
      brand={menu.brand}
      venueName={menu.venue.name}
      theme={menu.theme}
      sections={menu.sections}
      fastingDishes={menu.fastingDishes}
      houseFavourite={menu.houseFavourite}
      languageSwitch={<LanguageSwitch area="guest" action={setGuestLanguage} />}
      ordering={
        <NextIntlClientProvider messages={{ Ordering: orderingMessages, Price: priceMessages }}>
          <Ordering venueLinkToken={menu.venue.linkToken} sections={menu.sections} recordBrowsing />
        </NextIntlClientProvider>
      }
    />
  );
}
