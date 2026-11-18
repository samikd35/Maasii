import "@/app/staff.css";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { setStaffLanguage } from "@/i18n/actions";
import { signOut } from "@/lib/sign-out";
import { LanguageSwitch } from "./language-switch";

/** The top bar of every management and platform admin screen. */
export function StaffHeader({ home, label, workspace, scope, children }: {
  home: string; label: string; workspace?: boolean; scope?: string; children?: ReactNode;
}) {
  const t = useTranslations("Staff");
  const account = <>
    <LanguageSwitch area="staff" action={setStaffLanguage} />
    <form action={signOut}>
      <button type="submit" className="min-h-11 min-w-11 px-2 text-sm font-medium underline">{t("signOut")}</button>
    </form>
  </>;
  return (
    <header className="staff-header">
      {workspace && <a href="#workspace-content" className="workspace-skip">{t("skip")}</a>}
      <div className={workspace ? "workspace-header" : "mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-3 px-5 py-1"}>
        <div className="min-w-0">
          <Link href={home} className="workspace-wordmark inline-flex min-h-11 flex-wrap items-center gap-x-2 font-display text-xl font-semibold">
            Maasii <span className="text-sm font-normal text-ink-muted">{label}</span>
          </Link>
          {scope && <p className="pb-2 text-sm text-ink-muted">{scope}</p>}
        </div>
        {workspace ? <div className="workspace-account">
          {children}
          <details>
            <summary className="workspace-summary">{t("account")}</summary>
            <div className="workspace-account-panel">{account}</div>
          </details>
        </div> : <div className="flex items-center gap-1">{account}</div>}
      </div>
    </header>
  );
}

export async function StaffFormMessages({ children }: { children: ReactNode }) {
  const { StaffForms, StaffErrors } = await getMessages();
  return <NextIntlClientProvider messages={{ StaffForms, StaffErrors }}>{children}</NextIntlClientProvider>;
}

export function StaffEntry({ children }: { children: ReactNode }) {
  return (
    <StaffFormMessages>
      <main className="staff-entry mx-auto max-w-sm px-5 pt-5 pb-12">
        <div className="mb-5 flex justify-end">
          <LanguageSwitch area="staff" action={setStaffLanguage} />
        </div>
        {children}
      </main>
    </StaffFormMessages>
  );
}

export async function StaffNotFound() {
  const t = await getTranslations("StaffErrors");
  return <h1 className="font-display text-3xl">{t("not_found")}</h1>;
}
