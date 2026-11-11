import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getLiveFloor, getOwnerVenuesInService, getWeeklyFinding, type Actor } from "@/core";
import { LiveFloor } from "./live-floor";
import { RefreshFloor } from "./refresh-floor";

export async function OwnerHome({ actor, venues, selected }: {
  actor: Actor;
  venues: { id: string; name: string }[];
  selected?: string;
}) {
  const now = new Date();
  const [open, t] = await Promise.all([getOwnerVenuesInService(actor, { now }), getTranslations("WeeklyFinding")]);
  const openIds = new Set(open);
  const serving = venues.filter(({ id }) => openIds.has(id));
  if (serving.length) {
    const floors = await Promise.all(serving.map((venue) => getLiveFloor(actor, { venueId: venue.id }, { now })));
    const floor = await getTranslations("Floor");
    return (
      <section aria-labelledby="owner-home" className="mt-6">
        <h2 id="owner-home" className="font-display text-2xl">{floor("title")}</h2>
        {serving.map((venue, index) => (
          <div key={venue.id} className="mt-4 border-t border-rule pt-4">
            <h3 className="text-lg font-semibold">{venue.name}</h3>
            <LiveFloor venueId={venue.id} floor={floors[index]} />
          </div>
        ))}
        <RefreshFloor />
      </section>
    );
  }

  const venue = venues.find(({ id }) => id === selected) ?? venues[0];
  const [{ week, finding }, locale, format, insights] = await Promise.all([
    getWeeklyFinding(actor, { venueId: venue.id }, { now }), getLocale(), getFormatter(), getTranslations("Insights"),
  ]);
  const evidence = new URLSearchParams({ week });
  let summary: string;
  if (finding.kind === "topic" || finding.kind === "quantity") {
    const dish = finding.name[locale] || finding.name[locale === "am" ? "en" : "am"];
    evidence.set("dish", finding.dishId);
    if (finding.kind === "topic") {
      const topic = finding.topic;
      const label = topic === "taste" || topic === "portion" || topic === "temperature" || topic === "value" ? insights(topic) : topic;
      summary = t("topic", { dish, topic: label, count: finding.count, total: finding.total });
      evidence.set("evidence", "dish");
    } else {
      summary = t("quantity", { dish, period: finding.period, current: finding.current, previous: finding.previous });
      evidence.set("evidence", "orders");
      evidence.set("period", String(finding.periodIndex));
    }
  } else if (finding.kind === "visit") {
    const share = ({ count, total }: typeof finding.current) => format.number(count / total, { style: "percent", maximumFractionDigits: 1 });
    summary = t("visits", {
      current: share(finding.current), currentTotal: finding.current.total,
      previous: share(finding.previous), previousTotal: finding.previous.total,
    });
    evidence.set("evidence", "visits");
  } else {
    const { dishReviews, previousQuantity, currentVisits, previousVisits } = finding;
    summary = t("insufficient", { dishReviews, previousQuantity, currentVisits, previousVisits });
  }
  return (
    <section aria-labelledby="owner-home" className="mt-6 space-y-2 rounded-md border border-rule p-4">
      <h2 id="owner-home" className="font-display text-2xl">{t("title")}</h2>
      {venues.length > 1 && (
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">{t("venue")}
            <select name="findingVenue" className="mt-1 block min-h-11 max-w-full rounded-md border border-rule bg-white px-3 text-base" defaultValue={venue.id}>
              {venues.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-md border border-rule px-3 text-sm font-semibold">{t("show")}</button>
        </form>
      )}
      <p className="text-sm text-ink-muted">{t("week", { week })}</p>
      <p>{summary}</p>
      {finding.kind !== "insufficient" && (
        <Link href={`/manage/venues/${venue.id}/insights?${evidence}#finding-evidence`} className="inline-flex min-h-11 items-center font-medium underline">{t("evidence")}</Link>
      )}
      <RefreshFloor intervalMs={60_000} />
    </section>
  );
}
