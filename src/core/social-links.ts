import { z } from "zod";
import { requireBrandOwner } from "./access";
import type { Actor } from "./actor";
import { readGuestVenue } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { parseInput } from "./validation";

export const socialLinkLimits = { entries: 8, name: 80, url: 2048 } as const;
const brand = z.object({ brandId: z.uuid() });
const token = z.string().min(1).max(200);
const link = z.object({
  name: z.string().trim().min(1).max(socialLinkLimits.name).refine((value) => !value.includes("\0")),
  url: z.string().trim().max(socialLinkLimits.url).pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain, normalize: true }))
    .refine((value) => {
      const { username, password } = new URL(value);
      return !username && !password;
    }),
});
const change = brand.extend({ links: z.array(link).max(socialLinkLimits.entries) });
export type SocialLink = z.output<typeof link>;

async function readLinks(tx: Tx, brandId: string) {
  const { rows: [row] } = await tx.query<{ links: SocialLink[] }>(
    "select social_links as links from app.brands where id = $1", [brandId],
  );
  return row?.links ?? [];
}

export async function getBrandSocialLinks(actor: Actor, input: z.input<typeof brand>) {
  const { brandId } = parseInput(brand, input);
  return inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, brandId);
    return readLinks(tx, brandId);
  });
}

export async function updateBrandSocialLinks(actor: Actor, input: z.input<typeof change>) {
  const { brandId, links } = parseInput(change, input, "invalidSocialLinks");
  await inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, brandId);
    const result = await tx.query("update app.brands set social_links = $2::jsonb where id = $1", [brandId, JSON.stringify(links)]);
    if (!result.rowCount) throw new MaasiiError("not_found", "Brand not found.");
  });
}

export async function getGuestSocialLinks(actor: Actor, { venueLinkToken }: { venueLinkToken: string }) {
  const result = token.safeParse(venueLinkToken);
  if (!result.success) return null;
  return inTransaction(actor, async (tx) => {
    const guestVenue = await readGuestVenue(tx, result.data);
    return guestVenue && { ...guestVenue, links: await readLinks(tx, guestVenue.brand.id) };
  });
}
