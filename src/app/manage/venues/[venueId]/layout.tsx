import "../../manager.css";
import "@/app/staff/waiter.css";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { StaffHeader } from "@/ui/staff-header";
import { managementAccess } from "../../owner-scope";
import { VenueIdentity } from "../../venue-identity";
import { VenueNavigation } from "../../venue-navigation";
import { accessibleVenues } from "../../venue-scope";

export default async function VenueLayout({ children, params }: LayoutProps<"/manage/venues/[venueId]">) {
  const { venueId } = await params;
  const [access, staff, { ManagerWorkspace, StaffManage }] = await Promise.all([
    managementAccess(), getTranslations("Staff"), getMessages(),
  ]);
  const venues = accessibleVenues(access);
  const venue = venues.find(option => option.id === venueId);
  if (!venue) notFound();
  const ownerHref = venue.role === "owner" ? `/manage/brands/${venue.brandId}` : access.brands.length ? "/manage" : undefined;

  return <div className="manager-shell">
    <StaffHeader home="/manage" label={staff(venue.role)} className="manager-header" workspace
      identity={<NextIntlClientProvider messages={{ ManagerWorkspace, StaffManage }}>
        <VenueIdentity venue={venue} venues={venues} roleLabel={staff(venue.role)} ownerHref={ownerHref} />
      </NextIntlClientProvider>} />
    <div className="workspace-frame manager-frame">
      <VenueNavigation venueId={venueId} name={venue.name} brandId={venue.role === "owner" ? venue.brandId : undefined} />
      <main id="workspace-content" tabIndex={-1} className="manager-content">{children}</main>
    </div>
  </div>;
}
