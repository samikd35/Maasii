import { useTranslations } from "next-intl";
import { StaffHeader } from "@/ui/staff-header";
import { lock } from "./actions";

export function WaiterHeader({ scope }: { scope?: string }) {
  const t = useTranslations("StaffWaiter");
  return <StaffHeader home="/staff" label={t("waiter")} workspace scope={scope}>
    <form action={lock}><button type="submit" className="workspace-button">{t("lock")}</button></form>
  </StaffHeader>;
}
