"use server";

import { revalidatePath } from "next/cache";
import { updateVenueService } from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";

export async function saveServiceSettings(venueId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const names = formData.getAll("periodName");
    const starts = formData.getAll("startsAt");
    const ends = formData.getAll("endsAt");
    const removed = new Set(formData.getAll("remove"));
    const periods = names.map((name, index) => ({
      name: String(name), startsAt: String(starts[index] ?? ""), endsAt: String(ends[index] ?? ""),
    })).filter((period, index) => !removed.has(String(index)) && (period.name || period.startsAt || period.endsAt));
    await updateVenueService(actor, {
      venueId, periods, hours: { opensAt: String(formData.get("opensAt")), closesAt: String(formData.get("closesAt")) },
    });
    revalidatePath(`/manage/venues/${venueId}/insights`);
  });
}
