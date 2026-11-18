import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getWaiterSession } from "@/core";
import { orderPushConfig } from "@/lib/order-push-config";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { PinField } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { StaffEntry, StaffHeader } from "@/ui/staff-header";
import { lock, unlock } from "./actions";
import { MyTables } from "./my-tables";
import { MenuReference } from "./menu-reference";
import Link from "next/link";
import { Notifications } from "./notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffWaiter");
  return { title: `${t("waiter")} · Maasii`, robots: { index: false } };
}

export default async function WaiterPage({ searchParams }: PageProps<"/staff">) {
  const params = await searchParams;
  const showMenu = params.view === "menu";
  const table = z.uuid().safeParse(params.table);
  const actor = await getSessionActor();
  const device = actor && await getWaiterSession(actor, { unlockToken: await waiterUnlockToken() });
  const t = await getTranslations("StaffWaiter");

  if (device?.status === "locked") {
    return (
      <StaffEntry>
        <h1 className="font-sans text-3xl">{t("unlockHeading")}</h1>
        <ActionForm action={unlock} className="mt-6 space-y-4">
          {table.success && <input name="tableId" type="hidden" value={table.data} />}
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
        <h1 className="font-sans text-3xl">{t("rejoinHeading")}</h1>
        <p className="mt-3" role="alert">{errors("waiterRejoin")}</p>
      </StaffEntry>
    );
  }

  if (table.success) redirect(`/staff/tables/${table.data}`);

  const [locale, { StaffOrders, StaffErrors, Bills }] = await Promise.all([getLocale(), getMessages()]);

  const push = orderPushConfig();
  const vapidKey = push?.waiterIds && !push.waiterIds.includes(device.waiterId) ? undefined : push?.publicKey;

  return (
    <>
      <StaffHeader home="/staff" label={t("waiter")} />
      <main className="staff-workspace mx-auto max-w-2xl px-5 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 break-words">
            <p className="text-sm text-ink-muted">{device.name}</p>
            <h1 className="font-sans text-3xl">{device.venue.name}</h1>
          </div>
          <form action={lock}>
            <SubmitButton variant="quiet">{t("lock")}</SubmitButton>
          </form>
        </div>
        <nav className="task-nav my-4 flex gap-3" aria-label={t("waiter")}>
          <Link href="/staff" aria-current={!showMenu ? "page" : undefined}>{t("queue")}</Link>
          <Link href="/staff?view=menu" aria-current={showMenu ? "page" : undefined}>{t("menu")}</Link>
        </nav>
        {showMenu ? <MenuReference dishes={device.dishes} locale={locale} title={t("menu")} search={t("searchMenu")} empty={t("noMatches")} /> :
          <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Bills }}>
            <Notifications vapidKey={vapidKey} subscribed={device.hasPush} />
            <MyTables />
          </NextIntlClientProvider>}
      </main>
    </>
  );
}
