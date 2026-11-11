import { z } from "zod";
import { MaasiiError } from "./errors";

/** Parses a command's input, refusing it with the first problem in plain words. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new MaasiiError("invalid_input", parsed.error.issues[0]?.message ?? "That is not valid.");
  }
  return parsed.data;
}
