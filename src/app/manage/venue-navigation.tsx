import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { getLiveFloor } from "@/core";
import { LiveFloor } from "./live-floor";
import { ownerNavigation } from "./owner-navigation";
import { WorkspaceNav } from "./workspace-nav";

export async function VenueNavigation({ venueId, name, brandId }: { venueId: string; name: string; brandId?: string }) {
  const [manage, manager, shifts, floor, menu, owner] = await Promise.all([
    getTranslations("StaffManage"), getTranslations("ManagerWorkspace"), getTranslations("Shifts"), getTranslations("Floor"), getTranslations("VenueMenu"),
    brandId ? ownerNavigation(brandId) : null,
  ]);
  const root = `/manage/venues/${venueId}`;
  return <WorkspaceNav label={manage("venueOperations", { venue: name })} className="manager-nav" detail={owner && brandId ? {
    ...owner, path: root + "/insights", current: `/manage/brands/${brandId}/insights`,
  } : undefined} links={[
    { href: `${root}/floor`, label: manager("floorNav"), accessibleLabel: floor("title"), icon: "tables" },
    { href: `${root}/shifts`, label: shifts("title"), icon: "clock" },
    { href: `${root}/menu`, label: manager("menuNav"), accessibleLabel: menu("title"), nested: true, icon: "menu" },
    { href: `${root}/closing`, label: manage("closingNav"), icon: "receipt" },
    { href: root, label: manager("setupNav"), sectionHref: `${root}/payment-options`, icon: "setup" },
  ]} />;
}

export async function VenueFloor({ venueId, floor, focus }: { venueId: string; floor: Awaited<ReturnType<typeof getLiveFloor>>; focus?: string }) {
  const { Floor, Bills, StaffManage } = await getMessages();
  return <NextIntlClientProvider messages={{ Floor, Bills, StaffManage }}>
    <LiveFloor key={venueId + (focus ?? "")} venueId={venueId} floor={floor} focus={focus} />
  </NextIntlClientProvider>;
}
