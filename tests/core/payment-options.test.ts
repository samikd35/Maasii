import { expect, test } from "vitest";
import { addPaymentOption, listPaymentOptionChanges, listPaymentOptions, publicActor, removePaymentOption, updatePaymentOption, type PaymentOption } from "@/core";
import { scenario } from "../support/scenario";

const bankTransfer = {
  kind: "bank_transfer",
  provider: "Commercial Bank of Ethiopia",
  recipientName: "Bilo's Pastry",
  accountOrMerchantCode: "001234567",
  displayOrder: 20,
} as const;

test("an Owner sets Payment Options per Venue and a Manager can read only their Venue's options", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").build();
  const another = await scenario().build();
  const lancha = { venueId: s.venue.id };
  const bole = { venueId: s.venues.Bole.id };

  const transfer = await addPaymentOption(s.owner.actor, { ...lancha, ...bankTransfer });
  await addPaymentOption(s.owner.actor, { ...bole, kind: "cash", displayOrder: 1 });

  expect(await listPaymentOptions(s.managers.Hana.actor, lancha)).toEqual([
    { ...transfer, ...bankTransfer, venueId: lancha.venueId, active: true, qrImage: null },
  ]);
  await expect(listPaymentOptions(s.managers.Hana.actor, bole)).rejects.toMatchObject({ code: "not_allowed" });
  for (const actor of [s.managers.Hana.actor, another.owner.actor, publicActor]) {
    await expect(addPaymentOption(actor, { ...lancha, ...bankTransfer })).rejects.toMatchObject({ code: "not_allowed" });
  }
  for (const actor of [another.owner.actor, publicActor]) {
    await expect(listPaymentOptions(actor, lancha)).rejects.toMatchObject({ code: "not_allowed" });
  }
});

test("adding a Payment Option records its values, actor and time in the Owner's change log", async () => {
  const s = await scenario().manager("Hana").build();
  const venue = { venueId: s.venue.id };
  const now = new Date("2026-11-11T08:00:00Z");
  const option = await addPaymentOption(s.owner.actor, { ...venue, ...bankTransfer }, { now });

  expect(await listPaymentOptionChanges(s.owner.actor, venue)).toEqual([
    expect.objectContaining({
      actorUserId: s.owner.userId,
      changedAt: now,
      before: null,
      after: option,
    }),
  ]);
  await expect(listPaymentOptionChanges(s.managers.Hana.actor, venue)).rejects.toMatchObject({
    code: "not_allowed",
  });
});

function optionTarget({ id, venueId, revision }: PaymentOption) {
  return { paymentOptionId: id, venueId, revision };
}

test("the Owner can reorder and deactivate a Venue's Payment Option, with each change recorded", async () => {
  const s = await scenario().manager("Hana").build();
  const venue = { venueId: s.venue.id };
  const actor = s.owner.actor;
  const transfer = await addPaymentOption(actor, { ...venue, ...bankTransfer });
  const cash = await addPaymentOption(actor, { ...venue, kind: "cash", displayOrder: 10 });
  expect((await listPaymentOptions(actor, venue)).map((option) => option.kind)).toEqual(["cash", "bank_transfer"]);

  await expect(updatePaymentOption(s.managers.Hana.actor, {
    ...optionTarget(transfer), changes: { displayOrder: 1 },
  })).rejects.toMatchObject({ code: "not_allowed" });

  const first = await updatePaymentOption(actor, { ...optionTarget(transfer), changes: { displayOrder: 1 } });
  const inactive = await updatePaymentOption(actor, { ...optionTarget(first), changes: { active: false } });

  expect(await listPaymentOptions(actor, venue)).toEqual([inactive, cash]);
  expect(inactive).toMatchObject({ displayOrder: 1, active: false });
  expect((await listPaymentOptionChanges(actor, venue)).slice(0, 2)).toEqual([
    expect.objectContaining({ before: first, after: inactive }),
    expect.objectContaining({ before: transfer, after: first }),
  ]);
});

test("an Owner must confirm the exact account change against the current Payment Option", async () => {
  const s = await scenario().build();
  const actor = s.owner.actor;
  const transfer = await addPaymentOption(actor, { venueId: s.venue.id, ...bankTransfer });
  const change = { ...optionTarget(transfer), changes: { accountOrMerchantCode: "009876543" } };

  await expect(updatePaymentOption(actor, change)).rejects.toMatchObject({ reason: "paymentCodeConfirmationRequired" });
  await expect(updatePaymentOption(actor, {
    ...change,
    accountChange: { before: transfer.accountOrMerchantCode, after: "000000000" },
  })).rejects.toMatchObject({ reason: "paymentCodeConfirmationRequired" });

  const confirmation = { before: "001234567", after: "009876543" };
  const updated = await updatePaymentOption(actor, { ...change, accountChange: confirmation });
  expect(updated.accountOrMerchantCode).toBe("009876543");

  await expect(updatePaymentOption(actor, { ...change, accountChange: confirmation })).rejects.toMatchObject({
    reason: "paymentOptionChanged",
  });
  expect(await listPaymentOptions(actor, { venueId: s.venue.id })).toEqual([updated]);
  expect((await listPaymentOptionChanges(actor, { venueId: s.venue.id })).map((entry) => entry.after?.accountOrMerchantCode))
    .toEqual(["009876543", "001234567"]);
});

test("removing a Payment Option leaves its last values in the Owner's change log", async () => {
  const s = await scenario().manager("Hana").build();
  const venue = { venueId: s.venue.id };
  const actor = s.owner.actor;
  const option = await addPaymentOption(actor, { ...venue, kind: "cash", displayOrder: 1 });
  const now = new Date(Date.now() + 1000);

  await expect(removePaymentOption(s.managers.Hana.actor, optionTarget(option))).rejects.toMatchObject({
    code: "not_allowed",
  });
  await removePaymentOption(actor, optionTarget(option), { now });

  expect(await listPaymentOptions(actor, venue)).toEqual([]);
  expect((await listPaymentOptionChanges(actor, venue))[0]).toMatchObject({
    actorUserId: s.owner.userId,
    changedAt: now,
    before: option,
    after: null,
  });
});

test("digital Payment Options require a destination and refuse a QR upload disguised as an image", async () => {
  const s = await scenario().build();
  const actor = s.owner.actor;
  const venue = { venueId: s.venue.id };

  await expect(addPaymentOption(actor, { ...venue, kind: "mobile_wallet", displayOrder: 1 })).rejects.toMatchObject({
    reason: "paymentDestinationRequired",
  });
  await expect(addPaymentOption(actor, { ...venue, ...bankTransfer, qrImage: "data:image/png;base64,PGh0bWw+" }))
    .rejects.toMatchObject({ code: "invalid_input" });
  expect(await listPaymentOptions(actor, venue)).toEqual([]);
  expect(await listPaymentOptionChanges(actor, venue)).toEqual([]);
});
