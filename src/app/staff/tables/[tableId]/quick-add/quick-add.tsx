"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { getWaiterQuickAdd } from "@/core";
import { MAX_NOTE_LENGTH, MAX_QUANTITY } from "@/core/browser";
import type { Messages } from "@/i18n/messages";
import { Price, formatBirr } from "@/ui/price";

type Menu = Awaited<ReturnType<typeof getWaiterQuickAdd>>;
const field = "block min-h-11 w-full rounded-md border border-rule bg-white px-3 text-base";

export function QuickAdd({ table, dishes, recent }: Menu) {
  const t = useTranslations("StaffOrders");
  const errors = useTranslations("StaffErrors");
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dish, selectDish] = useState<Menu["dishes"][number]>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<keyof Messages["StaffErrors"] | "decisionError">();
  const last = useRef<{ payload: string; id: string } | null>(null);
  const text = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
  const match = text(query);
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  const rank = (id: string) => recentRank.get(id) ?? recent.length;
  const visible = dishes.filter(({ name }) => text(name.en).includes(match) || text(name.am).includes(match))
    .sort((a, b) => rank(a.dishId) - rank(b.dishId));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dish || working) return;
    const form = new FormData(event.currentTarget);
    const choices = [...form.getAll("extras"), ...dish.optionGroups.filter(({ kind }) => kind === "choose_one")
      .map(({ optionGroupId }) => form.get(optionGroupId))].filter(Boolean);
    const payload = {
      tableId: table.id,
      lines: [{ dishId: dish.dishId, choiceIds: choices, quantity: Number(form.get("quantity")), note: String(form.get("note")) }],
    };
    const encoded = JSON.stringify(payload);
    if (last.current?.payload !== encoded) last.current = { payload: encoded, id: crypto.randomUUID() };
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch("/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: "quickAdd", requestId: last.current.id }),
      });
      if (response.ok) {
        router.replace(`/staff/tables/${table.id}`);
        return;
      }
      const result = await response.json().catch(() => ({}));
      setError(result.reason ?? "decisionError");
    } catch {
      setError("decisionError");
    }
    setWorking(false);
  }

  return (
    <div className="mt-5 space-y-3">
      {error && <p role="alert" className="text-sm font-medium">{error === "decisionError" ? t(error) : errors(error)}</p>}
      {dish ? (
        <form onSubmit={submit} className="space-y-3" key={dish.dishId}>
          <button type="button" disabled={working} onClick={() => { selectDish(undefined); setError(undefined); }} className="min-h-11 text-sm font-semibold underline">{t("changeDish")}</button>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {dish.name[locale] || dish.name[other]}
              {dish.name[locale] && dish.name[other] && <span lang={other} className="block text-sm text-ink-muted">{dish.name[other]}</span>}
            </h2>
            <Price santim={dish.priceSantim} />
          </div>
          {dish.optionGroups.map((group) => {
            const name = group.name[locale] || group.name[other];
            const optionLabel = (choice: typeof group.choices[number]) =>
              (choice.name[locale] || choice.name[other]) + (choice.priceChangeSantim ? ` (+${formatBirr(choice.priceChangeSantim)})` : "");
            return group.kind === "choose_one" ? (
              <label key={group.optionGroupId} className="block text-sm font-medium">{name}
                <select name={group.optionGroupId} className={field} required={group.required} defaultValue="">
                  <option value="" disabled={group.required}>{t(group.required ? "chooseOption" : "noOption")}</option>
                  {group.choices.map((choice) => <option key={choice.choiceId} value={choice.choiceId}>{optionLabel(choice)}</option>)}
                </select>
              </label>
            ) : (
              <fieldset key={group.optionGroupId} className="border-t border-rule pt-1">
                <legend className="text-sm font-medium">{name}</legend>
                {group.choices.map((choice) => (
                  <label className="flex min-h-11 items-center gap-2 text-sm" key={choice.choiceId}>
                    <input className="size-5" type="checkbox" name="extras" value={choice.choiceId} /> {optionLabel(choice)}
                  </label>
                ))}
              </fieldset>
            );
          })}
          <label className="block text-sm font-medium">{t("quantity")}
            <input className={field} name="quantity" type="number" inputMode="numeric" min="1" max={MAX_QUANTITY} defaultValue="1" required />
          </label>
          <label className="block text-sm font-medium">{t("orderNote")}
            <input className={field} name="note" maxLength={MAX_NOTE_LENGTH} />
          </label>
          <button className="min-h-11 rounded-md bg-ink px-4 font-semibold text-paper disabled:opacity-60" disabled={working}>
            {t("addOrder")}
          </button>
        </form>
      ) : (
        <>
          <label className="block text-sm font-medium">{t("searchDishes")}
            <input type="search" className={field} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {visible.length === 0 && <p className="text-ink-muted">{t("noDishes")}</p>}
          <ul className="divide-y divide-rule">
            {visible.map((item) => (
              <li key={item.dishId}>
                <button type="button" onClick={() => selectDish(item)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-start">
                  <span className="font-medium">{item.name[locale] || item.name[other]}
                    {item.name[locale] && item.name[other] && <span lang={other} className="block text-sm text-ink-muted">{item.name[other]}</span>}
                  </span>
                  <Price santim={item.priceSantim} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
