"use server";

import { getMenuDraft, publishMenuDraft, saveMenuDraft, type MenuDraftContent } from "@/core";
import { forForm, requireStaff } from "@/lib/session";

export async function persistMenuDraft(
  brandId: string,
  revision: string | null,
  menu: MenuDraftContent,
  publish: boolean,
) {
  const actor = await requireStaff();
  const input = { brandId, revision, menu };
  const result = await forForm(async () => {
    if (publish) await publishMenuDraft(actor, input);
    else await saveMenuDraft(actor, input);
  });
  if (result?.error) return { error: result.error };
  return { draft: await getMenuDraft(actor, { brandId }) };
}
