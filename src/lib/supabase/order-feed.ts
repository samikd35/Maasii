import type { Order } from "@/core";

export type LiveOrder = Omit<Order, "sentAt" | "acceptedAt" | "declinedAt" | "escalatedAt" | "requestId"> & {
  sentAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  escalatedAt: string | null;
  requestId: string | null;
};
type LiveConnection = { topic: string; accessToken: string; expiresAt: number };
export type OrderFeed = { orders: LiveOrder[]; live: LiveConnection | null };

export function watchOrders<T extends OrderFeed>(
  url: string,
  onData: (data: T) => void,
  onError?: (status?: number) => void,
  { keepFresh = false }: { keepFresh?: boolean } = {},
) {
  let connection: LiveConnection | null = null;
  let live = false;
  let closed = false;
  let connecting = false;
  let unsubscribe: (() => void) | undefined;
  let nextRead = 0;
  let lastApplied = 0;
  let lastSuccessful = 0;
  let lastUpdated = 0;

  async function read() {
    if (closed) return false;
    const sequence = ++nextRead;
    try {
      const response = await fetch(url, { cache: "no-store", signal: keepFresh ? AbortSignal.timeout?.(10_000) : undefined });
      if (closed || sequence < lastApplied) {
        await response.body?.cancel();
        return !closed && lastSuccessful === lastApplied;
      }
      if (!response.ok) {
        lastApplied = sequence;
        onError?.(response.status);
        return false;
      }
      const data: T = await response.json();
      if (closed || sequence < lastApplied) return !closed && lastSuccessful === lastApplied;
      lastApplied = sequence;
      lastSuccessful = sequence;
      lastUpdated = Date.now();
      connection = data.live;
      onData(data);
      if (connection && !unsubscribe && !connecting) void connect(connection.topic);
      return true;
    } catch {
      if (!closed && sequence >= lastApplied) { lastApplied = sequence; onError?.(); }
      return !closed && sequence < lastApplied && lastSuccessful === lastApplied;
    }
  }

  async function connect(topic: string) {
    connecting = true;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      if (closed) return;
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          accessToken: async () => {
            if (connection && connection.expiresAt * 1000 < Date.now() + 30_000) await read();
            return connection?.accessToken ?? null;
          },
        },
      );
      await supabase.realtime.setAuth();
      if (closed) return;
      const channel = supabase.channel(topic, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => void read())
        .subscribe((status) => {
          if (closed) return;
          live = status === "SUBSCRIBED";
          if (live) void read();
        });
      unsubscribe = () => { void supabase.removeChannel(channel); };
    } catch {
      live = false;
    } finally {
      connecting = false;
    }
  }

  const timer = window.setInterval(() => {
    if (keepFresh && document.hidden) return;
    if (!live || (keepFresh && Date.now() - lastUpdated >= 30_000)) void read();
  }, 10_000);
  const online = () => { void read(); };
  const offline = () => { onError?.(); };
  const resume = () => { if (!document.hidden) void read(); };
  window.addEventListener("online", online);
  if (keepFresh) {
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", resume);
  }
  void read();

  function stop() {
    closed = true;
    window.clearInterval(timer);
    window.removeEventListener("online", online);
    if (keepFresh) {
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", resume);
    }
    unsubscribe?.();
  }

  return { refresh: read, stop };
}
