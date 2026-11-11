"use server";

import { revalidatePath } from "next/cache";
import {
  addTables,
  createVenue,
  inviteManager,
  renumberTable,
  setTableActive,
} from "@/core";
import { forForm, requireStaff, siteUrl, type FormState } from "@/lib/session";

export async function addVenue(brandId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const venue = await createVenue(actor, { brandId, name: String(formData.get("name") ?? "") });
    revalidatePath("/manage");
    return { done: { key: "venueAdded", values: { name: venue.name } } };
  });
}

export async function addTableRange(venueId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const from = Number(formData.get("from"));
    const to = formData.get("to") ? Number(formData.get("to")) : from;
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || to - from >= 500) {
      return { error: "invalidTableRange" };
    }
    const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    await addTables(actor, { venueId, numbers });
    revalidatePath(`/manage/venues/${venueId}`);
    return { done: { key: from === to ? "tableAdded" : "tablesAdded", values: { from, to } } };
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
      done: { key: "invitationReady" },
      link: new URL(`/invite/${invitation.token}`, await siteUrl()).toString(),
    };
  });
}
