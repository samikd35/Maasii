import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { getVenueSetup, MaasiiError } from "@/core";

export default async function VenueLayout({ children, params }: LayoutProps<"/manage/venues/[venueId]">) {
  const actor = await requireStaff();
  const { venueId } = await params;
  try { await getVenueSetup(actor, { venueId }); } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
  const [manage, floor, shifts, menu, closing] = await Promise.all([
    getTranslations("StaffManage"), getTranslations("Floor"), getTranslations("Shifts"), getTranslations("VenueMenu"), getTranslations("Closing"),
  ]);
  const root = `/manage/venues/${venueId}`;
  return <><nav className="task-nav mb-5" aria-label={manage("operations")}>
    <Link href="/manage/operations">{manage("operations")}</Link>
    <Link href={`${root}/floor`}>{floor("title")}</Link>
    <Link href={`${root}/shifts`}>{shifts("title")}</Link>
    <Link href={`${root}/menu`}>{menu("title")}</Link>
    <Link href={`${root}/closing`}>{closing("title")}</Link>
    <Link href={root}>{manage("venueSetup")}</Link>
  </nav>{children}</>;
}
