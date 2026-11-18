import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Home");
  const staff = useTranslations("Staff");
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-4xl font-semibold">Maasii</h1>
      <p className="mt-3 text-ink-muted">{t("tagline")}</p>
      <a href="/sign-in" className="maasii-button mt-6">{staff("signIn")}</a>
    </main>
  );
}
