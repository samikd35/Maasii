import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLiveFloor, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { LiveFloor } from "../../../live-floor";
import { RefreshFloor } from "../../../refresh-floor";

export default async function FloorPage({ params }: PageProps<"/manage/venues/[venueId]/floor">) {
  const { venueId } = await params;
  const floor = await getLiveFloor(await requireStaff(), { venueId }).catch((error) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const t = await getTranslations("Floor");
  return (
    <>
      <Link href={`/manage/venues/${venueId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">{t("back")}</Link>
      <h1 className="font-display text-3xl">{t("title")}</h1>
      <LiveFloor venueId={venueId} floor={floor} />
      <RefreshFloor />
    </>
  );
}
