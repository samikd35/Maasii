import { z } from "zod";

/** The languages of the Menu and the interface. */
export const languages = ["am", "en"] as const;
export type Language = (typeof languages)[number];

/** Menu text in both languages. Missing text is "". */
export type Bilingual = Record<Language, string>;

const text = z.string().trim().default("");

// Accept plain English text from existing Menu callers.
export const bilingualInput = z.union([
  z.object({ am: text, en: text }),
  z.string().trim().transform((en) => ({ en, am: "" })),
]);

export const bilingualNameInput = bilingualInput.refine((name) => name.am !== "" || name.en !== "", {
  message: "Give a name in Amharic or English.",
});

/** The text in `language`, or in the other language when that one is missing, so guests never see a blank. */
export function inLanguage(value: Bilingual, language: Language): string {
  return value[language] || value[language === "am" ? "en" : "am"];
}
