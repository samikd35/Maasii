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
  paymentOptionKinds,
  paymentQrMimeTypes,
  type PaymentOption,
  type PaymentOptionChange,
} from "@/core";
import { requireStaff } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { changeActive, remove, savePaymentOption } from "./actions";
import { OptionFields } from "./option-fields";

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
    return { setup, options, changes };
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function PaymentOptionsPage({ params }: PageProps<"/manage/venues/[venueId]/payment-options">) {
  const { venueId } = await params;
  const { setup: { venue, isOwner }, options, changes } = await load(venueId);
  const t = await getTranslations("PaymentOptions");
  const { PaymentOptions, StaffForms, StaffErrors } = await getMessages();
  const nextOrder = Math.min((options.at(-1)?.displayOrder ?? 0) + 1, 2_147_483_647);

  return (
    <NextIntlClientProvider messages={{ PaymentOptions, StaffForms, StaffErrors }}>
      <Link href={`/manage/venues/${venueId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {venue.name}
      </Link>
      <h1 className="font-display text-3xl">{t("title")}</h1>

      {options.length === 0 && <p className="mt-4 text-ink-muted">{t("empty")}</p>}
      {options.map((option) => (
        <OptionRow key={option.id} option={option} isOwner={isOwner} />
      ))}

      {isOwner && (
        <>
          <section aria-labelledby="add-payment-option" className="mt-8 border-t border-rule pt-4">
            <h2 id="add-payment-option" className="mb-4 text-lg font-semibold">{t("addHeading")}</h2>
            <OptionForm venueId={venueId} defaultOrder={nextOrder} key={options.length} />
          </section>
          <ChangeLog changes={changes} />
        </>
      )}
    </NextIntlClientProvider>
  );
}

function OptionRow({ option, isOwner }: { option: PaymentOption; isOwner: boolean }) {
  const t = useTranslations("PaymentOptions");
  const manage = useTranslations("StaffManage");
  const target = { venueId: option.venueId, paymentOptionId: option.id, revision: option.revision };
  return (
    <article aria-labelledby={`payment-${option.id}`} className="mt-4 rounded-md border border-rule p-4">
      <h2 id={`payment-${option.id}`} className="text-lg font-semibold break-words">{option.provider ?? t(option.kind)}</h2>
      <OptionValues option={option} />
      {isOwner && (
        <>
          <details className="mt-2 border-t border-rule">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium underline">{t("edit")}</summary>
            <OptionForm venueId={option.venueId} option={option} defaultOrder={option.displayOrder} />
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={changeActive.bind(null, target, !option.active)}>
              <SubmitButton variant="quiet">{manage(option.active ? "deactivate" : "reactivate")}</SubmitButton>
            </ActionForm>
            <ActionForm action={remove.bind(null, target)}>
              <SubmitButton variant="quiet">{t("remove")}</SubmitButton>
            </ActionForm>
          </div>
        </>
      )}
    </article>
  );
}

function OptionForm({ venueId, option, defaultOrder }: { venueId: string; option?: PaymentOption; defaultOrder: number }) {
  const t = useTranslations("PaymentOptions");
  const target = option
    ? { paymentOptionId: option.id, revision: option.revision, accountOrMerchantCode: option.accountOrMerchantCode }
    : null;
  return (
    <ActionForm action={savePaymentOption.bind(null, venueId, target)} className="space-y-3">
      <OptionFields
        key={option?.revision}
        option={option && { ...option, qrImage: Boolean(option.qrImage) }}
        kinds={paymentOptionKinds}
        qrAccept={paymentQrMimeTypes.join(",")}
        maxQrBytes={MAX_PAYMENT_QR_BYTES}
        defaultOrder={defaultOrder}
      />
      <SubmitButton>{t(option ? "save" : "add")}</SubmitButton>
    </ActionForm>
  );
}

function OptionValues({ option }: { option: PaymentOption | null }) {
  const t = useTranslations("PaymentOptions");
  if (!option) return <p className="text-sm text-ink-muted">{t("noValue")}</p>;
  const fields = [
    [t("kind"), t(option.kind)],
    [t("provider"), option.provider],
    [t("recipientName"), option.recipientName],
    [t("accountOrMerchantCode"), option.accountOrMerchantCode],
    [t("displayOrder"), option.displayOrder],
    [t("status"), t(option.active ? "active" : "inactive")],
  ];
  return (
    <>
      <dl className="mt-2 space-y-1 text-sm">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-all">{value ?? t("noValue")}</dd>
          </div>
        ))}
      </dl>
      {option.qrImage && (
        // The uploaded raster QR is already a bounded data URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.qrImage} alt={t("qrAlt")} width={128} height={128} loading="lazy" className="mt-2 h-auto max-w-full border border-rule" />
      )}
    </>
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
        return (
          <details key={change.id} className="border-b border-rule">
            <summary className="min-h-11 cursor-pointer py-3 text-sm">
              <span className="font-semibold">{t(!change.before ? "added" : !change.after ? "removed" : "edited")}</span>
              {" · "}{option.provider ?? t(option.kind)}
              <span className="block break-all text-ink-muted">
                <time dateTime={change.changedAt.toISOString()}>
                  {format.dateTime(change.changedAt, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </time>
                {" · "}{change.actorName ?? change.actorUserId ?? t("system")}
              </span>
            </summary>
            <div className="grid grid-cols-2 gap-4 pb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t("before")}</h3>
                <OptionValues option={change.before} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t("after")}</h3>
                <OptionValues option={change.after} />
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
