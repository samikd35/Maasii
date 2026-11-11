"use client";

// The guest menu's one client island: the dish sheet, the docked slip and the Draft sheet.
// Prices and checks come from the Maasii core's browser-safe rules; this file only renders them
// and keeps the Draft in the phone's local storage.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  priceDraft,
  priceDraftLine,
  type DraftLine,
  type DraftLineProblem,
  type DraftMenu,
  type GuestMenuDish,
  type GuestMenuSection,
  type GuestOptionGroup,
  type PricedDraft,
  type PricedDraftLine,
} from "@/core/browser";
import { formatBirr, Price } from "@/ui/price";
import { orderingText as t } from "./ordering-text";

type Line = DraftLine & { lineId: string };
type SheetRequest = { dishId: string } | { lineId: string } | { draft: true };

// ---- The Draft in local storage ----------------------------------------------------------------

const noLines: Line[] = [];
const listeners = new Set<() => void>();
let cached: { raw: string | null; lines: Line[] } = { raw: null, lines: noLines };
let storageUnavailable = false;

const draftKey = (venueLinkToken: string) => `maasii:draft:${venueLinkToken}`;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readDraft(key: string): Line[] {
  if (storageUnavailable) return cached.lines;
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return cached.lines;
  }
  if (raw !== cached.raw) cached = { raw, lines: parseDraft(raw) };
  return cached.lines;
}

function writeDraft(key: string, lines: Line[]) {
  const raw = JSON.stringify(lines);
  cached = { raw, lines };
  try {
    localStorage.setItem(key, raw);
  } catch {
    storageUnavailable = true;
  }
  listeners.forEach((listener) => listener());
}

function parseDraft(raw: string | null): Line[] {
  if (!raw) return noLines;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isLine) : noLines;
  } catch {
    return noLines;
  }
}

function isLine(value: unknown): value is Line {
  const line = value as Partial<Record<keyof Line, unknown>> | null;
  return (
    typeof line?.lineId === "string" &&
    typeof line.dishId === "string" &&
    typeof line.dishName === "string" &&
    typeof line.quantity === "number" &&
    typeof line.note === "string" &&
    Array.isArray(line.choices) &&
    line.choices.every((choice: { choiceId?: unknown; name?: unknown } | null) =>
      typeof choice?.choiceId === "string" && typeof choice.name === "string",
    )
  );
}

const newLineId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---- Opening a dish from its server-rendered row -----------------------------------------------

let openSheet: ((request: SheetRequest) => void) | undefined;

/** An invisible button over a dish row that opens the dish sheet. */
export function OpenDishButton({ dishId, labelledBy, describedBy }: { dishId: string; labelledBy: string; describedBy?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => openSheet?.({ dishId })}
      className="absolute inset-0 w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
    />
  );
}

// ---- The island --------------------------------------------------------------------------------

export function Ordering({ venueLinkToken, sections }: { venueLinkToken: string; sections: GuestMenuSection[] }) {
  const key = draftKey(venueLinkToken);
  const lines = useSyncExternalStore(subscribe, () => readDraft(key), () => noLines);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    openSheet = setSheet;
    return () => {
      openSheet = undefined;
    };
  }, []);

  const menu: DraftMenu = { sections };
  const draft = priceDraft(menu, lines);
  const findDish = (dishId: string) => sections.flatMap((s) => s.dishes).find((d) => d.id === dishId);
  const save = (next: Line[], message: string) => {
    writeDraft(key, next);
    setAnnouncement(message);
  };

  let open: ReactNode = null;
  if (sheet && "dishId" in sheet) {
    const dish = findDish(sheet.dishId);
    if (dish) {
      open = (
        <DishSheet
          key={dish.id}
          menu={menu}
          dish={dish}
          onClose={() => setSheet(null)}
          onSave={(line) => {
            save([...lines, { ...line, lineId: newLineId() }], t.added(dish.name));
            setSheet(null);
          }}
        />
      );
    }
  } else if (sheet && "lineId" in sheet) {
    const index = lines.findIndex((l) => l.lineId === sheet.lineId);
    const dish = index >= 0 ? draft.lines[index].dish : null;
    if (dish) {
      const editing = lines[index];
      open = (
        <DishSheet
          key={editing.lineId}
          menu={menu}
          dish={dish}
          editing={editing}
          notices={draft.lines[index].problems.flatMap((p) => (p.kind === "choice_gone" ? [t.choiceGone(p.choiceName)] : []))}
          onClose={() => setSheet({ draft: true })}
          onSave={(line) => {
            save(lines.map((l) => (l.lineId === editing.lineId ? { ...line, lineId: l.lineId } : l)), t.updated(dish.name));
            setSheet({ draft: true });
          }}
        />
      );
    }
  } else if (sheet && lines.length > 0) {
    open = (
      <DraftSheet
        lines={lines}
        draft={draft}
        onClose={() => setSheet(null)}
        onEdit={(lineId) => setSheet({ lineId })}
        onQuantity={(lineId, quantity) => save(lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)), "")}
        onRemove={(line) => {
          const next = lines.filter((l) => l.lineId !== line.lineId);
          save(next, t.removed(line.dishName));
          if (next.length === 0) setSheet(null);
        }}
        findDish={findDish}
      />
    );
  }

  return (
    <>
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl bg-linear-to-t from-paper via-paper/90 to-transparent px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet({ draft: true })}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-ink px-5 py-2.5 text-left text-paper shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="flex flex-col">
              <span className="font-semibold">
                {t.yourDraft} · {t.dishCount(draft.dishCount)}
              </span>
              {draft.linesNeedingAttention > 0 && (
                <span className="text-sm text-paper/85">{t.needAttention(draft.linesNeedingAttention)}</span>
              )}
            </span>
            <span className="font-semibold whitespace-nowrap tabular-nums">{formatBirr(draft.totalSantim)} ETB</span>
          </button>
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {open}
    </>
  );
}

// ---- Sheets ------------------------------------------------------------------------------------

function Sheet({
  labelledBy,
  onClose,
  footer,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45 open:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      <div className="border-t border-rule bg-paper px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
    </dialog>
  );
}

function SheetHeading({ id, children, onClose }: { id: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 id={id} className="pt-1.5 font-display text-2xl leading-tight">
        {children}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="-mr-2 min-h-11 min-w-11 shrink-0 rounded-full px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ink"
      >
        {t.close}
      </button>
    </div>
  );
}

function DishSheet({
  menu,
  dish,
  editing,
  notices = [],
  onClose,
  onSave,
}: {
  menu: DraftMenu;
  dish: GuestMenuDish;
  editing?: Line;
  notices?: string[];
  onClose: () => void;
  onSave: (line: DraftLine) => void;
}) {
  const [chosen, setChosen] = useState<string[]>(() => editing?.choices.map((c) => c.choiceId) ?? []);
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [note, setNote] = useState(editing?.note ?? "");
  const headingId = useId();
  const hintId = useId();

  const line: DraftLine = {
    dishId: dish.id,
    dishName: dish.name,
    choices: dish.optionGroups
      .flatMap((group) => group.choices)
      .filter((choice) => chosen.includes(choice.id))
      .map((choice) => ({ choiceId: choice.id, name: choice.name })),
    quantity,
    note: note.trim(),
  };
  const priced = priceDraftLine(menu, line);
  const missing = priced.problems.flatMap((p) => (p.kind === "choice_missing" ? [p.optionGroupName] : []));

  const choose = (group: GuestOptionGroup, choiceId: string, on: boolean) =>
    setChosen((ids) => {
      const others =
        group.kind === "choose_one"
          ? ids.filter((id) => !group.choices.some((choice) => choice.id === id))
          : ids.filter((id) => id !== choiceId);
      return on ? [...others, choiceId] : others;
    });

  return (
    <Sheet
      labelledBy={headingId}
      onClose={onClose}
      footer={
        <>
          {missing.length > 0 && (
            <p id={hintId} className="mb-2.5 text-sm font-medium">
              {t.stillToChoose(missing)}
            </p>
          )}
          <div className="flex items-center gap-4">
            <div aria-live="polite" className="min-w-16">
              <span className="sr-only">{t.price} </span>
              <Price santim={priced.totalSantim ?? 0} />
            </div>
            <button
              type="button"
              disabled={priced.problems.length > 0}
              aria-describedby={missing.length > 0 ? hintId : undefined}
              onClick={() => onSave(line)}
              className="min-h-12 flex-1 rounded-xl bg-ink px-5 font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-ink/35"
            >
              {editing ? t.saveChanges : t.addToOrder}
            </button>
          </div>
        </>
      }
    >
      {dish.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dish.photoUrl} alt="" decoding="async" className="aspect-4/3 w-full bg-paper-deep object-cover" />
      )}
      <div className="px-5 pt-4">
        <SheetHeading id={headingId} onClose={onClose}>
          {dish.name}
        </SheetHeading>
        {dish.fasting && (
          <p className="mt-2">
            <span className="inline-flex rounded-full border border-ink/40 px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
              {t.fasting}
            </span>
          </p>
        )}
        {dish.description && <p className="mt-2 leading-snug text-ink-muted">{dish.description}</p>}
        {notices.map((notice) => (
          <p key={notice} className="mt-3 border-l-4 border-ink bg-paper-deep px-3 py-2 text-sm">
            {notice}
          </p>
        ))}
      </div>

      {dish.optionGroups.map((group) => (
        <fieldset key={group.id} className="mt-6 px-5">
          <legend className="text-sm font-semibold tracking-wide uppercase">{group.name}</legend>
          <p className="border-b border-ink/70 pb-1.5 text-xs font-medium text-ink-muted">
            {group.kind === "choose_one" ? t.chooseOne : t.addExtras} · {group.required ? t.required : t.optional}
          </p>
          <ul>
            {group.choices.map((choice) => {
              const on = chosen.includes(choice.id);
              return (
                <li key={choice.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-rule py-2">
                    <input
                      type={group.kind === "choose_one" ? "radio" : "checkbox"}
                      name={group.id}
                      checked={on}
                      onChange={(event) => choose(group, choice.id, event.target.checked)}
                      onClick={() => {
                        if (on && group.kind === "choose_one" && !group.required) choose(group, choice.id, false);
                      }}
                      className="size-5 shrink-0 accent-ink"
                    />
                    <span className="flex-1">{choice.name}</span>
                    {choice.priceChangeSantim > 0 && (
                      <span className="text-sm text-ink-muted tabular-nums">{t.priceChange(formatBirr(choice.priceChangeSantim))}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <label className="mt-6 block px-5">
        <span className="text-sm font-semibold">{t.note}</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={2}
          placeholder={t.notePlaceholder}
          className="mt-1.5 block min-h-11 w-full resize-none rounded-lg border border-ink/30 bg-white/70 px-3 py-2 text-base"
        />
      </label>

      <div className="mt-4 flex items-center justify-between px-5 pb-5">
        <span className="text-sm font-semibold">{t.quantity}</span>
        <QuantityStepper label={t.quantity} value={quantity} onChange={setQuantity} />
      </div>
    </Sheet>
  );
}

function DraftSheet({
  lines,
  draft,
  onClose,
  onEdit,
  onQuantity,
  onRemove,
  findDish,
}: {
  lines: Line[];
  draft: PricedDraft;
  onClose: () => void;
  onEdit: (lineId: string) => void;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: (line: Line) => void;
  findDish: (dishId: string) => GuestMenuDish | undefined;
}) {
  const headingId = useId();
  return (
    <Sheet
      labelledBy={headingId}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            {t.total} · {t.dishCount(draft.dishCount)}
          </span>
          <Price santim={draft.totalSantim} />
        </div>
      }
    >
      <div className="px-5 pt-4">
        <SheetHeading id={headingId} onClose={onClose}>
          {t.yourTable}
        </SheetHeading>
        <h3 className="mt-4 border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">{t.draftHeading}</h3>
        {draft.linesNeedingAttention > 0 && (
          <p className="mt-2 text-sm font-medium">{t.needAttention(draft.linesNeedingAttention)}</p>
        )}
        <ul className="pb-4">
          {lines.map((line, index) => (
            <DraftLineRow
              key={line.lineId}
              line={line}
              priced={draft.lines[index]}
              name={findDish(line.dishId)?.name ?? line.dishName}
              onEdit={() => onEdit(line.lineId)}
              onQuantity={(quantity) => onQuantity(line.lineId, quantity)}
              onRemove={() => onRemove(line)}
            />
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function DraftLineRow({
  line,
  priced,
  name,
  onEdit,
  onQuantity,
  onRemove,
}: {
  line: Line;
  priced: PricedDraftLine;
  name: string;
  onEdit: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const problems = describeProblems(priced.problems);
  return (
    <li className="border-b border-rule py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          {line.choices.length > 0 && <p className="text-sm text-ink-muted">{line.choices.map((c) => c.name).join(", ")}</p>}
          {line.note && <p className="text-sm text-ink-muted italic">“{line.note}”</p>}
        </div>
        {problems.length === 0 && priced.totalSantim !== null && <Price santim={priced.totalSantim} />}
      </div>
      {problems.length > 0 && (
        <p className="mt-2 border-l-4 border-ink bg-paper-deep px-3 py-2 text-sm">{problems.join(" ")}</p>
      )}
      <div className="mt-2 flex items-center gap-1">
        {priced.dish && <QuantityStepper label={`${t.quantity}, ${name}`} value={line.quantity} onChange={onQuantity} />}
        <span className="flex-1" />
        {priced.dish && (
          <button type="button" onClick={onEdit} className={textButton}>
            {t.edit}
          </button>
        )}
        <button type="button" onClick={onRemove} className={textButton}>
          {t.remove}
        </button>
      </div>
    </li>
  );
}

const textButton =
  "min-h-11 min-w-11 rounded-full px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ink";

function describeProblems(problems: DraftLineProblem[]): string[] {
  if (problems.some((p) => p.kind === "dish_gone")) return [t.dishGone];
  const messages = problems.flatMap((p) => {
    switch (p.kind) {
      case "choice_gone":
        return [t.choiceGone(p.choiceName)];
      case "too_many_choices":
        return [t.onlyOneChoice(p.optionGroupName)];
      default:
        return [];
    }
  });
  const missing = problems.flatMap((p) => (p.kind === "choice_missing" ? [p.optionGroupName] : []));
  if (missing.length > 0) messages.push(t.stillToChoose(missing));
  return problems.length > 0 ? [...messages, t.editToFix] : [];
}

function QuantityStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const step = "flex size-11 items-center justify-center rounded-full border border-ink/40 text-xl leading-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-ink";
  return (
    <div role="group" aria-label={label} className="flex items-center">
      <button type="button" aria-label={t.oneFewer} disabled={value <= 1} onClick={() => onChange(value - 1)} className={step}>
        −
      </button>
      <span data-testid="quantity" aria-live="polite" className="w-10 text-center font-semibold tabular-nums">
        {value}
      </span>
      <button type="button" aria-label={t.oneMore} disabled={value >= MAX_QUANTITY} onClick={() => onChange(value + 1)} className={step}>
        +
      </button>
    </div>
  );
}
