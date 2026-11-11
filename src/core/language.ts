/** The languages of the Menu and the interface. */
export const languages = ["am", "en"] as const;
export type Language = (typeof languages)[number];

/** Menu text in both languages. Missing text is "". */
export type Bilingual = Record<Language, string>;

/** The text in `language`, or in the other language when that one is missing, so guests never see a blank. */
export function inLanguage(value: Bilingual, language: Language): string {
  return value[language] || value[language === "am" ? "en" : "am"];
}
