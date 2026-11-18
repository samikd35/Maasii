import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getVenueMenuSettings, MaasiiError, type VenueMenuDish } from "@/core";
import { requireStaff } from "@/lib/session";
import { formatBirr } from "@/ui/price";
import { ActionForm } from "@/ui/staff-forms";
import { saveSoldOut } from "./actions";
import { SoldOutButton } from "./sold-out-switch";

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

export default async function VenueMenuPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/menu">) {
  const { venueId } = await params;
  const { venue, sections } = await load(venueId);
  const t = await getTranslations("VenueMenu");
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const soldOut = query.availability === "sold-out";
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
  const match = normalize(search);
  const visible = sections.map(section => ({ ...section, dishes: section.dishes.filter(dish =>
    (!soldOut || dish.soldOut) && (normalize(dish.name.en).includes(match) || normalize(dish.name.am).includes(match)),
  ) })).filter(section => section.dishes.length);

  return (
    <>
      <div className="workspace-title">
        <div><h1>{t("title")}</h1><p className="mt-1 text-sm text-ink-muted">{t("liveOnly", { venue: venue.name })}</p></div>
        <Link href={`/manage/venues/${venueId}/menu/edit`} className="workspace-link">{t("editMenu")}</Link>
      </div>
      {sections.length === 0 ? (
        <p className="mt-4 text-ink-muted">{t("empty")}</p>
      ) : (
        <>
          <form role="search" className="workspace-panel workspace-actions items-end">
            <label className="flex-1 min-w-0 basis-36 text-sm font-medium">{t("findDish")}
              <input name="q" type="search" maxLength={120} defaultValue={search} className="workspace-input" />
            </label>
            <label className="text-sm font-medium">{t("availability")}
              <select name="availability" defaultValue={soldOut ? "sold-out" : ""} className="workspace-input">
                <option value="">{t("allDishes")}</option><option value="sold-out">{t("soldOut")}</option>
              </select>
            </label>
            <button className="workspace-button" type="submit">{t("filter")}</button>
          </form>
          {!visible.length && <p className="workspace-panel mt-3">{t("noMatches")}</p>}
          {visible.map((section) => (
            <section key={section.id} aria-labelledby={`menu-section-${section.id}`} className="workspace-section workspace-panel">
              <h2 id={`menu-section-${section.id}`} className="border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">
                {section.name}
              </h2>
              <ul>
                {section.dishes.map((dish) => (
                  <DishRow key={dish.id} dish={dish} venueId={venueId} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function DishRow({ dish, venueId }: { dish: VenueMenuDish; venueId: string }) {
  const t = useTranslations("VenueMenu");
  const price = useTranslations("Price");
  const locale = useLocale();
  const otherLocale = locale === "am" ? "en" : "am";
  const nameLocale = dish.name[locale] ? locale : otherLocale;
  const name = dish.name[nameLocale];
  const otherName = dish.name[otherLocale];
  const priceShown = dish.venuePriceSantim ?? dish.brandPriceSantim;

  return (
    <li className="border-b border-rule py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 lang={nameLocale} className="font-semibold">{name}</h3>
          {otherName && otherName !== name && <p lang={otherLocale} className="text-sm">{otherName}</p>}
          <p className="text-sm text-ink-muted">
            {t("currentPrice", { amount: formatBirr(priceShown), currency: price("currency") })}
          </p>
        </div>
        <div className="workspace-actions">
          <span className="workspace-badge" data-tone={dish.soldOut ? "waiting" : "live"}>{t(dish.soldOut ? "soldOut" : "available")}</span>
          <ActionForm action={saveSoldOut.bind(null, venueId, dish.id, !dish.soldOut)}>
            <SoldOutButton label={t(dish.soldOut ? "restoreAvailability" : "markSoldOut")} name={name} />
          </ActionForm>
        </div>
      </div>
    </li>
  );
}
