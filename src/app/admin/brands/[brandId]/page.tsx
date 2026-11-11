import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getBrandOwners, MaasiiError, type Actor } from "@/core";
import { requireAdmin } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { inviteBrandOwner } from "../../actions";

async function load(actor: Actor, brandId: string) {
  try {
    return await getBrandOwners(actor, { brandId });
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function AdminBrandPage({ params }: PageProps<"/admin/brands/[brandId]">) {
  const { brandId } = await params;
  const { brand, owners, invitations } = await load(await requireAdmin(), brandId);
  const t = await getTranslations("StaffAdmin");
  const staff = await getTranslations("Staff");

  return (
    <>
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {t("allBrands")}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{brand.name}</h1>
      {/* A document navigation reaches the audit transaction on every open. */}
      <a
        href={`/admin/brands/${brand.id}/support`}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline"
      >
        {t("openSupport")}
      </a>

      <section aria-labelledby="owners" className="mt-8">
        <h2 id="owners" className="border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">
          {t("owners")}
        </h2>
        {owners.length === 0 ? (
          <p className="py-3 text-ink-muted">{t("noOwner")}</p>
        ) : (
          <ul>
            {owners.map((owner) => (
              <li key={owner.userId} className="flex min-h-12 items-center border-b border-rule">
                {owner.name ?? staff("owner")}
              </li>
            ))}
          </ul>
        )}
      </section>

      {invitations.length > 0 && (
        <section aria-labelledby="waiting" className="mt-8">
          <h2 id="waiting" className="border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">
            {staff("waiting")}
          </h2>
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.invitationId} className="border-b border-rule py-2 text-sm">
                {invitation.name} · <span className="break-all">{invitation.contact}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ActionForm action={inviteBrandOwner.bind(null, brand.id)} className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold">{t("inviteHeading")}</h2>
        <Field label={staff("name")} name="name" autoComplete="off" required />
        <Field label={staff("emailOrPhone")} name="contact" autoComplete="off" required />
        <SubmitButton>{t("inviteOwner")}</SubmitButton>
      </ActionForm>
    </>
  );
}
