import type { Language } from "@/core";
import am from "../../messages/am.json";
import en from "../../messages/en.json";

/** English is the reference: `pnpm typecheck` fails when am.json lacks a string that en.json has. */
export type Messages = typeof en;

export const messages: Record<Language, Messages> = { am, en };
