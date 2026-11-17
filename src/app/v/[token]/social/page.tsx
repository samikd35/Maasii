import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getGuestSocialLinks, publicActor } from "@/core";
import { setGuestLanguage } from "@/i18n/actions";
import { GuestMenuHeader } from "@/ui/guest-menu-parts";
import { GuestLink } from "@/ui/guest-navigation";
import { brandThemeStyle, displayFontClasses } from "@/ui/guest-theme";
import { LanguageSwitch } from "@/ui/language-switch";

const loadSocialLinks = cache(async (token: string) => {
  await connection();
  const result = await getGuestSocialLinks(publicActor, { venueLinkToken: token });
  if (!result) notFound();
  return result;
});

export async function generateMetadata({ params }: PageProps<"/v/[token]/social">): Promise<Metadata> {
  const [{ brand, venue }, t] = await Promise.all([loadSocialLinks((await params).token), getTranslations("GuestSocial")]);
  return { title: `${t("heading")} · ${brand.name} · ${venue.name}` };
}

export default async function GuestSocialPage({ params }: PageProps<"/v/[token]/social">) {
  const [{ brand, venue, theme, links }, t] = await Promise.all([
    loadSocialLinks((await params).token), getTranslations("GuestSocial"),
  ]);
  return (
    <div className={`mx-auto max-w-xl wrap-anywhere pb-8 ${displayFontClasses[brand.displayFont]}`} style={brandThemeStyle(theme)}>
      <GuestMenuHeader brand={brand}>
        <LanguageSwitch area="guest" action={setGuestLanguage} />
      </GuestMenuHeader>
      <main className="px-5 pt-6">
        <GuestLink href={`/v/${encodeURIComponent(venue.linkToken)}`}
          className="inline-flex min-h-11 items-center font-semibold text-brand-readable underline">
          {t("backToMenu")}
        </GuestLink>
        <p className="mt-2 text-sm text-ink-muted">{brand.name} · {venue.name}</p>
        <h1 className="mt-1 font-display text-4xl leading-tight text-brand-readable">{t("heading")}</h1>
        {links.length ? (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {links.map(({ name, url }, index) => (
              <li key={index}>
                <a href={url} rel="noreferrer" className="inline-flex min-h-11 min-w-11 items-center font-semibold text-brand-readable underline">
                  {name}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-muted">{t("empty")}</p>
        )}
      </main>
    </div>
  );
}
