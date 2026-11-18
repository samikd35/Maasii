import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { getLiveFloor } from "@/core";
import { LiveFloor } from "./live-floor";
import { WorkspaceNav } from "./workspace-nav";

export async function VenueNavigation({ venueId, name }: { venueId: string; name: string }) {
  const [manage, floor, shifts, menu] = await Promise.all([
    getTranslations("StaffManage"), getTranslations("Floor"), getTranslations("Shifts"), getTranslations("VenueMenu"),
  ]);
  const root = `/manage/venues/${venueId}`;
  return <WorkspaceNav label={manage("venueOperations", { venue: name })} className="venue-nav" links={[
    { href: `${root}/floor`, label: floor("title"), alsoCurrent: "/manage/operations" },
    { href: `${root}/shifts`, label: shifts("title") },
    { href: `${root}/menu`, label: menu("title"), nested: true },
    { href: `${root}/closing`, label: manage("closingNav") },
    { href: root, label: manage("venueSetup") },
  ]} />;
}

export async function VenueFloor({ venueId, floor }: { venueId: string; floor: Awaited<ReturnType<typeof getLiveFloor>> }) {
  const { Floor, Bills, StaffManage } = await getMessages();
  return <NextIntlClientProvider messages={{ Floor, Bills, StaffManage }}>
    <LiveFloor key={venueId} venueId={venueId} floor={floor} />
  </NextIntlClientProvider>;
}
