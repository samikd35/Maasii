import { useLocale, useTranslations } from "next-intl";
import { LANGUAGE_COOKIE, locales, type Area } from "@/i18n/config";
import { LanguageForm } from "./language-form";

/**
 * The አማ/EN switch. Pass the area and its Server Action, which handles the switch when
 * JavaScript is off: `<LanguageSwitch area="guest" action={setGuestLanguage} />`.
 */
export function LanguageSwitch({ area, action }: { area: Area; action: (formData: FormData) => Promise<void> }) {
  const t = useTranslations("LanguageSwitch");
  const current = useLocale();
  return (
    // System fonts here, so the "አማ" label never makes an English page download the Ethiopic web font.
    <LanguageForm
      action={action}
      cookieName={LANGUAGE_COOKIE[area]}
      role="group"
      aria-label={t("label")}
      className="flex font-system"
    >
      {locales.map((language) => (
        <button
          key={language}
          name="language"
          value={language}
          lang={language}
          aria-pressed={language === current}
          className="min-h-11 min-w-11 border border-ink/25 px-2 text-sm font-semibold first:rounded-l-full last:rounded-r-full aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {t(language)}
        </button>
      ))}
    </LanguageForm>
  );
}
