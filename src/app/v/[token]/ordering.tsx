"use client";

// The guest menu's one client island: the dish sheet, the docked slip and the Draft sheet.
// Prices and checks come from the Maasii core's browser-safe rules; this file only renders them
// and keeps the Draft in the phone's local storage.
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  priceDraft,
  priceDraftLine,
  type DraftLine,
  type DraftLineProblem,
  type DraftMenu,
  type GuestMenuDish,
  type GuestOptionGroup,
  type PricedDraft,
  type PricedDraftLine,
} from "@/core/browser";
import { DraftSlipContents, draftSlipClass } from "@/ui/draft-slip";
import { ServingPhoto } from "@/ui/serving-photo";
function PhotoDetail({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  return photoUrl ? <ServingPhoto src={photoUrl} alt={name} className="aspect-4/3 max-h-80 w-full object-cover" /> : null;
}
function ServingMedia(props: { photoUrl: string | null; videoUrl?: string | null; name: string; playLabel: string }) {
  const [Player, setPlayer] = useState<typeof import("@/ui/guest-serving-media").ServingMedia>();
  useEffect(() => {
    let mounted = true;
    void import("@/ui/guest-serving-media").then(module => { if (mounted) setPlayer(() => module.ServingMedia); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  return Player ? <Player {...props} /> : <PhotoDetail {...props} />;
}
import { formatBirr, Price } from "@/ui/price";
import { draftKey, hasUnsavedDraft, readDraft, useDraft, writeDraft, type Line } from "./draft-store";
import type { SlipService } from "./order-service";

type SheetRequest = { dishId: string } | { lineId: string } | { draft: true; target?: "order" | "bill" };

const newLineId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// One shared controller keeps server-rendered dish rows small.
let openSheet: ((dishId: string) => void) | undefined;
export function OpenDishButton({ dishId, labelledBy, describedBy }: { dishId: string; labelledBy: string; describedBy?: string }) {
  return <button type="button" aria-haspopup="dialog" aria-labelledby={labelledBy} aria-describedby={describedBy}
    ref={button => { if (button) button.dataset.dishId = dishId; }}
    onClick={event => { event.currentTarget.focus({ preventScroll: true }); openSheet?.(dishId); }}
    className="dish-choose focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" />;
}

// ---- The island --------------------------------------------------------------------------------

// This module's memory survives a locale refresh and is recreated on a document load.
let browsingPage: { venueLinkToken: string; pageLoadId: string } | undefined;

function sendBrowsingEvent(venueLinkToken: string, pageLoadId: string, dishId?: string) {
  void fetch(`/v/${encodeURIComponent(venueLinkToken)}/browsing-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    priority: "low",
    body: JSON.stringify({ kind: dishId ? "dish_opened" : "menu_opened", pageLoadId, dishId }),
  }).catch(() => {});
}

export function Ordering({ venueLinkToken, sections, recordBrowsing, preview = false, orderService, initialView, initialDish }: {
  venueLinkToken: string;
  sections: DraftMenu["sections"];
  recordBrowsing: boolean;
  preview?: boolean;
  orderService?: boolean;
  initialView?: "order" | "bill";
  initialDish?: string;
}) {
  const t = useTranslations("Ordering");
  const router = useRouter();
  const key = draftKey(venueLinkToken);
  const lines = useDraft(preview ? undefined : key);
  const [sheet, setSheet] = useState<SheetRequest | null>(() => initialView ? { draft: true, target: initialView } : initialDish ? { dishId: initialDish } : null);
  const storageUnavailable = hasUnsavedDraft(key);
  const [announcement, setAnnouncement] = useState("");
  const [Service, setService] = useState<typeof import("./order-service").default>();
  const [serviceFailed, setServiceFailed] = useState(false);
  const slipButton = useRef<HTMLButtonElement>(null);
  const serviceKey = `maasii:orders:${venueLinkToken}`;
  const showSlip = !!sheet && "draft" in sheet;
  const loadService = useCallback(() => {
    void import("./order-service").then(({ default: service }) => setService(() => service)).catch(() => setServiceFailed(true));
  }, []);
  useEffect(() => {
    if (preview || Service || !orderService) return;
    let remembered = false;
    try {
      remembered = !!localStorage.getItem(serviceKey);
    } catch {}
    if (showSlip || remembered) loadService();
  }, [preview, Service, orderService, serviceKey, showSlip, loadService]);

  useEffect(() => {
    if (recordBrowsing && browsingPage?.venueLinkToken !== venueLinkToken) {
      const pageLoadId = globalThis.crypto?.randomUUID?.();
      if (pageLoadId) {
        browsingPage = { venueLinkToken, pageLoadId };
        sendBrowsingEvent(venueLinkToken, pageLoadId);
      }
    }

    openSheet = (dishId) => {
      setSheet({ dishId });
      if (recordBrowsing && browsingPage?.venueLinkToken === venueLinkToken) {
        sendBrowsingEvent(venueLinkToken, browsingPage.pageLoadId, dishId);
      }
    };
    return () => { openSheet = undefined; };
  }, [recordBrowsing, venueLinkToken]);

  const menu: DraftMenu = { sections };
  const draft = priceDraft(menu, lines);
  const findDish = (dishId: string) => sections.flatMap((s) => s.dishes).find((d) => d.id === dishId);
  const save = (next: Line[], message: string) => {
    writeDraft(key, next);
    setAnnouncement(message);
  };

  const clearSentLines = useCallback((sent: Line[]) => {
    const sentIds = new Set(sent.map(({ lineId }) => lineId));
    writeDraft(key, readDraft(key).filter(({ lineId }) => !sentIds.has(lineId)));
  }, [key]);

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
          onSave={preview ? undefined : (line) => {
            save([...lines, { ...line, lineId: newLineId() }], t("added", { dish: dish.name }));
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
          notices={draft.lines[index].problems.flatMap((p) => (p.kind === "choice_gone" ? [t("choiceGone", { choice: p.choiceName })] : []))}
          onClose={() => setSheet({ draft: true })}
          onSave={(line) => {
            save(lines.map((l) => (l.lineId === editing.lineId ? { ...line, lineId: l.lineId } : l)), t("updated", { dish: dish.name }));
            setSheet({ draft: true });
          }}
        />
      );
    }
  }

  function slip(service?: SlipService) {
    const hasSlip = lines.length > 0 || !!service?.tableLabel || serviceFailed || showSlip;
    return hasSlip && (
      <>
        <div className="draft-dock fixed inset-x-0 z-20 mx-auto max-w-xl px-3 py-2">
          <button
            ref={slipButton}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet({ draft: true })}
            className={draftSlipClass}
          >
            <DraftSlipContents
              dishCount={draft.dishCount}
              linesNeedingAttention={draft.linesNeedingAttention}
              totalSantim={draft.totalSantim}
              tableLabel={service?.tableLabel}
              status={service?.status}
            />
          </button>
        </div>
        {showSlip && (
          <DraftSheet
            invoker={slipButton}
            lines={lines}
            draft={draft}
            service={service}
            serviceFallback={!preview && orderService && !Service && (
              <div className="mt-3">
                <p role={serviceFailed ? "alert" : undefined}>{t(serviceFailed ? storageUnavailable ? "serviceUnsaved" : "serviceFailed" : "serviceLoading")}</p>
                {serviceFailed && (
                  <>
                    <button type="button" className={textButton} onClick={() => { setServiceFailed(false); loadService(); }}>{t("retryService")}</button>
                    {!storageUnavailable && <button type="button" className={textButton} onClick={() => window.location.reload()}>{t("reloadService")}</button>}
                  </>
                )}
              </div>
            )}
            onClose={() => {
              setSheet(null);
              if (initialView) router.replace(location.pathname + location.hash, { scroll: false });
            }}
            onEdit={(lineId) => setSheet({ lineId })}
            onQuantity={(lineId, quantity) => save(lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)), "")}
            onRemove={(line) => {
              const next = lines.filter((l) => l.lineId !== line.lineId);
              save(next, t("removed", { dish: findDish(line.dishId)?.name ?? line.dishName }));
              if (next.length === 0 && !service?.tableLabel) setSheet(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {!preview && Service && orderService ? (
        <Service
          key={serviceKey}
          storageKey={serviceKey}
          venueLinkToken={venueLinkToken}
          lines={lines}
          invalidDraft={draft.linesNeedingAttention > 0}
          target={showSlip ? sheet.target : undefined}
          onSent={clearSentLines}
          render={slip}
        />
      ) : slip()}
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
  dismissOnBack = false,
  invoker,
  onClose,
  footer,
  children,
}: {
  labelledBy: string;
  dismissOnBack?: boolean;
  invoker?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dismissOnBack) return;
    const key = crypto.randomUUID();
    history.pushState({ ...history.state, maasiiDish: key }, "");
    const dialog = ref.current!;
    const back = () => dialog.close();
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (history.state?.maasiiDish === key) history.back();
    };
  }, [dismissOnBack]);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    // Lazy service loading can replace the slip button. Establish the current invoker
    // before opening so the browser can return focus to a connected element.
    invoker?.current?.focus({ preventScroll: true });
    if (!dialog.open) dialog.showModal();
    // Close before React removes the node, so native focus restoration also covers Save and Edit.
    return () => dialog.close();
  }, [invoker]);
  useEffect(() => {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    const dialog = ref.current!;
    const outside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let pressedOutside = false;
    const down = (event: PointerEvent) => { pressedOutside = outside(event); };
    const up = (event: PointerEvent) => { if (pressedOutside && outside(event)) dialog.close(); pressedOutside = false; };
    dialog.addEventListener("pointerdown", down);
    dialog.addEventListener("pointerup", up);
    return () => {
      dialog.removeEventListener("pointerdown", down);
      dialog.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      closedby="any"
      aria-labelledby={labelledBy}
      onClose={onClose}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45 open:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="border-t border-rule bg-paper px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </dialog>
  );
}

function SheetHeading({ id, children, onClose }: { id: string; children: ReactNode; onClose: () => void }) {
  const t = useTranslations("Ordering");
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
        {t("close")}
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
  onSave?: (line: DraftLine) => void;
}) {
  const t = useTranslations("Ordering");
  const price = useTranslations("Price");
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
      dismissOnBack
      labelledBy={headingId}
      onClose={onClose}
      footer={
        <>
          {missing.length > 0 && (
            <p id={hintId} className="mb-2.5 text-sm font-medium">
              {t("stillToChoose", { groups: missing.join(", ") })}
            </p>
          )}
          <div className="flex items-center gap-4">
            <div aria-live="polite" className="min-w-16">
              <span className="sr-only">{t("price")} </span>
              <Price santim={priced.totalSantim ?? 0} />
            </div>
            <button
              type="button"
              disabled={!onSave || priced.problems.length > 0}
              aria-describedby={missing.length > 0 ? hintId : undefined}
              onClick={() => onSave?.(line)}
              className="min-h-12 flex-1 rounded-xl bg-brand-readable px-5 font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-ink/35"
            >
              {editing ? t("saveChanges") : t("addToOrder")}
            </button>
          </div>
        </>
      }
    >
      {dish.videoUrl ? <ServingMedia photoUrl={dish.photoUrl} videoUrl={dish.videoUrl} name={dish.name} playLabel={t("playVideo")} /> : <PhotoDetail photoUrl={dish.photoUrl} name={dish.name} />}
      <div className="px-5 pt-4">
        <SheetHeading id={headingId} onClose={onClose}>
          {dish.name}
        </SheetHeading>
        {dish.fasting && (
          <p className="mt-2">
            <span className="inline-flex rounded-full border border-ink/40 px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
              {t("fasting")}
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
            {group.kind === "choose_one" ? t("chooseOne") : t("addExtras")} · {group.required ? t("required") : t("optional")}
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
                      <span className="text-sm text-ink-muted tabular-nums">+{formatBirr(choice.priceChangeSantim)} {price("currency")}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <label className="mt-6 block px-5">
        <span className="text-sm font-semibold">{t("note")}</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={2}
          placeholder={t("notePlaceholder")}
          className="mt-1.5 block min-h-11 w-full resize-none rounded-lg border border-ink/30 bg-white/70 px-3 py-2 text-base"
        />
      </label>

      <div className="mt-4 flex items-center justify-between px-5 pb-5">
        <span className="text-sm font-semibold">{t("quantity")}</span>
        <QuantityStepper label={t("quantity")} value={quantity} onChange={setQuantity} />
      </div>
    </Sheet>
  );
}

function DraftSheet({
  invoker,
  lines,
  draft,
  service,
  serviceFallback,
  onClose,
  onEdit,
  onQuantity,
  onRemove,
}: {
  invoker: RefObject<HTMLButtonElement | null>;
  lines: Line[];
  draft: PricedDraft;
  service?: SlipService;
  serviceFallback?: ReactNode;
  onClose: () => void;
  onEdit: (lineId: string) => void;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: (line: Line) => void;
}) {
  const t = useTranslations("Ordering");
  const headingId = useId();
  return (
    <Sheet
      invoker={invoker}
      labelledBy={headingId}
      onClose={onClose}
      footer={(lines.length > 0 || service?.locked || service?.canChangeTable || serviceFallback) && (
        <>
          {lines.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t("total")} · {t("dishCount", { count: draft.dishCount })}</span>
              <Price santim={draft.totalSantim} />
            </div>
          )}
          {service?.controls}
          {serviceFallback}
        </>
      )}
    >
      <div className="px-5 pt-4">
        <SheetHeading id={headingId} onClose={onClose}>
          {service?.tableLabel ? `${t("yourTable")} · ${service.tableLabel}` : t("yourTable")}
        </SheetHeading>
        {service?.notices}
        {lines.length > 0 && (
          <>
            <h3 className="mt-4 border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">{t("draftHeading")}</h3>
            {draft.linesNeedingAttention > 0 && (
              <p className="mt-2 text-sm font-medium">{t("needAttention", { count: draft.linesNeedingAttention })}</p>
            )}
            <ul className="pb-4">
              {lines.map((line, index) => (
                <DraftLineRow
                  key={line.lineId}
                  line={line}
                  priced={draft.lines[index]}
                  locked={service?.locked}
                  onEdit={() => onEdit(line.lineId)}
                  onQuantity={(quantity) => onQuantity(line.lineId, quantity)}
                  onRemove={() => onRemove(line)}
                />
              ))}
            </ul>
          </>
        )}
        {service?.tableChoices}
        {service?.orders}
      </div>
    </Sheet>
  );
}

function DraftLineRow({
  line,
  priced,
  locked,
  onEdit,
  onQuantity,
  onRemove,
}: {
  line: Line;
  priced: PricedDraftLine;
  locked?: boolean;
  onEdit: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Ordering");
  const problems = describeProblems(priced.problems, t);
  const name = priced.dish?.name ?? line.dishName;
  const offered = priced.dish?.optionGroups.flatMap((group) => group.choices) ?? [];
  const choices = line.choices.map((choice) => offered.find(({ id }) => id === choice.choiceId)?.name ?? choice.name);
  return (
    <li className="border-b border-rule py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          {choices.length > 0 && <p className="text-sm text-ink-muted">{choices.join(", ")}</p>}
          {line.note && <p className="text-sm text-ink-muted italic">“{line.note}”</p>}
        </div>
        {problems.length === 0 && priced.totalSantim !== null && <Price santim={priced.totalSantim} />}
      </div>
      {problems.length > 0 && (
        <p className="mt-2 border-l-4 border-ink bg-paper-deep px-3 py-2 text-sm">{problems.join(" ")}</p>
      )}
      {!locked && (
        <div className="mt-2 flex items-center gap-1">
          {priced.dish && <QuantityStepper label={t("dishQuantity", { dish: name })} value={line.quantity} onChange={onQuantity} />}
          <span className="flex-1" />
          {priced.dish && (
            <button type="button" onClick={onEdit} className={textButton}>
              {t("edit")}
            </button>
          )}
          <button type="button" onClick={onRemove} className={textButton}>
            {t("remove")}
          </button>
        </div>
      )}
    </li>
  );
}

const textButton =
  "min-h-11 min-w-11 rounded-full px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ink";

function describeProblems(
  problems: DraftLineProblem[],
  t: ReturnType<typeof useTranslations<"Ordering">>,
): string[] {
  if (problems.some((p) => p.kind === "dish_gone")) return [t("dishGone")];
  const messages = problems.flatMap((p) => {
    switch (p.kind) {
      case "choice_gone":
        return [t("choiceGone", { choice: p.choiceName })];
      case "too_many_choices":
        return [t("onlyOneChoice", { group: p.optionGroupName })];
      default:
        return [];
    }
  });
  const missing = problems.flatMap((p) => (p.kind === "choice_missing" ? [p.optionGroupName] : []));
  if (missing.length > 0) messages.push(t("stillToChoose", { groups: missing.join(", ") }));
  return problems.length > 0 ? [...messages, t("editToFix")] : [];
}

function QuantityStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const t = useTranslations("Ordering");
  const step = "flex size-11 items-center justify-center rounded-full border border-ink/40 text-xl leading-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-ink";
  return (
    <div role="group" aria-label={label} className="flex items-center">
      <button type="button" aria-label={t("oneFewer")} disabled={value <= 1} onClick={() => onChange(value - 1)} className={step}>
        −
      </button>
      <span data-testid="quantity" aria-live="polite" className="w-10 text-center font-semibold tabular-nums">
        {value}
      </span>
      <button type="button" aria-label={t("oneMore")} disabled={value >= MAX_QUANTITY} onClick={() => onChange(value + 1)} className={step}>
        +
      </button>
    </div>
  );
}
