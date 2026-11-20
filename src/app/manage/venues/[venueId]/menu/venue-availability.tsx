"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { getVenueMenuSettings, VenueMenuDish } from "@/core";
import { formatBirr } from "@/ui/price";
import { ActionForm } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { saveSoldOut } from "./actions";
import { SoldOutButton } from "./sold-out-switch";

type Sections = Awaited<ReturnType<typeof getVenueMenuSettings>>["sections"];
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();

export function VenueAvailability({ sections, venueId, search, onlySoldOut }: {
  sections: Sections; venueId: string; search: string; onlySoldOut: boolean;
}) {
  const t = useTranslations("VenueMenu");
  const [query, setQuery] = useState(search);
  const [soldOut, setSoldOut] = useState(onlySoldOut);
  const q = normalize(query.trim());
  const soldOutCount = sections.flatMap(section => section.dishes).filter(dish => dish.soldOut).length;
  const visible = sections.map(section => ({ ...section, dishes: section.dishes.filter(dish =>
    (!soldOut || dish.soldOut) && [dish.name.en, dish.name.am].some(name => normalize(name).includes(q)),
  ) })).filter(section => section.dishes.length);

  return <>
    <div className="manager-availability-toolbar">
      <div role="search">
        <label className="manager-search">
          <WaiterIcon name="search" /><span className="sr-only">{t("findDish")}</span>
          <input type="search" maxLength={120} value={query} placeholder={t("liveSearch")} onChange={event => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="manager-switches" aria-label={t("availability")}>
        <button type="button" aria-pressed={!soldOut} onClick={() => setSoldOut(false)}>{t("allDishes")}</button>
        <button type="button" aria-pressed={soldOut} onClick={() => setSoldOut(true)}>
          <WaiterIcon name="alert" />{t("soldOutCount", { count: soldOutCount })}
        </button>
      </div>
    </div>
    {!q && !soldOut && visible.length > 1 && <nav className="manager-section-jumps" aria-label={t("menuSections")}>
      {visible.map(section => <a key={section.id} className="workspace-button" href={"#menu-section-" + section.id}>{section.name}</a>)}
    </nav>}
    {!visible.length && <p role="status" className="manager-empty">{t("noMatches")}</p>}
    {visible.map(section => (
      <section key={section.id} aria-labelledby={"menu-section-" + section.id} className="manager-menu-section">
        <div className="manager-section-heading"><h2 id={"menu-section-" + section.id} tabIndex={-1}>{section.name}</h2></div>
        <ul className="manager-list">
          {section.dishes.map(dish => <DishRow key={dish.id} dish={dish} venueId={venueId} />)}
        </ul>
      </section>
    ))}
  </>;
}

function DishRow({ dish, venueId }: { dish: VenueMenuDish; venueId: string }) {
  const t = useTranslations("VenueMenu");
  const price = useTranslations("Price");
  const locale = useLocale();
  const otherLocale = locale === "am" ? "en" : "am";
  const nameLocale = dish.name[locale] ? locale : otherLocale;
  const name = dish.name[nameLocale];
  const otherName = dish.name[otherLocale];
  const amount = formatBirr(dish.venuePriceSantim ?? dish.brandPriceSantim);
  return <li className="manager-dish-row">
    <div>
      <h3 lang={nameLocale}>{name}</h3>
      {otherName && otherName !== name && <p lang={otherLocale} className="manager-muted">{otherName}</p>}
      <strong className="text-sm tabular-nums">{amount} {price("currency")}</strong>
    </div>
    <div className="manager-dish-state">
      <span className={dish.soldOut ? "manager-chip" : "manager-dish-available"} data-tone={dish.soldOut ? "waiting" : undefined}>
        <WaiterIcon name={dish.soldOut ? "alert" : "check"} />{t(dish.soldOut ? "soldOut" : "available")}
      </span>
      <ActionForm action={saveSoldOut.bind(null, venueId, dish.id, !dish.soldOut)}>
        <SoldOutButton label={t(dish.soldOut ? "restoreAvailability" : "markSoldOut")} name={name} />
      </ActionForm>
    </div>
  </li>;
}
