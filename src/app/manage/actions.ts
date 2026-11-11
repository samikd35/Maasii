"use server";

import { revalidatePath } from "next/cache";
import {
  addTables,
  createVenue,
  inviteManager,
  MaasiiError,
  renumberTable,
  setTableActive,
} from "@/core";
import { forForm, requireStaff, siteUrl, type FormState } from "@/lib/session";

export async function addVenue(brandId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const venue = await createVenue(actor, { brandId, name: String(formData.get("name") ?? "") });
    revalidatePath("/manage");
    return { done: `${venue.name} is ready. Open it to add its tables.` };
  });
}

export async function addTableRange(venueId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const from = Number(formData.get("from"));
    const to = formData.get("to") ? Number(formData.get("to")) : from;
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || to - from >= 500) {
      throw new MaasiiError("invalid_input", "Enter the first and last table numbers, such as 1 to 16.");
    }
    const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    await addTables(actor, { venueId, numbers });
    revalidatePath(`/manage/venues/${venueId}`);
    return { done: numbers.length === 1 ? `Added table ${from}.` : `Added tables ${from} to ${to}.` };
  });
}

export async function renumber(venueId: string, tableId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    await renumberTable(actor, { tableId, number: Number(formData.get("number")) });
    revalidatePath(`/manage/venues/${venueId}`);
  });
}

export async function setActive(venueId: string, tableId: string, active: boolean): Promise<void> {
  const actor = await requireStaff();
  await setTableActive(actor, { tableId, active });
  revalidatePath(`/manage/venues/${venueId}`);
}

export async function inviteVenueManager(venueId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const invitation = await inviteManager(actor, {
      venueId,
      name: String(formData.get("name") ?? ""),
      contact: String(formData.get("contact") ?? ""),
    });
    revalidatePath(`/manage/venues/${venueId}`);
    return {
      done: "Send this link to them. It works once, for 7 days.",
      link: `${await siteUrl()}/invite/${invitation.token}`,
    };
  });
}
