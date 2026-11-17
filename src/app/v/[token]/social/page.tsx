import "@/app/guest-extras.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getGuestSocialLinks, publicActor } from "@/core";
import { GuestVenuePage } from "@/ui/guest-venue-page";

const loadSocialLinks = cache(async (token: string) => {
  await connection();
  const result = await getGuestSocialLinks(publicActor, { venueLinkToken: token });
  if (!result) notFound();
  return result;
});

export async function generateMetadata({ params }: PageProps<"/v/[token]/social">): Promise<Metadata> {
  const [{ brand, venue }, t] = await Promise.all([loadSocialLinks((await params).token), getTranslations("GuestSocial")]);
  return { title: `${t("heading")} · ${brand.name} · ${venue.name}` };
}

export default async function GuestSocialPage({ params }: PageProps<"/v/[token]/social">) {
  const [context, t] = await Promise.all([
    loadSocialLinks((await params).token), getTranslations("GuestSocial"),
  ]);
  const { brand, venue, links } = context;
  return (
    <GuestVenuePage context={context} current="social">
      <p className="mt-2 text-sm text-ink-muted">{brand.name} · {venue.name}</p>
      <h1 className="mt-1 font-display text-4xl leading-tight text-brand-readable">{t("heading")}</h1>
      {links.length ? (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {links.map(({ name, url }, index) => (
            <li key={index}>
              <a href={url} rel="noreferrer" className="inline-flex min-h-11 min-w-11 items-center font-semibold text-brand-readable underline">
                {name}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-ink-muted">{t("empty")}</p>
      )}
    </GuestVenuePage>
  );
}
