import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getPublishedMenu, publicActor, type GuestMenuSection } from "@/core";
import { Price } from "@/ui/price";
import { OpenDishButton, Ordering } from "./ordering";

const loadMenu = cache(async (venueLinkToken: string) => {
  await connection();
  return getPublishedMenu(publicActor, { venueLinkToken });
});

export async function generateMetadata({ params }: PageProps<"/v/[token]">): Promise<Metadata> {
  const menu = await loadMenu((await params).token);
  if (!menu) return { title: "Menu not found · Maasii" };
  return { title: `${menu.brand.name} · ${menu.venue.name} menu` };
}

export default async function GuestMenuPage({ params }: PageProps<"/v/[token]">) {
  const menu = await loadMenu((await params).token);
  if (!menu) notFound();

  return (
    <div className="mx-auto max-w-xl pb-28">
      <header className="flex min-h-16 items-center justify-between gap-3 px-5 pt-3">
        {menu.brand.logoUrl ? (
          // A plain <img>: next/image would add client JavaScript to a page with a tight weight budget.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.brand.logoUrl} alt={menu.brand.name} height={48} className="h-12 w-auto" />
        ) : (
          <span className="font-display text-xl font-semibold">{menu.brand.name}</span>
        )}
      </header>

      <main>
        <div className="px-5 pt-6">
          <p className="text-sm text-ink-muted">
            {menu.brand.name} · {menu.venue.name}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-tight">Our menu</h1>
        </div>

        {menu.sections.length === 0 ? (
          <p className="px-5 pt-6 text-ink-muted">The menu is on its way. Please ask a member of staff.</p>
        ) : (
          <>
            <SectionChips sections={menu.sections} />
            {menu.sections.map((section) => (
              <MenuSection key={section.id} section={section} />
            ))}
          </>
        )}
      </main>
      <Ordering venueLinkToken={menu.venue.linkToken} sections={menu.sections} />
    </div>
  );
}

function SectionChips({ sections }: { sections: GuestMenuSection[] }) {
  return (
    <nav
      aria-label="Menu sections"
      className="sticky top-0 z-10 mt-4 border-b border-rule bg-paper/95 backdrop-blur-sm"
    >
      <ul className="flex gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none]">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#section-${section.id}`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-ink/25 px-4 text-sm font-medium whitespace-nowrap hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {section.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MenuSection({ section }: { section: GuestMenuSection }) {
  const headingId = `section-${section.id}-heading`;
  return (
    <section id={`section-${section.id}`} aria-labelledby={headingId} className="scroll-mt-20 px-5 pt-8">
      <div className="flex items-baseline justify-between border-b border-ink/70 pb-1.5">
        <h2 id={headingId} className="text-sm font-semibold tracking-wide uppercase">
          {section.name}
        </h2>
        <span aria-hidden className="text-xs font-medium text-ink-muted">
          ETB
        </span>
      </div>
      <ul>
        {section.dishes.map((dish) => (
          <li key={dish.id} className="relative flex items-start justify-between gap-4 border-b border-rule py-3.5">
            <div className="min-w-0">
              <h3 id={`dish-${dish.id}-name`} className="text-[1.0625rem] leading-snug font-semibold">
                {dish.name}
              </h3>
              {dish.description && (
                <p id={`dish-${dish.id}-description`} className="mt-0.5 text-sm leading-snug text-ink-muted">
                  {dish.description}
                </p>
              )}
            </div>
            <Price santim={dish.priceSantim} />
            <OpenDishButton
              dishId={dish.id}
              labelledBy={`dish-${dish.id}-name`}
              describedBy={dish.description ? `dish-${dish.id}-description` : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
