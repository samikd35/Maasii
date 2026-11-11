// The guest's Draft: dishes picked on this phone but not yet sent. These rules are pure, so they
// run on the guest's phone (through "@/core/browser") and on the server alike. Never import the
// database here.
import type { GuestMenu, GuestMenuDish } from "./menu";

/** The published Menu content a Draft is priced against. */
export type DraftMenu = Pick<GuestMenu, "sections">;

/**
 * One dish in a Draft. Names are kept as the guest saw them, so a line can still be described
 * after the Menu changes under it.
 */
export type DraftLine = {
  dishId: string;
  dishName: string;
  choices: { choiceId: string; name: string }[];
  quantity: number;
  note: string;
};

export type DraftLineProblem =
  /** The dish is no longer on the published Menu. */
  | { kind: "dish_gone" }
  /** A chosen option is no longer offered with this dish. */
  | { kind: "choice_gone"; choiceId: string; choiceName: string }
  /** A required "choose one" group has no choice yet. */
  | { kind: "choice_missing"; optionGroupId: string; optionGroupName: string }
  /** A "choose one" group has more than one choice. */
  | { kind: "too_many_choices"; optionGroupId: string; optionGroupName: string }
  | { kind: "quantity_out_of_range" }
  | { kind: "note_too_long" };

export const MAX_QUANTITY = 99;
export const MAX_NOTE_LENGTH = 140;

export type PricedDraftLine = {
  /** The published dish, or null when it is no longer on the Menu. */
  dish: GuestMenuDish | null;
  /** The dish's price plus the price changes of the chosen options that are still offered. */
  unitPriceSantim: number | null;
  totalSantim: number | null;
  /** Empty when the line can be sent as it is. */
  problems: DraftLineProblem[];
};

export type PricedDraft = {
  lines: PricedDraftLine[];
  /** Portions across every line, as shown on the docked slip. */
  dishCount: number;
  /** The total of the lines that can be sent as they are. */
  totalSantim: number;
  linesNeedingAttention: number;
};

/** Prices a whole Draft from the published Menu. */
export function priceDraft(menu: DraftMenu, lines: DraftLine[]): PricedDraft {
  const priced = lines.map((line) => priceDraftLine(menu, line));
  const ready = priced.filter((line) => line.problems.length === 0);
  return {
    lines: priced,
    dishCount: lines.reduce((count, line) => count + line.quantity, 0),
    totalSantim: ready.reduce((total, line) => total + line.totalSantim!, 0),
    linesNeedingAttention: priced.length - ready.length,
  };
}

/** Prices one Draft line from the published Menu and says what, if anything, is wrong with it. */
export function priceDraftLine(menu: DraftMenu, line: DraftLine): PricedDraftLine {
  const dish = menu.sections.flatMap((section) => section.dishes).find((d) => d.id === line.dishId);
  if (!dish) return { dish: null, unitPriceSantim: null, totalSantim: null, problems: [{ kind: "dish_gone" }] };

  const offered = new Map(dish.optionGroups.flatMap((group) => group.choices).map((choice) => [choice.id, choice]));
  const problems: DraftLineProblem[] = line.choices
    .filter((choice) => !offered.has(choice.choiceId))
    .map((choice) => ({ kind: "choice_gone", choiceId: choice.choiceId, choiceName: choice.name }));

  const chosen = new Set(line.choices.map((c) => c.choiceId));
  for (const group of dish.optionGroups) {
    if (group.kind !== "choose_one") continue;
    const count = group.choices.filter((choice) => chosen.has(choice.id)).length;
    const about = { optionGroupId: group.id, optionGroupName: group.name };
    if (count === 0 && group.required) problems.push({ kind: "choice_missing", ...about });
    if (count > 1) problems.push({ kind: "too_many_choices", ...about });
  }
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
    problems.push({ kind: "quantity_out_of_range" });
  }
  if (line.note.length > MAX_NOTE_LENGTH) problems.push({ kind: "note_too_long" });

  const unitPriceSantim = [...chosen]
    .map((id) => offered.get(id)?.priceChangeSantim ?? 0)
    .reduce((price, change) => price + change, dish.priceSantim);
  return { dish, unitPriceSantim, totalSantim: unitPriceSantim * line.quantity, problems };
}
