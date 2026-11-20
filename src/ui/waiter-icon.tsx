const paths = {
  queue: "M4 4h16l2 10v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5L4 4Zm-2 10h6l2 3h4l2-3h6",
  tables: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  menu: "M3 2v5a3 3 0 0 0 6 0V2M6 2v20M20 2v20m0-20c-3 1-5 4-5 7v4h5",
  clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  receipt: "M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2V3Zm4 6h6m-6 4h6",
  check: "m5 12 4 4L19 6",
  circleCheck: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM8 12l3 3 5-6",
  alert: "M12 8v5m0 3h.01M10.4 3.9 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.6 3.9a1.9 1.9 0 0 0-3.2 0Z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M4 10h16v11H4zM12 14v3",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2",
  back: "m15 18-6-6 6-6",
  next: "m9 18 6-6-6-6",
  down: "m6 9 6 6 6-6",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6",
  plus: "M12 5v14M5 12h14",
  undo: "M3 5v6h6m-6 0 5-5a7 7 0 1 1 2 12",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  overview: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm6 11v-7h6v7",
  brand: "M4 10v11h16V10M3 10l2-6h14l2 6M3 10c0 3 4 4 5 1 1 3 7 3 8 0 1 3 5 2 5-1m-11 11v-5h4v5",
  trend: "M3 3v18h18M6 16l5-5 4 3 5-7m-5 0h5v5",
  calendar: "M7 2v4m10-4v4M3 5h18v16H3zM3 10h18",
  setup: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h4v4h-3m-4 0v-3",
} as const;

export function WaiterIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="waiter-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.85} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
