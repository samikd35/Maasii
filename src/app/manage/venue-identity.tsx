"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { WaiterIcon } from "@/ui/waiter-icon";
import { switchOperationsVenue } from "./actions";
import type { accessibleVenues } from "./venue-scope";

type Venue = ReturnType<typeof accessibleVenues>[number];

export function VenueIdentity({ venue, venues, roleLabel, ownerHref }: {
  venue: Venue; venues: Venue[]; roleLabel: string; ownerHref?: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("ManagerWorkspace");
  const manage = useTranslations("StaffManage");
  const root = "/manage/venues/" + venue.id;
  const section = pathname.slice(root.length);
  const inSetup = section === "" || section === "/payment-options";
  const fromInsights = section === "/insights";
  return <details className="manager-identity" key={venue.id} name="venue-header-actions">
    <summary className="manager-identity-trigger">
      <span className="manager-identity-icon"><WaiterIcon name="tables" /></span>
      <span>
        <strong>{venue.name}</strong>
        <small>{venue.brandName} · {roleLabel}</small>
      </span>
      <WaiterIcon name="down" />
    </summary>
    <div className="manager-venue-panel">
      {venues.length > 1 && <form action={switchOperationsVenue}>
        <p className="manager-menu-label">{t("venuesHeading")}</p>
        <input type="hidden" name="section" value={section} />
        {venues.map(option => <button type="submit" key={option.id} name="venueId" value={option.id}
          disabled={option.id === venue.id} className="manager-venue-option">
          <span>{option.name}<small>{option.brandName}</small></span>
          {option.id === venue.id && <WaiterIcon name="check" />}
        </button>)}
      </form>}
      <Link href={root} className="manager-venue-option" aria-current={inSetup ? section === "" ? "page" : "location" : undefined}
        onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}>
        <span>{t("settingsNav")}</span><WaiterIcon name="next" />
      </Link>
      {ownerHref && <Link href={ownerHref} className="manager-venue-option">
        <span>{manage("ownerOverview")}</span><WaiterIcon name="next" />
      </Link>}
      {venue.role === "owner" && !fromInsights && <Link href={`/manage/brands/${venue.brandId}/venues`} className="manager-venue-option">
        <span>{manage("yourVenues")}</span><WaiterIcon name="next" />
      </Link>}
    </div>
  </details>;
}
