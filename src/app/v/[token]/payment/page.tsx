import "@/app/guest-extras.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getGuestPaymentDetails, publicActor } from "@/core";
import { GuestPaymentOptions } from "@/ui/guest-payment-options";
import { GuestVenuePage } from "@/ui/guest-venue-page";

const loadDetails = cache(async (token: string) => {
  await connection();
  const details = await getGuestPaymentDetails(publicActor, { venueLinkToken: token });
  if (!details) notFound();
  return details;
});

export async function generateMetadata({ params }: PageProps<"/v/[token]/payment">): Promise<Metadata> {
  const [details, t] = await Promise.all([loadDetails((await params).token), getTranslations("GuestPayment")]);
  return { title: `${t("heading")} · ${details.brand.name} · ${details.venue.name}` };
}

export default async function GuestPaymentPage({ params }: PageProps<"/v/[token]/payment">) {
  const [details, t] = await Promise.all([loadDetails((await params).token), getTranslations("GuestPayment")]);
  const { brand, venue, options } = details;
  return (
    <GuestVenuePage context={details} current="payment">
      <p className="mt-2 text-sm text-ink-muted">{brand.name} · {venue.name}</p>
      <h1 className="mt-1 font-display text-4xl leading-tight text-brand-readable">{t("heading")}</h1>
      {options.length ? (
        <>
          <p className="mt-3 text-sm text-ink-muted">{t("instructions")}</p>
          <GuestPaymentOptions options={options} />
        </>
      ) : (
        <p className="mt-3 text-ink-muted">{t("empty")}</p>
      )}
    </GuestVenuePage>
  );
}
