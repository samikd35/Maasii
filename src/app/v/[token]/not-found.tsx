import { useTranslations } from "next-intl";

export default function VenueLinkNotFound() {
  const t = useTranslations("VenueLinkNotFound");
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="font-display text-3xl leading-tight">{t("heading")}</h1>
      <p className="mt-3 text-ink-muted">{t("body")}</p>
    </main>
  );
}
