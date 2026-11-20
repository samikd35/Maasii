import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getVenueInsights, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { WaiterIcon } from "@/ui/waiter-icon";

const field = "workspace-input mt-1";
const experience = ["great", "okay", "needs_work"] as const;
const dishChoices = ["yes", "maybe", "no"] as const;
const day = 86_400_000;
const date = (value: string) => new Date(`${value}T00:00:00Z`);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Insights");
  return { title: `${t("title")} · Maasii` };
}

export default async function InsightsPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/insights">) {
  const { venueId } = await params;
  const query = await searchParams;
  const actor = await requireStaff();
  const now = new Date();
  const report = await getVenueInsights(actor, { venueId, week: typeof query.week === "string" ? query.week : undefined }, { now }).catch((error) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, locale, format, owner] = await Promise.all([getTranslations("Insights"), getLocale(), getFormatter(), getTranslations("OwnerWorkspace")]);
  const other = locale === "am" ? "en" : "am";
  const rating = experience.find(value => value === query.rating) ?? "";
  const rate = (count: number, total: number) => total ? format.number(count / total, { style: "percent", maximumFractionDigits: 0 }) : "—";
  const viewingReviews = query.view === "reviews";
  const dishDetail = query.evidence ? undefined : report.dishes.find(({ id }) => id === query.dish);
  const makeHref = (week: string, view: "reviews" | "dishes", dish?: string) => {
    const params = new URLSearchParams({ week });
    if (view === "reviews") {
      params.set("view", view);
      if (rating) params.set("rating", rating);
    }
    if (dish) params.set("dish", dish);
    return `/manage/venues/${venueId}/insights?${params}`;
  };
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Addis_Ababa", dateStyle: "short" }).format(now);
  const series = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const range = (start: string) => series.formatRange(date(start), new Date(date(start).getTime() + 6 * day));
  const weekColumns = ([["selectedWeek", report.week], ["previous", report.previousWeek]] as const).map(([label, start]) => (
    <th key={label} scope="col" aria-label={`${t(label)} · ${range(start)}`}>
      <span className="insights-period-label">{t(label)}</span>
      <time className="insights-period-date" dateTime={start}>
        {format.dateTime(date(start), { month: "numeric", day: "numeric", timeZone: "UTC" })}
      </time>
    </th>
  ));
  const nextWeek = new Date(date(report.week).getTime() + 7 * day).toISOString().slice(0, 10);
  const weekInProgress = report.week <= today && nextWeek > today;
  const comments = report.visitReviews.filter(review => review.comment);
  const filteredComments = comments.filter(review => !rating || review.rating === rating);
  const rows = report.dishes.map(dish => ({
    ...dish,
    current: dish.periods.reduce((total, period) => total + period.current, dish.outside.current),
    previous: dish.periods.reduce((total, period) => total + period.previous, dish.outside.previous),
  })).sort((a, b) => b.current - a.current || b.previous - a.previous || (a.name[locale] || a.name[other]).localeCompare(b.name[locale] || b.name[other], locale));
  const maxCount = rows.reduce((max, row) => Math.max(max, row.current, row.previous), 1);

  return (
    <>
      <Link className="workspace-link manager-back" href={`/manage/brands/${report.brandId}/insights?findingVenue=${venueId}`}>
        <WaiterIcon name="back" />{owner("backToInsights")}
      </Link>
      <h1>{t("title")}</h1>
      <div className="insights-week">
        <div className="insights-week-label">
          <p><strong>{range(report.week)}</strong>{weekInProgress && <span className="manager-chip" data-tone="waiting">{t("inProgress")}</span>}</p>
          <p className="manager-muted">{t("comparedWith", { range: range(report.previousWeek) })}</p>
        </div>
        <details key={report.week}>
          <summary className="workspace-button manager-disclosure"><WaiterIcon name="calendar" />{t("chooseWeek")}</summary>
          <form className="workspace-actions" aria-label={t("chooseWeek")}>
            <label className="min-w-0 max-w-full text-sm font-medium">
              {t("week")} <input type="date" name="week" className={field} defaultValue={report.week} max={today} required />
            </label>
            {viewingReviews && <input type="hidden" name="view" value="reviews" />}
            {viewingReviews && rating && <input type="hidden" name="rating" value={rating} />}
            <button className="workspace-button workspace-primary">{t("show")}</button>
          </form>
        </details>
      </div>
      <nav aria-label={t("title")} className="manager-switches insights-switches">
        <Link href={makeHref(report.week, "dishes")} aria-current={!viewingReviews ? "page" : undefined}>{t("dishes")}</Link>
        <Link href={makeHref(report.week, "reviews")} aria-current={viewingReviews ? "page" : undefined}>{t("visitReviews")}</Link>
      </nav>
      <FindingEvidence report={report} query={query} />

      {!viewingReviews && !dishDetail && <section aria-labelledby="dish-insights">
        <h2 id="dish-insights" className="sr-only">{t("dishes")}</h2>
        {rows.length ? <table className="insights-table">
          <caption>{t("acceptedQuantities")}</caption>
          <thead><tr><th scope="col">{t("dish")}</th>{weekColumns}</tr></thead>
          <tbody>{rows.map(dish => (
            <tr key={dish.id}>
              <th scope="row">
                <Link id={`dish-${dish.id}`} className="insights-dish-link" href={`${makeHref(report.week, "dishes", dish.id)}#dish-detail`}>
                  {dish.name[locale] || dish.name[other]}<WaiterIcon name="next" />
                </Link>
              </th>
              {[dish.current, dish.previous].map((count, index) => (
                <td key={index}>
                  <strong>{format.number(count)}</strong>
                  <span className="insights-quantity" aria-hidden="true" style={{ inlineSize: `${100 * count / maxCount}%` }} />
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table> : <p className="manager-empty">{t("noDishes")}</p>}
      </section>}

      {!viewingReviews && dishDetail && <section id="dish-detail" tabIndex={-1} className="workspace-panel insights-detail" aria-labelledby="dish-detail-title">
        <div className="manager-section-heading">
          <h2 id="dish-detail-title">{dishDetail.name[locale] || dishDetail.name[other]}</h2>
          <Link className="workspace-link" href={`${makeHref(report.week, "dishes")}#dish-${dishDetail.id}`}><WaiterIcon name="back" />{t("backToDishes")}</Link>
        </div>
        <table className="insights-table">
          <caption>{t("acceptedQuantities")}</caption>
          <thead><tr><th scope="col">{t("period")}</th>{weekColumns}</tr></thead>
          <tbody>{[...dishDetail.periods, { name: t("outside"), ...dishDetail.outside }].map((period, index) => (
            <tr key={index}><th scope="row">{period.name}</th><td>{format.number(period.current)}</td><td>{format.number(period.previous)}</td></tr>
          ))}</tbody>
        </table>
        <h3 className="mt-3">{t("reorder")}</h3>
        {dishDetail.currentReview.count + dishDetail.previousReview.count === 0 ? <p className="manager-muted">{t("noResponses")}</p> :
          ([[t("selectedWeek"), dishDetail.currentReview], [t("previous"), dishDetail.previousReview]] as const).map(([label, stats]) => (
            <div key={label} className="py-2 text-sm">
              <p className="font-semibold">{label} · {t("responses", { count: stats.count })}</p>
              {stats.count > 0 && <p>{dishChoices.map((choice) => t("share", { rating: t(choice), share: rate(stats[choice], stats.count), count: stats[choice] })).join(" · ")}</p>}
              {stats.topics.length > 0 && <p>{t("topics")}: {stats.topics.slice(0, 3).map(({ topic, count }) => `${topicLabel(topic, t)} (${count})`).join(" · ")}</p>}
            </div>
          ))}
      </section>}
      {!viewingReviews && <Link className="insights-settings workspace-link" href={`/manage/venues/${venueId}?section=service#service-hours`}>{t("settings")}</Link>}

      {viewingReviews && <section aria-labelledby="visit-reviews" className="workspace-panel insights-detail">
        <h2 id="visit-reviews">{t("visitReviews")}</h2>
        {report.visitReviews.length === 0 && <p className="manager-muted">{t("noResponses")}</p>}
        {report.visitReviews.length > 0 && [true, false].map((current) => {
          const reviews = report.visitReviews.filter((review) => review.current === current);
          return (
            <div key={String(current)} className="py-3 text-sm">
              <p className="font-semibold">{t(current ? "selectedWeek" : "previous")} · {t("responses", { count: reviews.length })}</p>
              {reviews.length > 0 && <p>{experience.map((rating) => {
                const count = reviews.filter((review) => review.rating === rating).length;
                return t("share", { rating: t(rating), share: rate(count, reviews.length), count });
              }).join(" · ")}</p>}
            </div>
          );
        })}
        <h3 id="visit-comments" className="mt-3">{owner("visitComments")}</h3>
        {comments.length > 0 && <form className="workspace-actions items-end" action="#visit-comments">
          <input type="hidden" name="week" value={report.week} />
          <input type="hidden" name="view" value="reviews" />
          <label className="min-w-0 max-w-full text-sm font-medium">
            {owner("commentRating")}
            <select name="rating" className={field} defaultValue={rating}>
              <option value="">{t("allRatings")}</option>
              {experience.map(value => <option key={value} value={value}>{t(value)}</option>)}
            </select>
          </label>
          <button className="workspace-button">{owner("filterComments")}</button>
        </form>}
        {filteredComments.length > 0 ? (
          <ul className="divide-y divide-rule">
            {filteredComments.map(review => (
              <li key={review.id} className="py-2">
                <p className="manager-muted">{t(review.current ? "selectedWeek" : "previous")} · {t(review.rating)}</p>
                <p lang={review.language}>{review.comment}</p>
              </li>
            ))}
          </ul>
        ) : <p className="manager-muted mt-2">{owner("noComments")}</p>}
      </section>}
    </>
  );
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
    <section id="finding-evidence" aria-labelledby="evidence-title" className="mt-6 rounded-xl border border-rule px-4 py-3">
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
