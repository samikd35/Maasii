"use server";

import { revalidatePath } from "next/cache";
import { setVenueDishSoldOut } from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";

export async function saveSoldOut(venueId: string, dishId: string, soldOut: boolean): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    await setVenueDishSoldOut(actor, { venueId, dishId, soldOut });
    revalidatePath(`/manage/venues/${venueId}/menu`);
    return { done: { key: soldOut ? "venueDishSoldOut" : "venueDishAvailable" } };
  });
}
