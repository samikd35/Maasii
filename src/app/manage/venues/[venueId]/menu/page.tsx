import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getVenueMenuSettings, MaasiiError, type VenueMenuDish } from "@/core";
import { requireStaff } from "@/lib/session";
import { Field } from "@/ui/field";
import { formatBirr } from "@/ui/price";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { saveSoldOut, saveVenuePrice } from "./actions";
import { SoldOutSwitch } from "./sold-out-switch";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("VenueMenu");
  return { title: `${t("title")} · Maasii` };
}

async function load(venueId: string) {
  const actor = await requireStaff();
  try {
    return await getVenueMenuSettings(actor, { venueId, language: await getLocale() });
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function VenueMenuPage({ params }: PageProps<"/manage/venues/[venueId]/menu">) {
  const { venueId } = await params;
  const { venue, isOwner, sections } = await load(venueId);
  const t = await getTranslations("VenueMenu");

  return (
    <>
      <Link href={`/manage/venues/${venueId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {venue.name}
      </Link>
      <h1 className="font-display text-3xl">{t("title")}</h1>
      {sections.length === 0 ? (
        <p className="mt-4 text-ink-muted">{t("empty")}</p>
      ) : (
        <>
          {isOwner && <p id="venue-price-help" className="mt-3 text-sm text-ink-muted">{t("priceHelp")}</p>}
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`menu-section-${section.id}`} className="mt-7">
              <h2 id={`menu-section-${section.id}`} className="border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">
                {section.name}
              </h2>
              <ul>
                {section.dishes.map((dish) => (
                  <DishRow key={dish.id} dish={dish} venueId={venueId} isOwner={isOwner} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function DishRow({ dish, venueId, isOwner }: { dish: VenueMenuDish; venueId: string; isOwner: boolean }) {
  const t = useTranslations("VenueMenu");
  const price = useTranslations("Price");
  const locale = useLocale();
  const otherLocale = locale === "am" ? "en" : "am";
  const nameLocale = dish.name[locale] ? locale : otherLocale;
  const name = dish.name[nameLocale];
  const otherName = dish.name[otherLocale];
  const priceShown = isOwner ? dish.brandPriceSantim : dish.venuePriceSantim ?? dish.brandPriceSantim;

  return (
    <li className="border-b border-rule py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 lang={nameLocale} className="font-semibold">{name}</h3>
          {otherName && otherName !== name && <p lang={otherLocale} className="text-sm">{otherName}</p>}
          <p className="text-sm text-ink-muted">
            {t(isOwner ? "brandPrice" : "currentPrice", { amount: formatBirr(priceShown), currency: price("currency") })}
          </p>
        </div>
        <ActionForm action={saveSoldOut.bind(null, venueId, dish.id, !dish.soldOut)}>
          <SoldOutSwitch
            label={t("soldOutSwitch", { name })}
            status={t(dish.soldOut ? "soldOut" : "available")}
            soldOut={dish.soldOut}
          />
        </ActionForm>
      </div>
      {isOwner && (
        <ActionForm action={saveVenuePrice.bind(null, venueId, dish.id)} className="mt-2 flex flex-wrap items-end gap-2">
          <Field
            key={dish.venuePriceSantim ?? "brand"}
            label={t("venuePrice", { currency: price("currency") })}
            name="price"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            aria-describedby="venue-price-help"
            defaultValue={dish.venuePriceSantim === null ? "" : dish.venuePriceSantim / 100}
            className="w-36"
          />
          <SubmitButton variant="quiet">{t("savePrice")}</SubmitButton>
        </ActionForm>
      )}
    </li>
  );
}
