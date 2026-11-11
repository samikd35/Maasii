"use server";

import { revalidatePath } from "next/cache";
import {
  addPaymentOption,
  MAX_PAYMENT_QR_BYTES,
  paymentQrMimeTypes,
  removePaymentOption,
  updatePaymentOption,
  type PaymentOptionKind,
} from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";

type OptionTarget = { venueId: string; paymentOptionId: string; revision: string };

export async function savePaymentOption(
  venueId: string,
  existing: (Omit<OptionTarget, "venueId"> & { accountOrMerchantCode: string | null }) | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const file = formData.get("qrImage");
    let qrImage: string | null | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PAYMENT_QR_BYTES || !paymentQrMimeTypes.some((type) => type === file.type)) {
        return { error: "invalidPaymentQr" };
      }
      qrImage = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    } else if (formData.get("removeQr") === "on") {
      qrImage = null;
    }

    const fields = {
      kind: String(formData.get("kind") ?? "") as PaymentOptionKind,
      provider: String(formData.get("provider") ?? ""),
      recipientName: String(formData.get("recipientName") ?? ""),
      accountOrMerchantCode: String(formData.get("accountOrMerchantCode") ?? ""),
      displayOrder: Number(formData.get("displayOrder")),
      qrImage,
    };
    if (existing) {
      const confirmed = formData.get("confirmAccountCode");
      await updatePaymentOption(actor, {
        ...existing,
        venueId,
        changes: fields,
        accountChange: typeof confirmed === "string"
          ? { before: existing.accountOrMerchantCode, after: confirmed }
          : undefined,
      });
    } else {
      await addPaymentOption(actor, { venueId, ...fields });
    }
    revalidatePath(`/manage/venues/${venueId}/payment-options`);
    return { done: { key: "paymentOptionSaved" } };
  });
}

export async function changeActive(target: OptionTarget, active: boolean): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    await updatePaymentOption(actor, { ...target, changes: { active } });
    revalidatePath(`/manage/venues/${target.venueId}/payment-options`);
    return { done: { key: "paymentOptionSaved" } };
  });
}

export async function remove(target: OptionTarget): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    await removePaymentOption(actor, target);
    revalidatePath(`/manage/venues/${target.venueId}/payment-options`);
  });
}
