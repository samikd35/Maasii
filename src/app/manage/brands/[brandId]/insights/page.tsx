import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { WaiterIcon } from "@/ui/waiter-icon";
import { OwnerHome } from "../../../owner-home";
import { ownerBrand } from "../../../owner-scope";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("insightsNav")} · Maasii` };
}

export default async function BrandInsights({ params, searchParams }: PageProps<"/manage/brands/[brandId]/insights">) {
  const { brandId } = await params;
  const [actor, brand, query, t, owner] = await Promise.all([
    requireStaff(), ownerBrand(brandId), searchParams, getTranslations("StaffManage"), getTranslations("OwnerWorkspace"),
  ]);
  return <>
    <div className="owner-page-head"><h1>{t("insightsNav")}</h1></div>
    {brand.venues.length ? <>
      <OwnerHome actor={actor} brandId={brandId} venues={brand.venues}
        selected={typeof query.findingVenue === "string" ? query.findingVenue : undefined} showPicker />
      <section className="workspace-section" aria-labelledby="venue-reports">
        <h2 id="venue-reports">{owner("venueReports")}</h2>
        <ul className="manager-list owner-venue-list">
          {brand.venues.map(venue => <li key={venue.id}>
            <Link className="owner-venue-link" href={`/manage/venues/${venue.id}/insights`}>
              <span className="manager-setup-icon"><WaiterIcon name="trend" /></span>
              <strong>{venue.name}</strong><WaiterIcon name="next" />
            </Link>
          </li>)}
        </ul>
      </section>
    </> : <p className="workspace-panel">{t("noVenues")}</p>}
  </>;
}
