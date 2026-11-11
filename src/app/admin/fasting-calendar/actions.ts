"use server";

import { revalidatePath } from "next/cache";
import { addFastingPeriod, removeFastingPeriod, updateFastingPeriod, type FastingPeriod } from "@/core";
import { forForm, requireAdmin, type FormState } from "@/lib/session";

export async function savePeriod(
  period: FastingPeriod | null, _state: FormState, data: FormData,
): Promise<FormState> {
  const actor = await requireAdmin();
  return forForm(async () => {
    const kind = data.get("kind");
    if (kind !== "season" && kind !== "exception") return { error: "invalid_input" };
    const changes = {
      startsOn: String(data.get("startsOn") ?? ""),
      endsOn: String(data.get("endsOn") ?? ""),
      fasting: kind === "season",
    };
    if (period) await updateFastingPeriod(actor, { period, changes });
    else await addFastingPeriod(actor, changes);
    revalidatePath("/admin/fasting-calendar");
    return { done: { key: "fastingPeriodSaved" } };
  });
}

export async function removePeriod(period: FastingPeriod): Promise<FormState> {
  const actor = await requireAdmin();
  return forForm(async () => {
    await removeFastingPeriod(actor, period);
    revalidatePath("/admin/fasting-calendar");
  });
}
