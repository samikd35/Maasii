import Link from "next/link";
import { notFound } from "next/navigation";
import { listBrands, MaasiiError, type Actor } from "@/core";
import { requireAdmin } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { addBrand } from "./actions";

async function load(actor: Actor) {
  try {
    return await listBrands(actor);
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function AdminHome() {
  const brands = await load(await requireAdmin());

  return (
    <>
      <h1 className="font-display text-3xl">Brands</h1>
      <ActionForm action={addBrand} className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="Brand name" name="name" required className="min-w-0 flex-1" />
        <SubmitButton>Create brand</SubmitButton>
      </ActionForm>

      <ul className="mt-6">
        {brands.map((brand) => (
          <li key={brand.id} className="border-b border-rule">
            <Link href={`/admin/brands/${brand.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <span>
                <span className="font-semibold">{brand.name}</span>
                <span className="block text-sm text-ink-muted">
                  {brand.venueCount === 1 ? "1 venue" : `${brand.venueCount} venues`}
                </span>
              </span>
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
