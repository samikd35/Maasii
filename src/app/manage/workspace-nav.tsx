"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceLink = { href: string; label: string; nested?: boolean; alsoCurrent?: string };

export function WorkspaceNav({ label, links, className = "" }: {
  label: string; links: WorkspaceLink[]; className?: string;
}) {
  const pathname = usePathname();
  const current = links.find(link => link.href === pathname || link.alsoCurrent === pathname)
    ?? links.find(link => link.nested && pathname.startsWith(link.href + "/"));
  return <nav aria-label={label} className={"workspace-nav " + className}>
    {links.map(link => <Link key={link.href} href={link.href} prefetch={false} aria-current={link === current ? "page" : undefined}>
      {link.label}
    </Link>)}
  </nav>;
}
