export type MaasiiErrorCode = "not_allowed" | "not_found" | "invalid_input";

/** A refusal the caller can act on, as opposed to a bug or an outage. */
export class MaasiiError extends Error {
  constructor(
    readonly code: MaasiiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaasiiError";
  }
}
