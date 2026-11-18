"use client";

import { useState } from "react";

export function MenuReference({ dishes, locale, title, search, empty }: {
  dishes: { id: string; en: string; am: string }[]; locale: "en" | "am"; title: string; search: string; empty: string;
}) {
  const [query, setQuery] = useState("");
  const matches = dishes.filter(dish => `${dish.en} ${dish.am}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const other = locale === "en" ? "am" : "en";
  return <section aria-label={title}><h2 className="text-xl font-semibold">{title}</h2>
    <label className="my-4 block text-sm font-semibold">{search}<input type="search" className="mt-2 min-h-12 w-full border px-3" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {!matches.length && <p role="status">{empty}</p>}
    <ul className="divide-y divide-rule">{matches.map(dish => <li key={dish.id} className="py-3">
      <p lang={locale} className="font-semibold">{dish[locale]}</p><p lang={other} className="text-sm text-ink-muted">{dish[other]}</p>
    </li>)}</ul>
  </section>;
}
