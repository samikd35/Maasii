import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { listFastingPeriods, MaasiiError, type FastingPeriod } from "@/core";
import { requireAdmin } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { removePeriod, savePeriod } from "./actions";

async function load() {
  const actor = await requireAdmin();
  try {
    return await listFastingPeriods(actor);
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function FastingCalendarPage() {
  const [periods, t, locale] = await Promise.all([load(), getTranslations("StaffAdmin"), getLocale()]);
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });

  return (
    <>
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {t("allBrands")}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{t("fastingCalendar")}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t("calendarRules")}</p>

      <section aria-labelledby="add-period" className="mt-6 rounded-md border border-rule p-4">
        <h2 id="add-period" className="mb-3 font-semibold">{t("addPeriodHeading")}</h2>
        <PeriodForm period={null} />
      </section>

      {periods.map((period) => {
        const { startsOn, endsOn, fasting } = period;
        return (
          <article key={`${startsOn}-${endsOn}-${fasting}`} className="mt-4 rounded-md border border-rule p-4">
            <h2 className="font-semibold">{t(fasting ? "fastingSeason" : "nonFastingException")}</h2>
            <p className="mt-1 text-sm">
              <time dateTime={startsOn}>{format.format(new Date(startsOn))}</time>
              {endsOn !== startsOn && <> – <time dateTime={endsOn}>{format.format(new Date(endsOn))}</time></>}
            </p>
            <details className="mt-2 border-t border-rule">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium underline">{t("editPeriod")}</summary>
              <PeriodForm period={period} />
            </details>
            <ActionForm action={removePeriod.bind(null, period)} className="mt-2">
              <SubmitButton variant="quiet">{t("removePeriod")}</SubmitButton>
            </ActionForm>
          </article>
        );
      })}
    </>
  );
}

async function PeriodForm({ period }: { period: FastingPeriod | null }) {
  const t = await getTranslations("StaffAdmin");
  return (
    <ActionForm action={savePeriod.bind(null, period)} className="space-y-3">
      <label className="block text-sm font-medium">
        {t("periodKind")}
        <select
          name="kind"
          defaultValue={period?.fasting === false ? "exception" : "season"}
          className="mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base font-normal"
        >
          <option value="season">{t("fastingSeason")}</option>
          <option value="exception">{t("nonFastingException")}</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("startsOn")} name="startsOn" type="date" defaultValue={period?.startsOn} required />
        <Field label={t("endsOn")} name="endsOn" type="date" defaultValue={period?.endsOn} required />
      </div>
      <SubmitButton>{t(period ? "savePeriod" : "addPeriod")}</SubmitButton>
    </ActionForm>
  );
}
