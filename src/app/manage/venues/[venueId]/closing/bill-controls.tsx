"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { BillControls } from "@/app/staff/bill-controls";

export function ClosingBillControls({ venueId, visitId, ...props }: Omit<ComponentProps<typeof BillControls>, "target" | "refresh"> & {
  venueId: string; visitId: string;
}) {
  const router = useRouter();
  return <BillControls {...props} target={{ venueId, visitId }} refresh={async () => router.refresh()} />;
}
