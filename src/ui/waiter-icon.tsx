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
} as const;

export function WaiterIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="waiter-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.85} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
