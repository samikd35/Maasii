import "@/app/guest-extras.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, getLocale } from "next-intl/server";
import { cache } from "react";
import { getPublishedMenu, getGuestPendingOrders, getGuestVenue, getGuestVisit, publicActor } from "@/core";
import { guestSession } from "@/lib/supabase/guest-session";
import { GuestVenuePage } from "@/ui/guest-venue-page";
import { GuestLink } from "@/ui/guest-navigation";
import { ServingPhoto } from "@/ui/serving-photo";
import { Price } from "@/ui/price";
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
  const [t, menuText, ordering, { actor }] = await Promise.all([
    getTranslations("GuestNavigation"), getTranslations("GuestMenu"), getTranslations("Ordering"), guestSession(),
  ]);
  const [visit, pending] = actor
    ? await Promise.all([getGuestVisit(actor, { venueLinkToken }), getGuestPendingOrders(actor, { venueLinkToken })])
    : [null, []] as const;
  const menu = await getPublishedMenu(publicActor, { venueLinkToken, language: await getLocale() });
  const dishes = menu?.sections.flatMap(section => section.dishes).slice(0, 2) ?? [];
  const featurePhoto = menu?.houseFavourite?.thumbnailUrl || menu?.houseFavourite?.photoUrl || menu?.brand.coverUrl;
  const root = `/v/${encodeURIComponent(venueLinkToken)}` as const;
  return (
    <GuestVenuePage context={context} current="home">
      <p className="text-sm text-ink-muted">{context.venue.name}</p>
      <h1 className="mt-1 text-3xl font-semibold">{t("welcome")}</h1>
      <GuestContinuation token={venueLinkToken} hasOrders={Boolean(visit && !visit.closedAt) || pending.length > 0}
        hasBill={Boolean(visit?.bill)} orderLabel={t("continueOrder")} billLabel={t("viewBill")} />
      {dishes.length > 0 && <GuestLink href={`${root}/menu#menu-search`} className="mt-4 flex min-h-12 items-center rounded-xl border border-control-border bg-white px-4 text-sm text-ink-muted">
        {menuText("search")}
      </GuestLink>}
      <article aria-label={menu?.houseFavourite ? t("houseFavourite") : undefined} className="maasii-card mt-4 flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          {menu?.houseFavourite && <div className="mb-3"><h2 className="text-xl font-semibold">{menu.houseFavourite.name}</h2><p className="mt-1 text-sm text-ink-muted">{menu.houseFavourite.description}</p></div>}
          <GuestLink href={`${root}/menu`} className="maasii-button text-sm">{t("explore")} →</GuestLink>
        </div>
        {featurePhoto && <ServingPhoto src={featurePhoto} alt="" width={120} height={120} fetchPriority="high" className="size-24 rounded-xl object-cover" />}
      </article>
      <div className="mt-5 flex gap-2 overflow-x-auto">
        {menu?.sections.map(section => <GuestLink key={section.id} href={`${root}/menu#section-${section.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-rule bg-white px-4 text-sm">{section.name}</GuestLink>)}
      </div>
      {dishes.length > 0 && <section className="mt-6"><h2 className="mb-3 text-xl font-semibold">{t("fresh")}</h2>
        <div className="grid grid-cols-2 gap-3">{dishes.map(dish => <GuestLink key={dish.id} href={`${root}/menu?dish=${dish.id}`} className="overflow-hidden rounded-2xl border border-rule bg-white">
          {dish.photoUrl && <ServingPhoto src={dish.thumbnailUrl || dish.photoUrl} alt="" width={180} height={110} loading="lazy" className="h-28 w-full object-cover" />}
          <div className="p-3">
            <h3 className="font-semibold">{dish.name}</h3>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Price santim={dish.priceSantim} /><span className="dish-action px-3">{ordering("chooseDish")}</span></div>
          </div>
        </GuestLink>)}</div></section>}
      <div className="mt-5 grid grid-cols-2 gap-3">{(["payment", "feedback"] as const).map(page => <GuestLink key={page} href={`${root}/${page}`} className="maasii-card text-sm font-semibold">{t(page)} →</GuestLink>)}</div>
    </GuestVenuePage>
  );
}
