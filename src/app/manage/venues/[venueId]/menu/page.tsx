import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getVenueMenuSettings, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { WaiterIcon } from "@/ui/waiter-icon";
import { VenueAvailability } from "./venue-availability";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("VenueMenu");
  return { title: t("availabilityTitle") + " · Maasii" };
}

export default async function VenueMenuPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/menu">) {
  const { venueId } = await params;
  const [actor, language, query, t, { VenueMenu, Price }] = await Promise.all([
    requireStaff(), getLocale(), searchParams, getTranslations("VenueMenu"), getMessages(),
  ]);
  const { venue, sections } = await getVenueMenuSettings(actor, { venueId, language }).catch(error => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });

  return <>
    <div className="manager-row-heading">
      <div>
        <h1>{t("availabilityTitle")}</h1>
        <p className="manager-muted">{t("liveOnly", { venue: venue.name })}</p>
      </div>
      <Link href={"/manage/venues/" + venueId + "/menu/edit"} className="workspace-button">
        <WaiterIcon name="menu" />{t("editDraft")}
      </Link>
    </div>
    {sections.length ? <NextIntlClientProvider messages={{ VenueMenu, Price }}>
      <VenueAvailability venueId={venueId} sections={sections}
        search={typeof query.q === "string" ? query.q.trim().slice(0, 120) : ""}
        onlySoldOut={query.availability === "sold-out"} />
    </NextIntlClientProvider> : <p className="manager-empty">{t("empty")}</p>}
  </>;
}
