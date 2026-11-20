import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { getMenuDraft } from "@/core";
import { requireStaff } from "@/lib/session";
import { WaiterIcon } from "@/ui/waiter-icon";
import { OwnerHome } from "../../owner-home";
import { ownerBrand } from "../../owner-scope";
import { OwnerVenues, VenueAttention, ownerVenueStatus } from "../../owner-venues";
import { RefreshFloor } from "../../refresh-floor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("ownerOverview")} · Maasii` };
}

export default async function OwnerOverview({ params }: PageProps<"/manage/brands/[brandId]">) {
  const { brandId } = await params;
  const [actor, brand, t, owner, menu, format] = await Promise.all([
    requireStaff(), ownerBrand(brandId), getTranslations("StaffManage"), getTranslations("OwnerWorkspace"),
    getTranslations("MenuEditor"), getFormatter(),
  ]);
  const now = new Date();
  const [draft, venues] = await Promise.all([getMenuDraft(actor, { brandId }, { now }), ownerVenueStatus(actor, brand.venues, now)]);
  const root = `/manage/brands/${brandId}`;
  const inService = venues.filter(({ snapshot }) => snapshot.service.assigned > 0).length;
  return <>
    <div className="owner-page-head">
      <h1>{brand.name}</h1>
      <p>{venues.length ? t("liveVenueCount", { count: inService, total: venues.length }) : t("ownerOverview")}</p>
    </div>
    {venues.length > 0 ? <>
      <VenueAttention venues={venues} checkedAt={now} />
      <section id="venues" aria-labelledby="owner-venues">
        <div className="manager-section-heading">
          <h2 id="owner-venues">{t("yourVenues")}</h2>
          <Link className="workspace-link" href={root + "/venues"}>{owner("manageVenues")}</Link>
        </div>
        <OwnerVenues venues={venues} />
      </section>
      <RefreshFloor intervalMs={60_000} />
    </> : <section className="workspace-panel owner-onboarding" aria-labelledby="owner-start">
      <h2 id="owner-start">{owner("firstVenue")}</h2>
      <Link className="workspace-button workspace-primary mt-2" href={root + "/venues#add-venue"}><WaiterIcon name="plus" />{t("addVenue")}</Link>
    </section>}
    <div className="owner-dashboard-lower workspace-section">
      <section className="workspace-panel owner-menu-status" aria-labelledby="owner-menu">
        <div className="manager-row-heading">
          <h2 id="owner-menu">{menu("nav")}</h2>
          {draft.hasUnpublishedChanges && <span className="manager-chip" data-tone="waiting">{menu("savedUnpublished")}</span>}
        </div>
        <p className="manager-muted">{draft.lastPublishedAt ? menu("lastPublish", { date: format.dateTime(draft.lastPublishedAt, { dateStyle: "medium", timeZone: "Africa/Addis_Ababa" }) }) : menu("neverPublished")}</p>
        <Link className={`workspace-button${draft.hasUnpublishedChanges || !draft.lastPublishedAt ? " workspace-primary" : ""}`} href={root + "/menu"}>
          <WaiterIcon name="menu" />{t(draft.hasUnpublishedChanges ? "reviewBrandDraft" : draft.lastPublishedAt ? "openBrandMenu" : "createBrandMenu")}
        </Link>
      </section>
      {venues.length > 0 && <OwnerHome actor={actor} brandId={brandId} venues={venues} />}
    </div>
  </>;
}
