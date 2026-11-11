// The Maasii core's public interface. Screens, scripts and tests import only from "@/core".
// Every command and query takes the calling Actor first and runs in one database transaction.

export { adminActor, publicActor, staffActor, systemActor, type Actor } from "./actor";
export { MaasiiError, type MaasiiErrorCode } from "./errors";
export { languages, type Bilingual, type Language } from "./language";
export { deriveBrandTheme, displayFonts, type DisplayFont } from "./brand-theme";

export {
  addTables,
  createBrand,
  createVenue,
  getVenueLink,
  getVenueSetup,
  listBrands,
  renumberTable,
  setTableActive,
  type Brand,
  type BrandSummary,
  type Table,
  type Venue,
  type VenueLink,
  type VenueSetup,
  type VenueTable,
} from "./brands";
export { parseStaffContact, type StaffContact } from "./contact";
export {
  acceptInvitation,
  addBrandOwner,
  addPlatformAdmin,
  getBrandOwners,
  getInvitation,
  getMyAccess,
  getVenueStaff,
  inviteManager,
  inviteOwner,
  type BrandOwners,
  type Invitation,
  type InvitationStatus,
  type MyAccess,
  type NewInvitation,
  type StaffRole,
  type VenueStaff,
} from "./staff";
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
export {
  getPublishedMenu,
  publishMenu,
  type GuestMenu,
  type GuestMenuDish,
  type GuestMenuSection,
  type GuestOptionChoice,
  type GuestOptionGroup,
  type MenuInput,
  type OptionGroupInput,
  type PublishedMenuVersion,
} from "./menu";
