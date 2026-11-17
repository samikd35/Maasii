import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getGuestPaymentDetails, publicActor } from "@/core";
import { setGuestLanguage } from "@/i18n/actions";
import { GuestLink } from "@/ui/guest-navigation";
import { GuestMenuHeader } from "@/ui/guest-menu-parts";
import { GuestPaymentOptions } from "@/ui/guest-payment-options";
import { brandThemeStyle, displayFontClasses } from "@/ui/guest-theme";
import { LanguageSwitch } from "@/ui/language-switch";

const loadDetails = cache(async (token: string) => {
  await connection();
  const details = await getGuestPaymentDetails(publicActor, { venueLinkToken: token });
  if (!details) notFound();
  return details;
});

export async function generateMetadata({ params }: PageProps<"/v/[token]/payment">): Promise<Metadata> {
  const [details, t] = await Promise.all([loadDetails((await params).token), getTranslations("GuestPayment")]);
  return { title: `${t("heading")} · ${details.brand.name} · ${details.venue.name}` };
}

export default async function GuestPaymentPage({ params }: PageProps<"/v/[token]/payment">) {
  const [{ brand, venue, theme, options }, t] = await Promise.all([
    loadDetails((await params).token),
    getTranslations("GuestPayment"),
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
        {options.length ? (
          <>
            <p className="mt-3 text-sm text-ink-muted">{t("instructions")}</p>
            <GuestPaymentOptions options={options} />
          </>
        ) : (
          <p className="mt-3 text-ink-muted">{t("empty")}</p>
        )}
      </main>
    </div>
  );
}
