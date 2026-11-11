import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVenueLink, getVenueSetup, getVenueStaff, MaasiiError, type Actor, type VenueTable } from "@/core";
import { requireStaff, siteUrl } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, CopyField, SubmitButton } from "@/ui/staff-forms";
import { addTableRange, inviteVenueManager, renumber, setActive } from "../../actions";

export const metadata: Metadata = { title: "Venue · Maasii" };

async function load(actor: Actor, venueId: string) {
  try {
    const [setup, staff, link] = await Promise.all([
      getVenueSetup(actor, { venueId }),
      getVenueStaff(actor, { venueId }),
      getVenueLink(actor, { venueId, siteUrl: await siteUrl() }),
    ]);
    return { setup, staff, link };
  } catch (error) {
    if (error instanceof MaasiiError && error.code !== "invalid_input") notFound();
    throw error;
  }
}

export default async function VenuePage({ params }: PageProps<"/manage/venues/[venueId]">) {
  const { venueId } = await params;
  const { setup, staff, link } = await load(await requireStaff(), venueId);
  const { venue, brand, tables, isOwner } = setup;

  return (
    <>
      <Link href="/manage" className="inline-flex min-h-11 items-center text-sm font-medium underline">
        All venues
      </Link>
      <p className="mt-2 text-sm text-ink-muted">{brand.name}</p>
      <h1 className="font-display text-3xl">{venue.name}</h1>

      <section aria-labelledby="venue-link" className="mt-8">
        <SectionHeading id="venue-link">Venue Link</SectionHeading>
        <p className="mt-2 text-sm text-ink-muted">
          The same link and QR code go on every table. Guests open it to read the menu.
        </p>
        <CopyField label="Venue Link" value={link.url} />
        {/* A plain <img>: the QR is a private, per-request PNG, not something to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/manage/venues/${venue.id}/qr`}
          alt={`QR code for the ${venue.name} Venue Link`}
          width={240}
          height={240}
          className="mt-4 h-60 w-60 border border-rule bg-white"
        />
        <a
          href={`/manage/venues/${venue.id}/qr?download=1`}
          download={link.qrFileName}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink/30 px-4 font-medium"
        >
          Download QR image
        </a>
      </section>

      <section aria-labelledby="tables" className="mt-10">
        <SectionHeading id="tables">Tables</SectionHeading>
        {tables.length === 0 ? (
          <p className="py-3 text-ink-muted">No tables yet. Add them with the numbers guests see on the tables.</p>
        ) : (
          <ul>
            {tables.map((table) => (
              <TableRow key={table.id} venueId={venue.id} table={table} />
            ))}
          </ul>
        )}
        <ActionForm action={addTableRange.bind(null, venue.id)} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="From table" name="from" type="number" inputMode="numeric" min={1} required className="w-28" />
          <Field label="To table" name="to" type="number" inputMode="numeric" min={1} className="w-28" />
          <SubmitButton>Add tables</SubmitButton>
        </ActionForm>
      </section>

      <section aria-labelledby="managers" className="mt-10">
        <SectionHeading id="managers">Managers</SectionHeading>
        {staff.managers.length === 0 ? (
          <p className="py-3 text-ink-muted">No manager yet.</p>
        ) : (
          <ul>
            {staff.managers.map((manager) => (
              <li key={manager.userId} className="flex min-h-12 items-center border-b border-rule">
                {manager.name ?? "Manager"}
              </li>
            ))}
          </ul>
        )}
        {staff.invitations.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Waiting to accept</h3>
            <ul>
              {staff.invitations.map((invitation) => (
                <li key={invitation.invitationId} className="border-b border-rule py-2 text-sm">
                  {invitation.name} · <span className="break-all">{invitation.contact}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isOwner && (
          <ActionForm action={inviteVenueManager.bind(null, venue.id)} className="mt-4 space-y-3">
            <h3 className="text-sm font-semibold">Invite a manager</h3>
            <Field label="Name" name="name" autoComplete="off" required />
            <Field label="Email or phone" name="contact" autoComplete="off" required />
            <SubmitButton>Invite manager</SubmitButton>
          </ActionForm>
        )}
      </section>
    </>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">
      {children}
    </h2>
  );
}

function TableRow({ venueId, table }: { venueId: string; table: VenueTable }) {
  return (
    <li className="border-b border-rule py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          Table {table.number}
          {!table.active && <span className="ml-2 text-sm font-normal text-ink-muted">Not in use</span>}
        </span>
        <form action={setActive.bind(null, venueId, table.id, !table.active)}>
          <SubmitButton variant="quiet">{table.active ? "Deactivate" : "Reactivate"}</SubmitButton>
        </form>
      </div>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 min-w-11 cursor-pointer items-center text-sm font-medium underline">
          Change number
        </summary>
        <ActionForm action={renumber.bind(null, venueId, table.id)} className="flex flex-wrap items-end gap-3 pb-2">
          <Field
            label={`New number for table ${table.number}`}
            name="number"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={table.number}
            required
            className="w-44"
          />
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </details>
    </li>
  );
}
