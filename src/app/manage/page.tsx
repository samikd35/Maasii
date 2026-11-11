import Link from "next/link";
import { getMyAccess } from "@/core";
import { requireStaff } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { addVenue } from "./actions";

export default async function ManageHome() {
  const access = await getMyAccess(await requireStaff());
  const nothing = access.brands.length === 0 && access.venues.length === 0;

  return (
    <>
      <h1 className="font-display text-3xl">{access.name ? `Hello, ${access.name}` : "Your venues"}</h1>

      {access.isPlatformAdmin && (
        <Link href="/admin" className="mt-4 inline-flex min-h-11 items-center font-semibold underline">
          Platform admin
        </Link>
      )}

      {nothing && !access.isPlatformAdmin && (
        <p className="mt-4 text-ink-muted">You don&apos;t manage any venue yet. Ask your brand&apos;s owner for an invitation.</p>
      )}

      {access.brands.map((brand) => (
        <section key={brand.id} aria-labelledby={`brand-${brand.id}`} className="mt-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink/70 pb-1.5">
            <h2 id={`brand-${brand.id}`} className="text-xl font-semibold">
              {brand.name}
            </h2>
            <span className="text-sm text-ink-muted">Owner</span>
          </div>
          <VenueList venues={brand.venues} />
          <ActionForm action={addVenue.bind(null, brand.id)} className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Venue name" name="name" required className="min-w-0 flex-1" />
            <SubmitButton>Add venue</SubmitButton>
          </ActionForm>
        </section>
      ))}

      {access.venues.length > 0 && (
        <section aria-labelledby="managed-venues" className="mt-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink/70 pb-1.5">
            <h2 id="managed-venues" className="text-xl font-semibold">
              Venues you manage
            </h2>
            <span className="text-sm text-ink-muted">Manager</span>
          </div>
          <VenueList venues={access.venues.map((v) => ({ id: v.id, name: v.name, detail: v.brandName }))} />
        </section>
      )}
    </>
  );
}

function VenueList({ venues }: { venues: { id: string; name: string; detail?: string }[] }) {
  if (venues.length === 0) return <p className="py-3 text-ink-muted">No venues yet.</p>;
  return (
    <ul>
      {venues.map((venue) => (
        <li key={venue.id} className="border-b border-rule">
          <Link href={`/manage/venues/${venue.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <span>
              <span className="font-semibold">{venue.name}</span>
              {venue.detail && <span className="block text-sm text-ink-muted">{venue.detail}</span>}
            </span>
            <span aria-hidden>›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
