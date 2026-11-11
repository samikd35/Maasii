"use server";

import { revalidatePath } from "next/cache";
import { endShift, reassignTable, setUsualTables, startShift } from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";

export async function saveUsualTables(venueId: string, waiterId: string, _state: FormState, data: FormData) {
  return forForm(async () => {
    const tableIds = data.getAll("tableId").map(String);
    await setUsualTables(await requireStaff(), { venueId, waiterId, tableIds });
    revalidatePath(`/manage/venues/${venueId}/shifts`);
    return { done: { key: "usualTablesSaved" } };
  });
}

export async function startVenueShift(venueId: string, _state: FormState, data: FormData) {
  return forForm(async () => {
    const assignments = [...data.entries()].flatMap(([name, waiterId]) =>
      name.startsWith("assignment:") && waiterId
        ? [{ tableId: name.slice("assignment:".length), waiterId: String(waiterId) }]
        : [],
    );
    await startShift(await requireStaff(), { venueId, assignments });
    revalidatePath(`/manage/venues/${venueId}/shifts`);
  });
}

export async function saveAssignment(
  target: { venueId: string; shiftId: string; tableId: string },
  _state: FormState,
  data: FormData,
) {
  return forForm(async () => {
    await reassignTable(await requireStaff(), { ...target, waiterId: String(data.get("waiterId") ?? "") });
    revalidatePath(`/manage/venues/${target.venueId}/shifts`);
    return { done: { key: "assignmentSaved" } };
  });
}

export async function endVenueShift(venueId: string, shiftId: string) {
  return forForm(async () => {
    await endShift(await requireStaff(), { venueId, shiftId });
    revalidatePath(`/manage/venues/${venueId}/shifts`);
  });
}
