"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { WaiterIcon } from "@/ui/waiter-icon";

export type WorkspaceLink = { href: string; label: string; accessibleLabel?: string; nested?: boolean; sectionHref?: string; icon?: ComponentProps<typeof WaiterIcon>["name"] };

export function WorkspaceNav({ label, links, className = "", detail }: {
  label: string; links: WorkspaceLink[]; className?: string;
  detail?: { path: string; label: string; links: WorkspaceLink[]; current: string };
}) {
  const pathname = usePathname();
  const detailActive = detail && pathname === detail.path;
  if (detailActive) {
    links = detail.links;
    label = detail.label;
  }
  const currentPath = detailActive ? detail.current : pathname;
  const current = links.find(link => link.href === currentPath)
    ?? links.find(link => link.sectionHref === pathname || (link.nested && pathname.startsWith(link.href + "/")));
  return <nav aria-label={label} className={"workspace-nav " + className}>
    {links.map(link => <Link key={link.href} href={link.href} prefetch={false} aria-label={link.accessibleLabel}
      aria-current={link === current ? (link.href === pathname ? "page" : "location") : undefined}>
      {link.icon && <span className="manager-nav-icon"><WaiterIcon name={link.icon} /></span>}
      <span>{link.label}</span>
    </Link>)}
  </nav>;
}
