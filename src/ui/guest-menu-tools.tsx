"use client";

import { useEffect, useRef, useState } from "react";

/** Filters server-rendered rows without duplicating the Menu payload in another client island. */
export function MenuTools({ sections, labels, locale, preview = false }: {
  locale: string;
  preview?: boolean;
  sections: { id: string; name: string }[];
  labels: { search: string; all: string; empty: string; sections: string };
}) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [empty, setEmpty] = useState(false);
  const [alternate, setAlternate] = useState<{ locale: string; dishes: Record<string, string> }>();
  const reposition = useRef(false);
  const searching = !!query.trim();
  useEffect(() => {
    if (preview || !searching || alternate?.locale === locale) return;
    // Load matches in the second language on demand to keep the initial Menu within budget.
    const controller = new AbortController();
    fetch(`${location.pathname}/search?language=${locale === "am" ? "en" : "am"}`, { signal: controller.signal })
      .then(async response => {
        if (response.ok) setAlternate({ locale, dishes: await response.json() });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [preview, searching, locale, alternate]);
  useEffect(() => {
    if (preview) return;
    const selectHash = () => {
      if (location.hash === "#menu-search") {
        root.current?.querySelector("input")?.focus();
        return;
      }
      const id = location.hash.replace(/^#section-/, "");
      if (!id || sections.some(item => item.id === id)) { reposition.current = !!id; setSection(id); }
    };
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, [sections, preview]);
  function select(id: string) {
    reposition.current = true;
    if (!preview) history.replaceState(null, "", `${location.pathname}${location.search}${id ? `#section-${id}` : ""}`);
    setSection(id);
    if (id === section) root.current?.scrollIntoView({ block: "start" });
  }
  useEffect(() => {
    const menu = root.current?.closest("[data-menu]");
    if (!menu) return;
    let found = false;
    const term = query.trim().toLocaleLowerCase();
    const alternateDishes = alternate?.locale === locale ? alternate.dishes : undefined;
    menu.querySelectorAll<HTMLElement>("[data-menu-section]").forEach(group => {
      let shown = 0;
      group.querySelectorAll<HTMLElement>("[data-dish-search]").forEach(row => {
        const id = alternateDishes && row.querySelector<HTMLElement>("[data-dish-id]")?.dataset.dishId;
        const visible = (!section || group.dataset.menuSection === section) &&
          `${row.textContent ?? ""} ${id ? alternateDishes[id] ?? "" : ""}`.toLocaleLowerCase().includes(term);
        row.hidden = !visible;
        if (visible) shown++;
      });
      group.hidden = shown === 0;
      if (shown) found = true;
    });
    setEmpty(!found);
    if (reposition.current) {
      reposition.current = false;
      menu.querySelector<HTMLElement>("[data-menu-section]:not([hidden])")?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [query, section, sections, alternate, locale]);
  return <div className="menu-tools" ref={root}>
    <input id={preview ? undefined : "menu-search"} type="search" aria-label={labels.search} placeholder={labels.search} value={query} onChange={e => setQuery(e.target.value)} />
    <nav aria-label={labels.sections}>
      <button type="button" aria-pressed={!section} onClick={() => select("")}>{labels.all}</button>
      {sections.map(s => <a key={s.id} href={`#section-${s.id}`} aria-current={section === s.id ? "true" : undefined} onClick={event => { event.preventDefault(); select(s.id); }}>{s.name}</a>)}
    </nav>
    {empty && <p role="status">{labels.empty}</p>}
  </div>;
}
