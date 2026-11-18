import "@/app/guest-extras.css";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGuestVenue, publicActor } from "@/core";
import { GuestVenuePage } from "@/ui/guest-venue-page";
import { VideoPreference } from "@/ui/guest-serving-media";
import { GuestLink } from "@/ui/guest-navigation";

export default async function More({ params }: PageProps<"/v/[token]/more">) {
  const { token } = await params;
  const context = await getGuestVenue(publicActor, { venueLinkToken: token });
  if (!context) notFound();
  const t = await getTranslations("GuestNavigation");
  return <GuestVenuePage context={context} current="more">
    <h1 className="text-3xl font-semibold">{t("more")}</h1>
    <div className="mt-5 space-y-3">{(["payment", "feedback", "social"] as const).map(page =>
      <GuestLink key={page} href={`/v/${encodeURIComponent(token)}/${page}`} className="maasii-card flex min-h-14 items-center justify-between">{t(page)} <span aria-hidden>→</span></GuestLink>
    )}</div>
    <VideoPreference label={t("automaticVideo")} hint={t("videoPreferenceHelp")} />
  </GuestVenuePage>;
}
