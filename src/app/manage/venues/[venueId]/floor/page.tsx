import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLiveFloor, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { VenueFloor } from "../../../venue-navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Floor");
  return { title: `${t("title")} · Maasii` };
}

export default async function FloorPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/floor">) {
  const { venueId } = await params;
  const floor = await getLiveFloor(await requireStaff(), { venueId }).catch(error => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const t = await getTranslations("Floor");
  const { focus } = await searchParams;
  return <><h1 className="mb-3">{t("title")}</h1><VenueFloor venueId={venueId} floor={floor} focus={typeof focus === "string" ? focus : undefined} /></>;
}
