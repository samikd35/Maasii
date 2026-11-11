// The Maasii core's public interface. Screens, scripts and tests import only from "@/core".
// Every command and query takes the calling Actor first and runs in one database transaction.

export { adminActor, adminSupportActor, guestActor, publicActor, staffActor, systemActor, type Actor, type GuestActor, type StaffActor } from "./actor";
export { MaasiiError, type MaasiiErrorCode } from "./errors";
export { languages, type Bilingual, type Language } from "./language";
export { brandArtworkMimeTypes, MAX_BRAND_ARTWORK_BYTES } from "./brand-artwork";
export { deriveBrandTheme, displayFonts, type DisplayFont } from "./brand-theme";
export { recordBrowsingEvent } from "./browsing-events";
export { addFastingPeriod, listFastingPeriods, removeFastingPeriod, updateFastingPeriod, type FastingPeriod } from "./fasting-calendar";
export { listBrandSupportOpenings, openBrandSupport } from "./admin-support";

export {
  addTables,
  createBrand,
  createVenue,
  getBranding,
  getVenueLink,
  getVenueSetup,
  listBrands,
  renumberTable,
  setTableActive,
  updateBranding,
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
  getStaffLanguage,
  getVenueStaff,
  hasAuthSession,
  inviteManager,
  inviteOwner,
  updateStaffLanguage,
  type BrandOwners,
  type Invitation,
  type InvitationStatus,
  type MyAccess,
  type NewInvitation,
  type StaffRole,
  type VenueStaff,
} from "./staff";
export {
  createWaiterJoinCode,
  getWaiterJoinCode,
  getWaiterSession,
  joinWaiter,
  lockWaiter,
  removeWaiter,
  unlockWaiter,
  WAITER_JOIN_MINUTES,
  type WaiterSession,
} from "./waiters";
export { endShift, getResponsibleWaiter, getRunningShift, getShiftSetup, reassignTable, setUsualTables, startShift, type Shift } from "./shifts";
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
  getMenuDraft,
  getPublishedMenu,
  importMenuPhotos,
  MAX_MENU_IMPORT_PHOTOS,
  publishMenu,
  publishMenuDraft,
  saveMenuDraft,
  suggestMenuTranslations,
  uploadDishPhoto,
  type GuestMenu,
  type GuestMenuDish,
  type GuestMenuSection,
  type GuestOptionChoice,
  type GuestOptionGroup,
  type MenuDraft,
  type MenuDraftContent,
  type MenuInput,
  type OptionGroupInput,
  type PublishedMenuVersion,
} from "./menu";
export type { MenuDraftModel } from "./menu-ai";
export {
  addPaymentOption,
  listPaymentOptionChanges,
  listPaymentOptions,
  MAX_PAYMENT_QR_BYTES,
  paymentOptionKinds,
  paymentQrMimeTypes,
  removePaymentOption,
  updatePaymentOption,
  type PaymentOption,
  type PaymentOptionChange,
  type PaymentOptionKind,
} from "./payment-options";
export { getVenueMenuSettings, listVenueDishChanges, setVenueDishPrice, setVenueDishSoldOut, type VenueMenuDish } from "./venue-menu";
export { acceptOrder, declineOrder, escalateOrders, getGuestOrders, getGuestPendingOrders, getGuestVisit, getMyTableOrders, getOrderService, sendOrder, undoOrderDecision, type Order } from "./orders";
export { consumeOrderNotificationWake, removeWaiterPushSubscription, sendOrderNotifications, setWaiterPushSubscription, type OrderNotification } from "./order-notifications";
export { confirmPayment, flagUnconfirmedBills, getPreparedBills, prepareBill, reopenBill, type Bill, type PreparedBill, type PaymentConfirmation } from "./bills";
export { getGuestReviewForm, getWaiterRatings, submitGuestReview, type GuestReviewForm } from "./reviews";
export { getVenueInsights, updateVenueService, type ServicePeriod } from "./insights";
