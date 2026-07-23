"use client";

/**
 * Desktop nav links with a current-page state (trunk test: "where am I?").
 * Active = full ink + a hairline underline offset below the text — an
 * editorial marker, not a pill. Everything else stays in the body rung.
 */

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";

import type { NavLink } from "./MobileNav";

export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-8 text-sm text-body">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`tp-press-text transition-[color,opacity] rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
              active
                ? "text-ink underline decoration-hairline decoration-1 underline-offset-8"
                : "hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
