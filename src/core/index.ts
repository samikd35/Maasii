// The Maasii core's public interface. Screens, scripts and tests import only from "@/core".
// Every command and query takes the calling Actor first and runs in one database transaction.

export { adminActor, publicActor, staffActor, systemActor, type Actor } from "./actor";
export { MaasiiError, type MaasiiErrorCode } from "./errors";

export {
  addTables,
  createBrand,
  createVenue,
  listBrands,
  type Brand,
  type BrandSummary,
  type Table,
  type Venue,
} from "./brands";
export { parseStaffContact, type StaffContact } from "./contact";
export {
  acceptInvitation,
  addBrandOwner,
  addPlatformAdmin,
  getInvitation,
  getMyAccess,
  inviteOwner,
  type Invitation,
  type InvitationStatus,
  type MyAccess,
  type NewInvitation,
  type StaffRole,
} from "./staff";
export {
  getPublishedMenu,
  publishMenu,
  type GuestMenu,
  type GuestMenuDish,
  type GuestMenuSection,
  type MenuInput,
  type PublishedMenuVersion,
} from "./menu";
