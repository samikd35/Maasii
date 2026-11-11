// The Maasii core's public interface. Screens, scripts and tests import only from "@/core".
// Every command and query takes the calling Actor first and runs in one database transaction.

export { publicActor, staffActor, systemActor, type Actor } from "./actor";
export { MaasiiError, type MaasiiErrorCode } from "./errors";
export { languages, type Bilingual, type Language } from "./language";

export { addTables, createBrand, createVenue, type Brand, type Table, type Venue } from "./brands";
export { addBrandOwner } from "./staff";
export {
  getPublishedMenu,
  publishMenu,
  type GuestMenu,
  type GuestMenuDish,
  type GuestMenuSection,
  type MenuInput,
  type PublishedMenuVersion,
} from "./menu";
