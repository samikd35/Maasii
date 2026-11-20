import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/lib/sign-out";
import { SubmitButton } from "@/ui/staff-forms";

export async function WaiterAccess({ workspace }: { workspace: "brand" | "venue" }) {
  const t = await getTranslations("StaffWorkspaceAccess");
  return (
    <div className="workspace-panel max-w-lg">
      <h1>{t("heading")}</h1>
      <p className="mt-2 text-ink-muted">{t(workspace === "brand" ? "brandRequiresOwner" : "venueRequiresManagerOrOwner")}</p>
      <div className="workspace-actions mt-5">
        <form action={signOut} aria-labelledby="switch-staff-account">
          <SubmitButton><span id="switch-staff-account">{t("switchAccount")}</span></SubmitButton>
        </form>
        <Link href="/staff" className="workspace-link">{t("backToWaiter")}</Link>
      </div>
    </div>
  );
}
