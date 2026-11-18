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
import { StaffEntry } from "@/ui/staff-header";
import { unlock } from "./actions";
import { MyTables } from "./my-tables";
import { MenuReference } from "./menu-reference";
import Link from "next/link";
import { Notifications } from "./notifications";
import { WaiterHeader } from "./waiter-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffWaiter");
  return { title: `${t("waiter")} · Maasii`, robots: { index: false } };
}

export default async function WaiterPage({ searchParams }: PageProps<"/staff">) {
  const params = await searchParams;
  const showMenu = params.view === "menu";
  const showTables = params.view === "tables";
  const number = typeof params.number === "string" && /^\d{1,9}$/.test(params.number) ? params.number : "";
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
      <WaiterHeader scope={`${device.venue.name} · ${device.name}`} />
      <main id="workspace-content" tabIndex={-1} className="workspace-frame workspace-waiter">
        <nav className="workspace-nav waiter-nav" aria-label={t("waiter")}>
          <Link href="/staff" aria-current={!showMenu && !showTables ? "page" : undefined}>{t("queue")}</Link>
          <Link href="/staff?view=tables" aria-current={showTables ? "page" : undefined}>{t("tables")}</Link>
          <Link href="/staff?view=menu" aria-current={showMenu ? "page" : undefined}>{t("menu")}</Link>
        </nav>
        {showMenu ? <MenuReference dishes={device.dishes} locale={locale} title={t("menu")} search={t("searchMenu")} empty={t("noMatches")} /> :
          <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Bills }}>
            <MyTables tables={showTables} number={number} tools={<Notifications vapidKey={vapidKey} subscribed={device.hasPush} />} />
          </NextIntlClientProvider>}
      </main>
    </>
  );
}
