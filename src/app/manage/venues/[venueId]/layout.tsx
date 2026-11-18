import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { getMyAccess, getVenueSetup, MaasiiError } from "@/core";
import { VenueNavigation } from "../../venue-navigation";

export default async function VenueLayout({ children, params }: LayoutProps<"/manage/venues/[venueId]">) {
  const actor = await requireStaff();
  const { venueId } = await params;
  const setup = await getVenueSetup(actor, { venueId }).catch(error => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, staff, access] = await Promise.all([getTranslations("StaffManage"), getTranslations("Staff"), getMyAccess(actor)]);
  const multipleVenues = new Set([...access.venues, ...access.brands.flatMap(brand => brand.venues)].map(venue => venue.id)).size > 1;
  return <>
    <div className="workspace-context">
      <p><strong>{setup.venue.name}</strong> <span className="text-ink-muted">· {setup.brand.name} · {staff(setup.isOwner ? "owner" : "manager")}</span></p>
      {multipleVenues && <Link href={`/manage/operations?venue=${venueId}`} className="workspace-link">{t("switchVenue")}</Link>}
    </div>
    <VenueNavigation venueId={venueId} name={setup.venue.name} />
    {children}
  </>;
}
