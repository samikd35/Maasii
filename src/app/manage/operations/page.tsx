import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getMyAccess, getWaiterSession } from "@/core";
import { requireStaff } from "@/lib/session";
import { accessibleVenues, operationVenueCookie } from "../venue-scope";
import { WaiterAccess } from "../waiter-access";

export default async function OperationsHome({ searchParams }: PageProps<"/manage/operations">) {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) return <WaiterAccess workspace="venue" />;
  const venues = accessibleVenues(await getMyAccess(actor));
  const { venue } = await searchParams;
  const preferred = typeof venue === "string" ? venue : (await cookies()).get(operationVenueCookie)?.value;
  const selected = venues.find(option => option.id === preferred) ?? venues[0];
  if (!selected) notFound();
  redirect("/manage/venues/" + selected.id + "/floor");
}
