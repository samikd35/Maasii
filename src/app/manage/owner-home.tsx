import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getWeeklyFinding, type Actor } from "@/core";
import { WaiterIcon } from "@/ui/waiter-icon";

export async function OwnerHome({ actor, brandId, venues, selected, showPicker = false }: {
  actor: Actor;
  brandId: string;
  venues: { id: string; name: string }[];
  selected?: string;
  showPicker?: boolean;
}) {
  const now = new Date();
  const requested = venues.find(({ id }) => id === selected);
  const [findings, locale, format, insights, t] = await Promise.all([
    Promise.all((requested ? [requested] : venues).map(async venue => ({
      venue, ...await getWeeklyFinding(actor, { venueId: venue.id }, { now }),
    }))), getLocale(), getFormatter(), getTranslations("Insights"), getTranslations("WeeklyFinding"),
  ]);
  const { venue, week, finding } = findings.find(entry => entry.finding.kind !== "insufficient") ?? findings[0];
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
    <section id="weekly-finding" aria-labelledby="owner-home" className="workspace-panel owner-finding">
      <h2 id="owner-home"><WaiterIcon name="trend" />{t("title")}</h2>
      <p className="manager-muted">{venue.name} · {range}</p>
      <p className="owner-finding-summary">{summary}</p>
      {finding.kind !== "insufficient" ? (
        <Link href={`/manage/venues/${venue.id}/insights?${evidence}#finding-evidence`} className="workspace-link">{t("evidence")}<WaiterIcon name="next" /></Link>
      ) : <Link className="workspace-link" href={`/manage/venues/${venue.id}/insights`}>{insights("title")}</Link>}
      {showPicker && venues.length > 1 && (
        <form action={`/manage/brands/${brandId}/insights#weekly-finding`} className="workspace-actions items-end">
          <label className="text-sm font-medium">{t("venue")}
            <select key={venue.id} name="findingVenue" className="workspace-input" defaultValue={venue.id}>
              {venues.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <button className="workspace-button" type="submit">{t("show")}</button>
        </form>
      )}
    </section>
  );
}
