import "@/app/guest-extras.css";
import type { Metadata } from "next";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getGuestReviewForm, getGuestVenue, getGuestVisit, publicActor } from "@/core";
import { guestSession } from "@/lib/supabase/guest-session";
import { GuestVenuePage } from "@/ui/guest-venue-page";
import am from "../../../../../messages/reviews.am.json";
import en from "../../../../../messages/reviews.en.json";
import { GuestReviews } from "../guest-reviews";

const loadVenue = cache(async (token: string) => {
  const result = await getGuestVenue(publicActor, { venueLinkToken: token });
  if (!result) notFound();
  return result;
});

async function translations() {
  const locale = await getLocale();
  return createTranslator({ locale, messages: locale === "am" ? am : en });
}

export async function generateMetadata({ params }: PageProps<"/v/[token]/feedback">): Promise<Metadata> {
  const [{ brand, venue }, t] = await Promise.all([loadVenue((await params).token), translations()]);
  return { title: `${t("heading")} · ${brand.name} · ${venue.name}` };
}

export default async function FeedbackPage({ params }: PageProps<"/v/[token]/feedback">) {
  const [context, { actor }, t] = await Promise.all([
    loadVenue((await params).token), guestSession(), translations(),
  ]);
  const { brand, venue } = context;
  const input = { venueLinkToken: venue.linkToken };
  const visit = actor ? await getGuestVisit(actor, input) : null;
  const form = actor && visit?.closedAt && visit.bill ? await getGuestReviewForm(actor, input) : null;
  const href = `/v/${encodeURIComponent(venue.linkToken)}` as const;
  return (
    <GuestVenuePage context={context} current="feedback">
      <p className="mt-2 text-sm text-ink-muted">{brand.name} · {venue.name}</p>
      <h1 id="reviews-heading" className="mt-1 font-display text-4xl leading-tight text-brand-readable">{t("heading")}</h1>
      <p className="mt-3 text-ink-muted">{t("intro", { brand: brand.name })}</p>
      <div className="mt-4">
        {form ? (
          <NextIntlClientProvider messages={{}}>
            <GuestReviews key={form.visitId} form={form} url={`${href}/reviews`} titleId="reviews-heading" />
          </NextIntlClientProvider>
        ) : (
          <p>{visit && !visit.closedAt ? t("awaitingPayment") : t("unavailable")}</p>
        )}
      </div>
    </GuestVenuePage>
  );
}
