import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getWeeklyFinding, type Actor } from "@/core";

export async function OwnerHome({ actor, brandId, venues, selected }: {
  actor: Actor;
  brandId: string;
  venues: { id: string; name: string }[];
  selected?: string;
}) {
  const now = new Date();
  const venue = venues.find(({ id }) => id === selected) ?? venues[0];
  const [{ week, finding }, locale, format, insights, t] = await Promise.all([
    getWeeklyFinding(actor, { venueId: venue.id }, { now }), getLocale(), getFormatter(), getTranslations("Insights"), getTranslations("WeeklyFinding"),
  ]);
  const start = new Date(`${week}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const range = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Addis_Ababa" }).formatRange(start, end);
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
    summary = t("collectingForVenue", { venue: venue.name });
  }
  return (
    <section id="weekly-finding" aria-labelledby="owner-home" className="workspace-panel space-y-2">
      <h2 id="owner-home">{t("title")}</h2>
      {venues.length > 1 && (
        <form action="/manage#weekly-finding" className="workspace-actions items-end">
          <input type="hidden" name="brand" value={brandId} />
          <label className="text-sm font-medium">{t("venue")}
            <select name="findingVenue" className="workspace-input" defaultValue={venue.id}>
              {venues.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <button className="workspace-button" type="submit">{t("show")}</button>
        </form>
      )}
      <p className="text-sm text-ink-muted">{range}</p>
      <p>{summary}</p>
      {finding.kind !== "insufficient" && (
        <Link href={`/manage/venues/${venue.id}/insights?${evidence}#finding-evidence`} className="workspace-link">{t("evidence")}</Link>
      )}
      {finding.kind === "insufficient" && <Link className="workspace-link" href={`/manage/venues/${venue.id}/insights`}>{insights("title")}</Link>}
    </section>
  );
}
