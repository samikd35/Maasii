import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { getLiveFloor } from "@/core";
import { formatBirr } from "@/ui/price";

type Floor = Awaited<ReturnType<typeof getLiveFloor>>;

export async function LiveFloor({ venueId, floor }: { venueId: string; floor: Floor }) {
  const [t, bill] = await Promise.all([getTranslations("Floor"), getTranslations("Bills")]);
  const venue = `/manage/venues/${venueId}`;
  const href = ({ id, kind }: Floor["exceptions"][number]) => {
    if (kind === "unassigned") return `${venue}/shifts#assignment-${id}`;
    if (kind === "difference") return `${venue}/closing#payment-${id}`;
    if (kind === "prepared") return `${venue}/closing#visit-${id}`;
    return `#floor-visit-${id}`;
  };

  return (
    <div data-live-floor>
      <section aria-labelledby={`floor-exceptions-${venueId}`} className="mt-6">
        <h2 id={`floor-exceptions-${venueId}`} className="text-xl font-semibold">{t("exceptions")}</h2>
        {floor.exceptions.length === 0 && <p className="py-3 text-ink-muted">{t("none")}</p>}
        <ul className="divide-y divide-rule">
          {floor.exceptions.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-x-4 py-2">
              <p>
                <strong>{bill("table", { number: item.tableNumber })}</strong>
                <span className="block text-sm">{t(item.kind)} · {t("age", { minutes: item.minutes })}</span>
              </p>
              <Link href={href(item)} prefetch={false} className="inline-flex min-h-11 items-center font-medium underline">{t(`${item.kind}Action`)}</Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby={`floor-tables-${venueId}`} className="mt-6">
        <h2 id={`floor-tables-${venueId}`} className="text-xl font-semibold">{t("openTables")}</h2>
        {floor.tables.length === 0 && <p className="py-3 text-ink-muted">{t("noneOpen")}</p>}
        <ul className="mt-2 flex flex-col gap-2 md:grid md:grid-cols-3">
          {floor.tables.map((table) => (
            <li key={table.id} id={`floor-visit-${table.visitId}`} className="rounded-md border border-rule px-3 py-2">
              <Link href={`${venue}/closing#visit-${table.visitId}`} prefetch={false} className="inline-flex min-h-11 items-center font-semibold underline">
                {bill("table", { number: table.number })}
              </Link>
              <p className={`font-semibold ${table.status === "inService" ? "text-ink" : "text-amber-900"}`}>{t(`${table.status}Status`)}</p>
              <p className="text-sm">{table.waiter ?? t("unassigned")} · {bill("total", { amount: formatBirr(table.totalSantim) })}</p>
              <p className="text-sm text-ink-muted">{table.oldestSentMinutes === null ? t("noPending") : t("oldest", { minutes: table.oldestSentMinutes })}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
