import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getVenueInsights, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { saveServiceSettings } from "./actions";

const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base";
const experience = ["great", "okay", "needs_work"] as const;
const dishChoices = ["yes", "maybe", "no"] as const;

export default async function InsightsPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/insights">) {
  const { venueId } = await params;
  const query = await searchParams;
  const actor = await requireStaff();
  const report = await getVenueInsights(actor, { venueId, week: typeof query.week === "string" ? query.week : undefined }).catch((error) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, locale, format] = await Promise.all([getTranslations("Insights"), getLocale(), getFormatter()]);
  const other = locale === "am" ? "en" : "am";
  const rows = report.settings?.periods ?? [];
  const rate = (count: number, total: number) => total ? format.number(count / total, { style: "percent", maximumFractionDigits: 0 }) : "—";

  return (
    <>
      <Link href={`/manage/venues/${venueId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">{report.venueName}</Link>
      <h1 className="font-display text-3xl">{t("title")}</h1>
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("settings")}</summary>
        <ActionForm action={saveServiceSettings.bind(null, venueId)} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <TimeField name="opensAt" label={t("opens")} value={report.settings?.hours.opensAt} required />
            <TimeField name="closesAt" label={t("closes")} value={report.settings?.hours.closesAt} required />
          </div>
          {rows.map((period, index) => (
            <fieldset className="space-y-2 border-t border-rule py-3" key={index}>
              <legend className="text-sm font-semibold">{period.name}</legend>
              <label className="block text-sm font-medium">{t("periodName")} <input name="periodName" className={field} defaultValue={period.name} /></label>
              <div className="flex flex-wrap gap-3">
                <TimeField name="startsAt" label={t("starts")} value={period.startsAt} />
                <TimeField name="endsAt" label={t("ends")} value={period.endsAt} />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="remove" value={index} /> {t("removePeriod")}</label>
            </fieldset>
          ))}
          {rows.length < 24 && (
            <fieldset className="space-y-2 border-t border-rule py-3">
              <legend className="text-sm font-semibold">{t("newPeriod")}</legend>
              <label className="block text-sm font-medium">{t("periodName")} <input name="periodName" className={field} /></label>
              <div className="flex flex-wrap gap-3">
                <TimeField name="startsAt" label={t("starts")} />
                <TimeField name="endsAt" label={t("ends")} />
              </div>
            </fieldset>
          )}
          <SubmitButton>{t("save")}</SubmitButton>
        </ActionForm>
      </details>

      <form className="my-4 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">{t("week")} <input type="date" name="week" className={field} defaultValue={report.week} required /></label>
        <label className="text-sm font-medium">
          {t("visitRating")}
          <select name="rating" className={field} defaultValue={typeof query.rating === "string" ? query.rating : ""}>
            <option value="">{t("allRatings")}</option>
            {experience.map((rating) => <option key={rating} value={rating}>{t(rating)}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-md border border-rule px-3 text-sm font-semibold">{t("show")}</button>
      </form>
      <p className="text-sm">{t("dates", { week: report.week, previous: report.previousWeek })}</p>

      <FindingEvidence report={report} query={query} />

      <section aria-labelledby="dish-insights" className="mt-6">
        <h2 id="dish-insights" className="text-xl font-semibold">{t("dishes")}</h2>
        {report.dishes.length === 0 && <p className="py-3 text-ink-muted">{t("noDishes")}</p>}
        <ul className="divide-y divide-rule">
          {report.dishes.map((dish) => (
            <li key={dish.id} id={`dish-${dish.id}`} className="space-y-2 py-4">
              <h3 className="font-display text-xl">{dish.name[locale] || dish.name[other]}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-start"><th scope="col" className="text-start">{t("period")}</th><th scope="col">{t("current")}</th><th scope="col">{t("previous")}</th></tr></thead>
                <tbody>
                  {[...dish.periods, { name: t("outside"), ...dish.outside }].map((period, index) => (
                    <tr key={index}><th scope="row" className="text-start font-normal">{period.name}</th><td className="text-center">{period.current}</td><td className="text-center">{period.previous}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="font-semibold">{t("reorder")}</p>
              {([[t("current"), dish.currentReview], [t("previous"), dish.previousReview]] as const).map(([label, stats]) => (
                  <div key={label} className="text-sm">
                    <p>{label} · {t("responses", { count: stats.count })}</p>
                    <p>{dishChoices.map((rating) => t("share", { rating: t(rating), share: rate(stats[rating], stats.count), count: stats[rating] })).join(" · ")}</p>
                    {stats.topics.length > 0 && (
                      <p>{t("topics")}: {stats.topics.slice(0, 3).map(({ topic, count }) => `${topicLabel(topic, t)} (${count})`).join(" · ")}</p>
                    )}
                  </div>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="visit-reviews" className="mt-8">
        <h2 id="visit-reviews" className="text-xl font-semibold">{t("visitReviews")}</h2>
        {[true, false].map((current) => {
          const reviews = report.visitReviews.filter((review) => review.current === current);
          return (
            <div key={String(current)} className="py-3 text-sm">
              <p className="font-semibold">{t(current ? "current" : "previous")} · {t("responses", { count: reviews.length })}</p>
              <p>{experience.map((rating) => {
                const count = reviews.filter((review) => review.rating === rating).length;
                return t("share", { rating: t(rating), share: rate(count, reviews.length), count });
              }).join(" · ")}</p>
              <ul className="divide-y divide-rule">
                {reviews.filter((review) => review.comment && (!query.rating || review.rating === query.rating)).map((review) => (
                  <li key={review.id} className="py-2"><p lang={review.language}>{review.comment}</p></li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </>
  );
}

function TimeField({ name, label, value, required }: { name: string; label: string; value?: string; required?: boolean }) {
  return <label className="text-sm font-medium">{label}<input className={field} type="time" name={name} defaultValue={value} required={required} /></label>;
}

function topicLabel(topic: string, t: Awaited<ReturnType<typeof getTranslations<"Insights">>>) {
  switch (topic) {
    case "taste": case "portion": case "temperature": case "value": return t(topic);
    default: return topic;
  }
}

async function FindingEvidence({ report, query }: {
  report: Awaited<ReturnType<typeof getVenueInsights>>;
  query: Record<string, string | string[] | undefined>;
}) {
  const kind = query.evidence;
  if (kind !== "dish" && kind !== "orders" && kind !== "visits") return null;
  const [t, locale, format] = await Promise.all([getTranslations("Insights"), getLocale(), getFormatter()]);
  const dish = report.dishes.find(({ id }) => id === query.dish);
  const period = typeof query.period === "string" && /^\d+$/.test(query.period) ? Number(query.period) : -1;
  const title = dish && kind !== "visits" ? dish.name[locale] || dish.name[locale === "am" ? "en" : "am"] : null;
  const orders = kind === "orders" && dish && dish.periods[period]
    ? report.orders.filter((line) => line.id === dish.id && line.period === period) : [];
  const reviews = kind === "visits" ? report.visitReviews : kind === "dish" && dish
    ? report.dishReviewEvidence.filter((review) => review.dishId === dish.id && review.current) : [];
  const dateTime = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Addis_Ababa" });
  return (
    <section id="finding-evidence" aria-labelledby="evidence-title" className="mt-6 rounded-md border border-rule px-4 py-3">
      <h2 id="evidence-title" className="text-xl font-semibold">{t("evidence")}</h2>
      {title && <p className="font-semibold">{title}{kind === "orders" && dish?.periods[period] ? ` · ${dish.periods[period].name}` : ""}</p>}
      {orders.length + reviews.length === 0 && <p className="py-3 text-ink-muted">{t("evidenceEmpty")}</p>}
      <ul className="divide-y divide-rule">
        {orders.map((line, index) => (
          <li key={`${line.orderId}:${index}`} className="py-2 text-sm">
            <p>{t("orderEvidence", { order: line.orderId.slice(0, 8), table: line.tableNumber, quantity: line.quantity })}</p>
            <p className="text-ink-muted">{t(line.current ? "current" : "previous")} · {dateTime(line.acceptedAt)}</p>
          </li>
        ))}
        {reviews.map((review) => (
          <li key={review.id} className="py-2 text-sm">
            <p>{t(review.rating)}{review.topics.map((topic) => ` · ${topicLabel(topic, t)}`)}</p>
            {review.comment && <p lang={review.language}>{review.comment}</p>}
            <p className="text-ink-muted">{t(review.current ? "current" : "previous")} · {dateTime(review.createdAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
