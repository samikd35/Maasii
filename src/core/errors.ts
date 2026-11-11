export type MaasiiErrorCode = "not_allowed" | "not_found" | "invalid_input";

type RefusalReason =
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
  | "paymentDestinationRequired"
  | "paymentOptionChanged"
  | "paymentCodeConfirmationRequired";

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
