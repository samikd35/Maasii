"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { WaiterSession } from "@/core";
import { Price } from "@/ui/price";
import { WaiterIcon } from "@/ui/waiter-icon";

type Sections = Extract<WaiterSession, { status: "unlocked" }>["menu"];

export function MenuReference({ sections, locale }: { sections: Sections; locale: "en" | "am" }) {
  const t = useTranslations("StaffWaiter");
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState("");
  const lookup = query.normalize("NFKC").trim().toLocaleLowerCase();
  const matches = sections.flatMap(section => {
    if (sectionId && sectionId !== section.id) return [];
    const dishes = section.dishes.filter(({ name }) => [name.en, name.am].some(text => text.normalize("NFKC").toLocaleLowerCase().includes(lookup)));
    return dishes.length ? [{ ...section, dishes }] : [];
  });
  const other = locale === "en" ? "am" : "en";

  return <section aria-labelledby="waiter-menu-title">
    <div className="waiter-view-heading"><h1 id="waiter-menu-title">{t("menu")}</h1></div>
    <div role="search">
      <label className="waiter-search text-sm font-medium">
        <span>{t("searchMenu")}</span>
        <span className="waiter-search-field"><WaiterIcon name="search" />
          <input type="search" className="workspace-input" value={query} onChange={event => setQuery(event.target.value)} />
        </span>
      </label>
    </div>
    {sections.length > 1 && <div className="waiter-menu-categories" role="group" aria-label={t("menuCategories")}>
      <button type="button" className="workspace-button" aria-pressed={!sectionId} onClick={() => setSectionId("")}>{t("menuAll")}</button>
      {sections.map(section => <button key={section.id} type="button" className="workspace-button" aria-pressed={sectionId === section.id}
        lang={section.name[locale] ? locale : other} onClick={() => setSectionId(section.id)}>{section.name[locale] || section.name[other]}</button>)}
    </div>}
    {!matches.length && <p className="waiter-notice" role="status">{t("noMatches")}</p>}
    {matches.map(section => (
      <section key={section.id} className="waiter-menu-category">
        <h2 lang={section.name[locale] ? locale : other}>{section.name[locale] || section.name[other]}</h2>
        <ul className="waiter-menu-list divide-y divide-rule">{section.dishes.map(dish => <li key={dish.id}>
          <div>
            <p lang={dish.name[locale] ? locale : other} className="font-semibold">{dish.name[locale] || dish.name[other]}</p>
            {dish.name[locale] && dish.name[other] && dish.name[locale] !== dish.name[other] &&
              <p lang={other} className="text-sm text-ink-muted">{dish.name[other]}</p>}
          </div>
          <Price santim={dish.priceSantim} />
        </li>)}</ul>
      </section>
    ))}
  </section>;
}
