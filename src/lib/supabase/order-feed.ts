import type { Order } from "@/core";

export type LiveOrder = Omit<Order, "sentAt" | "acceptedAt" | "requestId"> & {
  sentAt: string;
  acceptedAt: string | null;
  requestId: string | null;
};
type LiveConnection = { topic: string; accessToken: string; expiresAt: number };
export type OrderFeed = { orders: LiveOrder[]; live: LiveConnection | null };

export function watchOrders<T extends OrderFeed>(
  url: string,
  onData: (data: T) => void,
  onError?: (status?: number) => void,
) {
  let connection: LiveConnection | null = null;
  let live = false;
  let closed = false;
  let connecting = false;
  let unsubscribe: (() => void) | undefined;
  let nextRead = 0;
  let lastApplied = 0;

  async function read() {
    const sequence = ++nextRead;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (closed || sequence < lastApplied) return;
      if (!response.ok) {
        onError?.(response.status);
        return;
      }
      const data: T = await response.json();
      if (closed || sequence < lastApplied) return;
      lastApplied = sequence;
      connection = data.live;
      onData(data);
      if (connection && !unsubscribe && !connecting) void connect(connection.topic);
    } catch {
      if (!closed) onError?.();
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

  const timer = window.setInterval(() => { if (!live) void read(); }, 10_000);
  const online = () => { void read(); };
  window.addEventListener("online", online);
  void read();

  function stop() {
    closed = true;
    window.clearInterval(timer);
    window.removeEventListener("online", online);
    unsubscribe?.();
  }

  return { refresh: read, stop };
}
