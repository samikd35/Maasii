import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { getGuestVenue } from "@/core";
import { setGuestLanguage } from "@/i18n/actions";
import { GuestMenuHeader } from "./guest-menu-parts";
import { GuestLink } from "./guest-navigation";
import { brandThemeStyle, displayFontClasses } from "./guest-theme";
import { LanguageSwitch } from "./language-switch";

type Destination = "home" | "menu" | "table" | "feedback" | "payment" | "social" | "more";

export function GuestVenueNavigation({ token, current }: { token: string; current: Destination }) {
  const t = useTranslations("GuestNavigation");
  const root = `/v/${encodeURIComponent(token)}` as const;
  const icons = { home: "M3 10 12 3l9 7v10H15v-6H9v6H3Z", menu: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z", table: "M5 7h14l2 14H3ZM9 7V5a3 3 0 0 1 6 0v2", more: "M4 6h16M4 12h16M4 18h16" };
  return (
    <nav aria-label={t("pages")} className="guest-nav">
      <ul role="list">
        {(["home", "menu", "table", "more"] as const).map(page => <li key={page}>
          <GuestLink href={page === "home" ? root : page === "table" ? `${root}/menu?view=order` : `${root}/${page}`}
            current={page === current || page === "more" && ["payment", "feedback", "social"].includes(current)} className="">
            <svg viewBox="0 0 24 24" aria-hidden><path d={icons[page]} /></svg>{t(page)}
          </GuestLink>
        </li>)}
      </ul>
    </nav>
  );
}

export function GuestVenuePage({ context, current, children }: {
  context: NonNullable<Awaited<ReturnType<typeof getGuestVenue>>>;
  current: Exclude<Destination, "menu">;
  children: ReactNode;
}) {
  const { brand, theme, venue } = context;
  return (
    <div className={`mx-auto max-w-xl wrap-anywhere pb-28 ${displayFontClasses[brand.displayFont]}`} style={brandThemeStyle(theme)}>
      <GuestMenuHeader brand={brand}>
        <LanguageSwitch area="guest" action={setGuestLanguage} />
      </GuestMenuHeader>
      <GuestVenueNavigation token={venue.linkToken} current={current} />
      <main className="px-5 pt-6">{children}</main>
    </div>
  );
}
