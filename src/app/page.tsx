import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Home");
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="font-display text-4xl">Maasii</h1>
      <p className="mt-3 text-ink-muted">{t("tagline")}</p>
    </main>
  );
}
