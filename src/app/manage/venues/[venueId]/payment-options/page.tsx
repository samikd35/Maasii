import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, useFormatter, useTranslations } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import {
  getVenueSetup,
  listPaymentOptionChanges,
  listPaymentOptions,
  MaasiiError,
  MAX_PAYMENT_QR_BYTES,
  paymentDestinationFields,
  paymentOptionKinds,
  paymentQrMimeTypes,
  type PaymentOption,
  type PaymentOptionChange,
} from "@/core";
import { requireStaff } from "@/lib/session";
import { PaymentOptionValues } from "@/ui/payment-option-values";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { changeActive, remove } from "./actions";
import { OptionForm } from "./option-fields";

const reviewFields = [...paymentDestinationFields, "displayOrder", "active"] as const;
const formFields = { kinds: paymentOptionKinds, qrAccept: paymentQrMimeTypes.join(","), maxQrBytes: MAX_PAYMENT_QR_BYTES, reviewFields };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PaymentOptions");
  return { title: `${t("title")} · Maasii` };
}

async function load(venueId: string) {
  const actor = await requireStaff();
  try {
    const setup = await getVenueSetup(actor, { venueId });
    const [options, changes] = await Promise.all([
      listPaymentOptions(actor, { venueId }),
      setup.isOwner ? listPaymentOptionChanges(actor, { venueId }) : [],
    ]);
    return { setup, options: setup.isOwner ? options : options.filter(option => option.active), changes };
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function PaymentOptionsPage({ params }: PageProps<"/manage/venues/[venueId]/payment-options">) {
  const { venueId } = await params;
  const { setup: { venue, isOwner }, options, changes } = await load(venueId);
  const [t, manage, { PaymentOptions, StaffForms, StaffErrors }] = await Promise.all([
    getTranslations("PaymentOptions"), getTranslations("ManagerWorkspace"), getMessages(),
  ]);
  const nextOrder = Math.min((options.at(-1)?.displayOrder ?? 0) + 1, 2_147_483_647);

  return (
    <NextIntlClientProvider messages={{ PaymentOptions, StaffForms, StaffErrors }}>
      <Link className="workspace-link manager-back" href={"/manage/venues/" + venueId}>
        <WaiterIcon name="back" />{manage("setupBack")}
      </Link>
      <div className="manager-row-heading">
        <h1>{t("title")}</h1>
        {!isOwner && <span className="manager-chip" data-tone="live">{manage("paymentCount", { count: options.length })}</span>}
      </div>
      {!isOwner && <p className="manager-muted mt-2">{t("managedByOwner")}</p>}
      {isOwner && <p className="manager-muted mt-2">{t("venueScope", { venue: venue.name })}</p>}
      {isOwner && <section aria-labelledby="add-payment-option" className="workspace-panel workspace-section">
        <details open={options.length === 0}>
          <summary id="add-payment-option" className="workspace-summary manager-disclosure"><WaiterIcon name="plus" />{t("addHeading")}</summary>
          <OptionForm venueId={venueId} venueName={venue.name} defaultOrder={nextOrder} key={options.length} {...formFields} />
        </details>
      </section>}

      {options.length === 0 && <p className="mt-4 text-ink-muted">{t("empty")}</p>}
      {options.map((option) => (
        <OptionRow key={option.id} option={option} isOwner={isOwner} venueName={venue.name} />
      ))}

      {isOwner && <ChangeLog changes={changes} />}
    </NextIntlClientProvider>
  );
}

function OptionRow({ option, isOwner, venueName }: { option: PaymentOption; isOwner: boolean; venueName: string }) {
  const t = useTranslations("PaymentOptions");
  const manage = useTranslations("StaffManage");
  const target = { venueId: option.venueId, paymentOptionId: option.id, revision: option.revision };
  const name = option.provider ?? t(option.kind);
  const activeLabel = manage(option.active ? "deactivate" : "reactivate");
  return (
    <article aria-labelledby={`payment-${option.id}`} className="mt-4 workspace-panel">
      <div className="manager-row-heading">
        <h2 id={`payment-${option.id}`} className="text-lg font-semibold break-words">{name}</h2>
        {isOwner && <span className="manager-chip" data-tone={option.active ? "live" : undefined}>
          <WaiterIcon name={option.active ? "check" : "clock"} />{t(option.active ? "active" : "inactive")}
        </span>}
      </div>
      <PaymentOptionValues option={option} compact />
      {isOwner && (
        <>
          <details className="mt-2 border-t border-rule">
            <summary className="workspace-summary manager-disclosure"><WaiterIcon name="receipt" />{t("edit")}</summary>
            <OptionForm venueId={option.venueId} venueName={venueName}
              option={option} defaultOrder={option.displayOrder} {...formFields} />
          </details>
          <details>
            <summary className="workspace-summary manager-disclosure"><WaiterIcon name="more" />{t("actions")}</summary>
            <div className="workspace-actions">
              {option.active ? <ActionForm action={changeActive.bind(null, target, false, false)} confirmLabel={activeLabel}
                confirmMessage={t("deactivateHelp", { name, venue: venueName })}>
                <SubmitButton variant="secondary">{activeLabel}</SubmitButton>
              </ActionForm> : <OptionForm key={option.revision} venueId={option.venueId} venueName={venueName}
                option={option} defaultOrder={option.displayOrder} {...formFields} activate />}
              <ActionForm action={remove.bind(null, target)} confirmLabel={t("remove")} confirmMessage={t("removeHelp", { name, venue: venueName })}>
                <SubmitButton variant="destructive">{t("remove")}</SubmitButton>
              </ActionForm>
            </div>
          </details>
        </>
      )}
    </article>
  );
}

function ChangeLog({ changes }: { changes: PaymentOptionChange[] }) {
  const t = useTranslations("PaymentOptions");
  const format = useFormatter();
  return (
    <section aria-labelledby="payment-option-changes" className="mt-8 border-t border-rule pt-4">
      <h2 id="payment-option-changes" className="text-lg font-semibold">{t("history")}</h2>
      {changes.length === 0 && <p className="mt-2 text-ink-muted">{t("noChanges")}</p>}
      {changes.map((change) => {
        const option = (change.after ?? change.before)!;
        const { before, after } = change;
        const changedFields = before && after && reviewFields.filter(field => before[field] !== after[field])
          .map(field => t(field === "active" ? "status" : field === "qrImage" ? "qrLabel" : field));
        return (
          <details key={change.id} className="border-b border-rule">
            <summary className="min-h-11 cursor-pointer py-3 text-sm">
              <span className="font-semibold">{t(!change.before ? "added" : !change.after ? "removed" : "edited")}</span>
              {" · "}{option.provider ?? t(option.kind)}
              <span className="block break-all text-ink-muted">
                <time dateTime={change.changedAt.toISOString()}>
                {format.dateTime(change.changedAt, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Addis_Ababa" })}
                </time>
                {" · "}{change.actorName ?? change.actorUserId?.slice(0, 8) ?? t("system")}
              </span>
              {changedFields && changedFields.length > 0 && <span className="block text-ink-muted">{changedFields.join(" · ")}</span>}
            </summary>
            <div className="payment-review-grid pb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t("before")}</h3>
                <PaymentOptionValues option={change.before} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t("after")}</h3>
                <PaymentOptionValues option={change.after} />
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
