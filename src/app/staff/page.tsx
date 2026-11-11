import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getWaiterSession } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { PinField } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { StaffEntry, StaffHeader } from "@/ui/staff-header";
import { lock, unlock } from "./actions";
import { MyTables } from "./my-tables";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffWaiter");
  return { title: `${t("waiter")} · Maasii`, robots: { index: false } };
}

export default async function WaiterPage() {
  const actor = await getSessionActor();
  const device = actor && await getWaiterSession(actor, { unlockToken: await waiterUnlockToken() });
  const t = await getTranslations("StaffWaiter");

  if (device?.status === "locked") {
    return (
      <StaffEntry>
        <h1 className="font-display text-3xl">{t("unlockHeading")}</h1>
        <ActionForm action={unlock} className="mt-6 space-y-4">
          <PinField label={t("pin")} />
          <SubmitButton>{t("unlock")}</SubmitButton>
        </ActionForm>
      </StaffEntry>
    );
  }

  if (device?.status !== "unlocked") {
    const errors = await getTranslations("StaffErrors");
    return (
      <StaffEntry>
        <h1 className="font-display text-3xl">{t("rejoinHeading")}</h1>
        <p className="mt-3" role="alert">{errors("waiterRejoin")}</p>
      </StaffEntry>
    );
  }

  const [locale, { StaffOrders, StaffErrors, Bills }] = await Promise.all([getLocale(), getMessages()]);
  const other = locale === "am" ? "en" : "am";
  return (
    <>
      <StaffHeader home="/staff" label={t("waiter")} />
      <main className="mx-auto max-w-2xl px-5 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 break-words">
            <p className="text-sm text-ink-muted">{device.name}</p>
            <h1 className="font-display text-3xl">{device.venue.name}</h1>
          </div>
          <form action={lock}>
            <SubmitButton variant="quiet">{t("lock")}</SubmitButton>
          </form>
        </div>
        <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Bills }}>
          <MyTables />
        </NextIntlClientProvider>
        {device.dishes.length > 0 && (
          <section className="mt-8" aria-labelledby="staff-menu">
            <h2 id="staff-menu" className="border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("menu")}</h2>
            <ul>
              {device.dishes.map((dish) => (
                <li key={dish.id} className="border-b border-rule py-3">
                  {dish[locale] && <span lang={locale} className="block font-semibold">{dish[locale]}</span>}
                  {dish[other] && <span lang={other} className={dish[locale] ? "block text-sm text-ink-muted" : "block font-semibold"}>{dish[other]}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
