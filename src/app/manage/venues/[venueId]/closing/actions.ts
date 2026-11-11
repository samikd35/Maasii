"use server";

import { revalidatePath } from "next/cache";
import { adjustVisitBill, closeVisitUnpaid } from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";
import { parseBirr } from "@/ui/price";

export async function removeLine(venueId: string, visitId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const [orderId, lineIndex] = String(formData.get("line") ?? "").split(":");
    await adjustVisitBill(actor, {
      venueId, visitId, kind: "remove_line", orderId, lineIndex: Number(lineIndex), reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath(`/manage/venues/${venueId}/closing`);
  });
}

export async function saveDiscount(venueId: string, visitId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const amountSantim = parseBirr(String(formData.get("amount") ?? ""));
    if (amountSantim === null) return { error: "invalid_input" };
    await adjustVisitBill(actor, { venueId, visitId, kind: "discount", amountSantim, reason: String(formData.get("reason") ?? "") });
    revalidatePath(`/manage/venues/${venueId}/closing`);
  });
}

export async function closeUnpaid(venueId: string, visitId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const reason = formData.get("reason");
    if (reason !== "walked_out" && reason !== "on_the_house" && reason !== "entered_by_mistake") return { error: "invalid_input" };
    await closeVisitUnpaid(actor, { venueId, visitId, reason });
    revalidatePath(`/manage/venues/${venueId}/closing`);
  });
}
