"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { getWaiterQuickAdd } from "@/core";
import { MAX_NOTE_LENGTH, MAX_QUANTITY } from "@/core/browser";
import type { Messages } from "@/i18n/messages";
import { Price, formatBirr } from "@/ui/price";
import { WaiterIcon } from "@/ui/waiter-icon";

type Menu = Awaited<ReturnType<typeof getWaiterQuickAdd>>;
const field = "block min-h-11 w-full rounded-xl border border-rule bg-white px-3 text-base";
type Line = { dishId: string; choiceIds: string[]; quantity: number; note: string };
type Draft = { expectedVisitId: string | null; line: Line; requestId?: string };

function readDraft(key: string): Draft | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Draft | null;
    if (!saved?.line || typeof saved.line.dishId !== "string" || !Array.isArray(saved.line.choiceIds)
      || typeof saved.line.note !== "string" || !Number.isInteger(saved.line.quantity)
      || (saved.expectedVisitId !== null && typeof saved.expectedVisitId !== "string")
      || (saved.requestId !== undefined && typeof saved.requestId !== "string")) return;
    return saved;
  } catch {
    return undefined;
  }
}

function subtotalFor(dish: Menu["dishes"][number], { choiceIds, quantity }: Line) {
  const price = dish.optionGroups.flatMap(group => group.choices).reduce(
    (sum, choice) => sum + (choiceIds.includes(choice.choiceId) ? choice.priceChangeSantim : 0), dish.priceSantim,
  );
  return quantity >= 1 && quantity <= MAX_QUANTITY && Number.isInteger(quantity) ? price * quantity : undefined;
}

export function QuickAdd({ table, waiterId, visitId, dishes, recent, returnTo }: Omit<Menu, "scope"> & { returnTo: string }) {
  const t = useTranslations("StaffOrders");
  const errors = useTranslations("StaffErrors");
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dish, selectDish] = useState<Menu["dishes"][number]>();
  const [subtotal, setSubtotal] = useState<number>();
  const [working, setWorking] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<keyof Messages["StaffErrors"] | "decisionError">();
  const [restored, setRestored] = useState<Draft>();
  const last = useRef<Draft | undefined>(undefined);
  const inFlight = useRef(false);
  const storageKey = `maasii:quick-add:v1:${waiterId}:${table.id}`;
  const expectedVisitId = restored ? restored.expectedVisitId : visitId;
  const text = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
  const match = text(query);
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  const rank = (id: string) => recentRank.get(id) ?? recent.length;
  const visible = dishes.filter(({ name }) => text(name.en).includes(match) || text(name.am).includes(match))
    .sort((a, b) => rank(a.dishId) - rank(b.dishId));
  const recentDishes = match ? [] : visible.filter(item => recentRank.has(item.dishId));
  const otherDishes = match ? visible : visible.filter(item => !recentRank.has(item.dishId));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readDraft(storageKey);
      if (!saved || (saved.expectedVisitId !== visitId && !saved.requestId)) return;
      const item = dishes.find(dish => dish.dishId === saved.line.dishId);
      if (!item) return;
      last.current = saved.requestId ? saved : undefined;
      setUncertain(!!saved.requestId);
      setRestored(saved);
      selectDish(item);
      setSubtotal(subtotalFor(item, saved.line));
    });
    return () => cancelAnimationFrame(frame);
  }, [dishes, storageKey, visitId]);

  function save(draft: Draft) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch { /* This draft remains usable without browser storage. */ }
  }

  function discard() {
    try { sessionStorage.removeItem(storageKey); } catch { /* Browser storage may be disabled. */ }
    last.current = undefined;
    setRestored(undefined);
  }

  function readLine(dish: Menu["dishes"][number], form: HTMLFormElement): Line {
    const fields = new FormData(form);
    const choiceIds = [...fields.getAll("extras"), ...dish.optionGroups.filter(({ kind }) => kind === "choose_one")
      .map(({ optionGroupId }) => fields.get(optionGroupId))].filter((value): value is string => typeof value === "string" && !!value);
    return { dishId: dish.dishId, choiceIds, quantity: Number(fields.get("quantity")), note: String(fields.get("note")) };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dish || inFlight.current) return;
    const attempt = last.current ?? { expectedVisitId, line: readLine(dish, event.currentTarget), requestId: crypto.randomUUID() };
    last.current = attempt;
    save(attempt);
    inFlight.current = true;
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch("/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: table.id, expectedVisitId: attempt.expectedVisitId, lines: [attempt.line], action: "quickAdd", requestId: attempt.requestId,
        }),
        signal: AbortSignal.timeout?.(12_000),
      });
      if (response.ok) {
        discard();
        router.replace(returnTo);
        return;
      }
      if (response.status >= 500) throw Error("Dish outcome unknown");
      const result = await response.json().catch(() => ({}));
      last.current = undefined;
      setUncertain(false);
      save({ expectedVisitId: attempt.expectedVisitId, line: attempt.line });
      setError(result.reason ?? "decisionError");
    } catch {
      setUncertain(true);
    }
    inFlight.current = false;
    setWorking(false);
  }

  function dishList(items: Menu["dishes"]) {
    return <ul className="waiter-menu-list divide-y divide-rule">
      {items.map(item => <li key={item.dishId} className="!py-0">
        <button type="button" onClick={() => {
          discard();
          selectDish(item);
          setSubtotal(item.priceSantim);
          save({ expectedVisitId: visitId, line: { dishId: item.dishId, choiceIds: [], quantity: 1, note: "" } });
        }}
          className="flex w-full items-center justify-between gap-3 py-2">
          <span lang={item.name[locale] ? locale : other} className="font-semibold">{item.name[locale] || item.name[other]}
            {item.name[locale] && item.name[other] && <span lang={other} className="block text-sm text-ink-muted">{item.name[other]}</span>}
          </span>
          <Price santim={item.priceSantim} />
        </button>
      </li>)}
    </ul>;
  }

  return (
    <div className="waiter-quick-content space-y-3">
      {dish ? (
        <form onSubmit={submit} onChange={(event) => {
          const line = readLine(dish, event.currentTarget);
          save({ expectedVisitId, line });
          setSubtotal(subtotalFor(dish, line));
        }} className="workspace-panel space-y-3" key={dish.dishId}>
          {restored && <p className="waiter-notice" role="status">{t("quickDraftRestored")}</p>}
          <button type="button" disabled={working || uncertain} onClick={() => {
            discard();
            selectDish(undefined);
            setError(undefined);
          }} className="workspace-button waiter-quiet-action">{t("changeDish")}</button>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {dish.name[locale] || dish.name[other]}
              {dish.name[locale] && dish.name[other] && <span lang={other} className="block text-sm text-ink-muted">{dish.name[other]}</span>}
            </h2>
            <Price santim={dish.priceSantim} />
          </div>
          <fieldset className="space-y-3" disabled={working || uncertain}>
            {dish.optionGroups.map((group) => {
              const name = group.name[locale] || group.name[other];
              const optionLabel = (choice: typeof group.choices[number]) =>
                (choice.name[locale] || choice.name[other]) + (choice.priceChangeSantim ? ` (+${formatBirr(choice.priceChangeSantim)})` : "");
              return group.kind === "choose_one" ? (
                <label key={group.optionGroupId} className="block text-sm font-medium">{name}
                  <select name={group.optionGroupId} className={field} required={group.required}
                    defaultValue={group.choices.find(choice => restored?.line.choiceIds.includes(choice.choiceId))?.choiceId ?? ""}>
                    <option value="" disabled={group.required}>{t(group.required ? "chooseOption" : "noOption")}</option>
                    {group.choices.map((choice) => <option key={choice.choiceId} value={choice.choiceId}>{optionLabel(choice)}</option>)}
                  </select>
                </label>
              ) : (
                <fieldset key={group.optionGroupId} className="waiter-options">
                  <legend className="text-sm font-medium">{name}</legend>
                  {group.choices.map((choice) => (
                    <label className="flex min-h-11 items-center gap-2 text-sm" key={choice.choiceId}>
                      <input className="size-5" type="checkbox" name="extras" value={choice.choiceId}
                        defaultChecked={restored?.line.choiceIds.includes(choice.choiceId)} /> {optionLabel(choice)}
                    </label>
                  ))}
                </fieldset>
              );
            })}
            <label className="block text-sm font-medium">{t("quantity")}
              <input className={field} name="quantity" type="number" inputMode="numeric" min="1" max={MAX_QUANTITY}
                defaultValue={restored ? restored.line.quantity || "" : 1} required />
            </label>
            <label className="block text-sm font-medium">{t("orderNote")}
              <input className={field} name="note" maxLength={MAX_NOTE_LENGTH} defaultValue={restored?.line.note} />
            </label>
          </fieldset>
          {uncertain && <p role="status" className="waiter-notice" data-tone="warning">{t("quickAddUnknown")}</p>}
          {error && <p role="alert" className="text-sm font-medium text-red-800">{error === "decisionError" ? t(error) : errors(error)}</p>}
          <div className="waiter-task-footer waiter-commit">
            {subtotal !== undefined && <p aria-live="polite" className="waiter-quick-total"><span>{t("quickSubtotal")}</span><Price santim={subtotal} /></p>}
            <button type="submit" className="workspace-button workspace-primary" disabled={working}>
              <WaiterIcon name={uncertain ? "undo" : "plus"} />{t(working ? "addingOrder" : uncertain ? "retryAddOrder" : "addOrder", { number: table.number })}
            </button>
          </div>
        </form>
      ) : (
        <>
          <label className="waiter-search text-sm font-medium"><span>{t("searchDishes")}</span>
            <span className="waiter-search-field"><WaiterIcon name="search" />
              <input type="search" className="workspace-input" value={query} onChange={event => setQuery(event.target.value)} />
            </span>
          </label>
          {visible.length === 0 && <p className="text-ink-muted">{t("noDishes")}</p>}
          {recentDishes.length > 0 && <section className="mt-5"><h2>{t("recentDishes")}</h2>{dishList(recentDishes)}</section>}
          {otherDishes.length > 0 && <section className="mt-5">
            {!match && <h2>{t("allDishes")}</h2>}
            {dishList(otherDishes)}
          </section>}
        </>
      )}
    </div>
  );
}
