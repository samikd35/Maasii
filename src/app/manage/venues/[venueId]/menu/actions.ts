"use server";

import { revalidatePath } from "next/cache";
import { setVenueDishPrice, setVenueDishSoldOut } from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";

export async function saveSoldOut(venueId: string, dishId: string, soldOut: boolean): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    await setVenueDishSoldOut(actor, { venueId, dishId, soldOut });
    revalidatePath(`/manage/venues/${venueId}/menu`);
    return { done: { key: soldOut ? "venueDishSoldOut" : "venueDishAvailable" } };
  });
}

export async function saveVenuePrice(
  venueId: string, dishId: string, _state: FormState, formData: FormData,
): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const field = formData.get("price");
    if (typeof field !== "string") return { error: "invalid_input" };
    const amount = field.trim();
    if (amount && !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(amount)) return { error: "invalid_input" };

    await setVenueDishPrice(actor, { venueId, dishId, priceSantim: amount ? Math.round(Number(amount) * 100) : null });
    revalidatePath(`/manage/venues/${venueId}/menu`);
    return { done: { key: amount ? "venuePriceSaved" : "brandPriceRestored" } };
  });
}
