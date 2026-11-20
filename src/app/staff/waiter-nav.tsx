"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { WaiterIcon } from "@/ui/waiter-icon";
import { useWaiterFeed } from "./waiter-feed";

const destinations = [
  { key: "queue", href: "/staff" },
  { key: "tables", href: "/staff?view=tables" },
  { key: "menu", href: "/staff?view=menu" },
] as const;

export function WaiterNav({ current }: { current: typeof destinations[number]["key"] }) {
  const t = useTranslations("StaffWaiter");
  const orders = useTranslations("StaffOrders");
  const { feed, stale } = useWaiterFeed();
  const count = stale ? 0 : feed?.orders.filter(order => order.state === "sent").length ?? 0;

  return <nav className="waiter-nav" aria-label={t("waiter")}>
    <ul>{destinations.map(({ key, href }) => (
      <li key={key}><Link href={href} aria-current={key === current ? "page" : undefined}
        aria-describedby={key === "queue" && count > 0 ? "waiter-nav-waiting" : undefined}>
        <span className="waiter-nav-icon">
          <WaiterIcon name={key} />
          {key === "queue" && count > 0 && <span className="waiter-nav-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
        </span>
        <span>{t(key)}</span>
      </Link></li>
    ))}</ul>
    {count > 0 && <span id="waiter-nav-waiting" className="sr-only">{orders("waitingCount", { count })}</span>}
  </nav>;
}
