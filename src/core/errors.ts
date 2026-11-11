export type MaasiiErrorCode = "not_allowed" | "not_found" | "invalid_input";

type RefusalReason =
  | "invalidFastingDates"
  | "fastingPeriodExists"
  | "invalidBrandArtwork"
  | "invalidContact"
  | "invalidTableNumber"
  | "tableNumberTaken"
  | "invitationNotFound"
  | "invitationAccepted"
  | "invitationRevoked"
  | "invitationExpired"
  | "invitationWrongPerson"
  | "existingAccountPassword"
  | "shortPassword"
  | "invalidPin"
  | "waiterNameRequired"
  | "waiterJoinInvalid"
  | "waiterJoinUsed"
  | "waiterJoinExpired"
  | "waiterRejoin"
  | "wrongPin"
  | "paymentDestinationRequired"
  | "paymentOptionChanged"
  | "paymentCodeConfirmationRequired"
  | "shiftAlreadyRunning"
  | "shiftChanged"
  | "menuAiFailed"
  | "menuAiNoDishes"
  | "menuAiPhotos"
  | "menuAiReview"
  | "menuAiText"
  | "menuDraftChanged"
  | "menuDraftInvalid"
  | "noRunningShift"
  | "orderTableUnavailable"
  | "orderDraftChanged"
  | "orderRequestConflict"
  | "billPrepared"
  | "orderTableBillPrepared";

/** A refusal the caller can act on, as opposed to a bug or an outage. */
export class MaasiiError extends Error {
  constructor(
    readonly code: MaasiiErrorCode,
    message: string,
    readonly reason?: RefusalReason,
  ) {
    super(message);
    this.name = "MaasiiError";
  }
}
