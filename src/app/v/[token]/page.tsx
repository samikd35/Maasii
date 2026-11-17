import "@/app/guest-extras.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getGuestPendingOrders, getGuestVenue, getGuestVisit, publicActor } from "@/core";
import { guestSession } from "@/lib/supabase/guest-session";
import { GuestVenueNavigation, GuestVenuePage } from "@/ui/guest-venue-page";
import { GuestContinuation } from "./guest-continuation";

const loadVenue = cache(async (venueLinkToken: string) => {
  await connection();
  const context = await getGuestVenue(publicActor, { venueLinkToken });
  if (!context) notFound();
  return context;
});

export async function generateMetadata({ params }: PageProps<"/v/[token]">): Promise<Metadata> {
  const { brand, venue } = await loadVenue((await params).token);
  return { title: `${brand.name} · ${venue.name}` };
}

export default async function GuestHome({ params }: PageProps<"/v/[token]">) {
  const context = await loadVenue((await params).token);
  const venueLinkToken = context.venue.linkToken;
  const [t, { actor }] = await Promise.all([getTranslations("GuestNavigation"), guestSession()]);
  const [visit, pending] = actor
    ? await Promise.all([getGuestVisit(actor, { venueLinkToken }), getGuestPendingOrders(actor, { venueLinkToken })])
    : [null, []] as const;
  return (
    <GuestVenuePage context={context} current="home">
      <p className="text-sm text-ink-muted">{context.brand.name}</p>
      <h1 className="mt-1 font-display text-4xl leading-tight text-brand-readable">{context.venue.name}</h1>
      <p className="mt-2 text-ink-muted">{t("choose")}</p>
      <GuestContinuation token={venueLinkToken} hasOrders={Boolean(visit && !visit.closedAt) || pending.length > 0}
        hasBill={Boolean(visit?.bill)} orderLabel={t("continueOrder")} billLabel={t("viewBill")} />
      <GuestVenueNavigation token={venueLinkToken} current="home" />
    </GuestVenuePage>
  );
}
