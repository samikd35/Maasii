import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { getGuestVenue } from "@/core";
import { setGuestLanguage } from "@/i18n/actions";
import { GuestMenuHeader } from "./guest-menu-parts";
import { GuestLink } from "./guest-navigation";
import { brandThemeStyle, displayFontClasses } from "./guest-theme";
import { LanguageSwitch } from "./language-switch";

const destinations = ["home", "menu", "feedback", "payment", "social"] as const;
type Destination = typeof destinations[number];

export function GuestVenueNavigation({ token, current }: { token: string; current: Destination }) {
  const t = useTranslations("GuestNavigation");
  const home = current === "home";
  const root = `/v/${encodeURIComponent(token)}` as const;
  return (
    <nav aria-label={t("pages")} className={home ? "mt-6" : "px-5"}>
      <ul role="list" className={home ? "divide-y divide-rule border-t border-rule" : "flex flex-wrap gap-x-3 border-b border-rule"}>
        {destinations.filter((page) => !home || page !== "home").map((page) => (
          <li key={page}>
            <GuestLink href={page === "home" ? root : `${root}/${page}`}
              current={page === current}
              className={home
                ? "flex min-h-14 items-center py-2 text-lg font-semibold text-brand-readable underline"
                : `inline-flex min-h-11 min-w-11 items-center text-sm ${page === current ? "font-semibold" : "underline"}`}>
              {t(page)}
            </GuestLink>
          </li>
        ))}
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
    <div className={`mx-auto max-w-xl wrap-anywhere pb-8 ${displayFontClasses[brand.displayFont]}`} style={brandThemeStyle(theme)}>
      <GuestMenuHeader brand={brand}>
        <LanguageSwitch area="guest" action={setGuestLanguage} />
      </GuestMenuHeader>
      {current !== "home" && <GuestVenueNavigation token={venue.linkToken} current={current} />}
      <main className="px-5 pt-6">{children}</main>
    </div>
  );
}
