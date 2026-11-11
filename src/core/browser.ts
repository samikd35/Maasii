// The part of the Maasii core that is safe to run on a guest's phone: pure rules with no database
// access. Client components import it as "@/core/browser"; everything else uses "@/core".

export {
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  priceDraft,
  priceDraftLine,
  type DraftLine,
  type DraftLineProblem,
  type DraftMenu,
  type PricedDraft,
  type PricedDraftLine,
} from "./draft";
export type {
  GuestMenu,
  GuestMenuDish,
  GuestMenuSection,
  GuestOptionChoice,
  GuestOptionGroup,
} from "./menu";
export { deriveBrandTheme, displayFonts, type DisplayFont } from "./brand-theme";
