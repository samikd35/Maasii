import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StaffHeader } from "@/ui/staff-header";
import { WaiterIcon } from "@/ui/waiter-icon";
import { lock } from "./actions";

export function WaiterHeader({ scope, accountTools }: { scope?: string; accountTools?: ReactNode }) {
  const t = useTranslations("StaffWaiter");
  return <StaffHeader home="/staff" label={t("waiter")} workspace
    title={<><span className="waiter-brand">Maasii</span>{scope && <span className="waiter-scope">{scope}</span>}</>}
    accountTools={accountTools} accountHint={accountTools && <span className="waiter-alert-hint">{t("alertsOff")}</span>} className="waiter-header">
    <form action={lock}><button type="submit" className="workspace-button"><WaiterIcon name="lock" />{t("lock")}</button></form>
  </StaffHeader>;
}
