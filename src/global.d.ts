import type { Language } from "@/core";
import type { Messages } from "@/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: Language;
    Messages: Messages;
  }
}
