import Link from "next/link";
import { signOut } from "@/lib/sign-out";

/** The top bar of every management and platform admin screen. */
export function StaffHeader({ home, label }: { home: string; label: string }) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-1">
        <Link href={home} className="inline-flex min-h-11 items-center font-display text-xl font-semibold">
          Maasii <span className="ml-2 text-sm font-normal text-ink-muted">{label}</span>
        </Link>
        <form action={signOut}>
          <button type="submit" className="min-h-11 min-w-11 px-2 text-sm font-medium underline">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
