"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { getMyTableOrders, PreparedBill } from "@/core";
import { watchOrders, type OrderFeed } from "@/lib/supabase/order-feed";
import { playOrderChime } from "./order-chime";

type StaffOrderFeed = OrderFeed & Omit<Awaited<ReturnType<typeof getMyTableOrders>>, "orders" | "topic" | "bills"> & {
  bills: (Omit<PreparedBill, "preparedAt"> & { preparedAt: string })[];
};

const FeedContext = createContext<{
  feed?: StaffOrderFeed;
  setFeed: Dispatch<SetStateAction<StaffOrderFeed | undefined>>;
  updatedAt?: number;
  stale: boolean;
  refresh: () => Promise<StaffOrderFeed | undefined>;
  accessLost: () => void;
} | null>(null);

export function WaiterFeed({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [feed, setFeed] = useState<StaffOrderFeed>();
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [stale, setStale] = useState(false);
  const latest = useRef<StaffOrderFeed | undefined>(undefined);
  const read = useRef<() => Promise<boolean>>(async () => false);

  const accessLost = useCallback(() => {
    latest.current = undefined;
    setFeed(undefined);
    setUpdatedAt(undefined);
    router.refresh();
  }, [router]);

  useEffect(() => {
    let previous: Map<string, string | null> | undefined;
    const watcher = watchOrders<StaffOrderFeed>("/staff/orders", data => {
      const waiting = data.orders.filter(order => order.state === "sent");
      const seen = previous;
      if (seen && waiting.some(({ id, escalatedAt }) => seen.get(id) !== escalatedAt)) playOrderChime();
      previous = new Map(waiting.map(({ id, escalatedAt }) => [id, escalatedAt]));
      latest.current = data;
      setFeed(data);
      setUpdatedAt(Date.now());
      setStale(false);
    }, status => {
      if (status === 403) accessLost();
      else setStale(true);
    }, { keepFresh: true });

    read.current = watcher.refresh;
    return watcher.stop;
  }, [accessLost]);

  async function refresh() {
    return await read.current() ? latest.current : undefined;
  }

  return <FeedContext value={{ feed, setFeed, updatedAt, stale, refresh, accessLost }}>{children}</FeedContext>;
}

export function useWaiterFeed() {
  const state = useContext(FeedContext);
  if (!state) throw new Error("WaiterFeed is required");
  return state;
}
