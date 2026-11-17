import { z } from "zod";
import type { Actor } from "./actor";
import { inTransaction } from "./db";
import { MaasiiError } from "./errors";
import { readPublishedMenu } from "./menu";
import { parseInput } from "./validation";

const pageLoadId = z.uuidv4();
const browsingInput = z.strictObject({
  venueLinkToken: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/),
  event: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("menu_opened"), pageLoadId }),
    z.strictObject({ kind: z.literal("dish_opened"), pageLoadId, dishId: z.uuid() }),
  ]),
});

export async function recordBrowsingEvent(
  actor: Actor,
  input: { venueLinkToken: string; event: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  if (actor.kind !== "public") throw new MaasiiError("not_allowed", "Browsing events are anonymous.");
  const { venueLinkToken, event } = parseInput(browsingInput, input);
  const dishId = event.kind === "dish_opened" ? event.dishId : null;

  await inTransaction(actor, async (tx) => {
    const { rows: [venue] } = await tx.query<{ id: string }>(
      "select id from app.venues where link_token = $1", [venueLinkToken],
    );
    if (!venue) throw new MaasiiError("not_found", "No such Venue or published Dish.");
    if (dishId && !(await readPublishedMenu(tx, { venueLinkToken }, now))?.menuSections
      .some((section) => section.dishes.some((dish) => dish.dishId === dishId))) {
      throw new MaasiiError("not_found", "No such Venue or published Dish.");
    }
    await tx.query(
      `insert into app.browsing_events (venue_id, kind, dish_id, occurred_at, page_load_id)
       values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [venue.id, event.kind, dishId, now, event.pageLoadId],
    );
  });
}
