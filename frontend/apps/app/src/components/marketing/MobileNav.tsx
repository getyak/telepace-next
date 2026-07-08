"use client";

/**
 * Mobile navigation: hamburger (two thin lines) → full-screen paper
 * overlay with display-size links. Reference: anthropic.com mobile menu.
 * Locks body scroll while open; closes on Esc and on route change.
 */

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { Button } from "@telepace/ui";
import { CloseIcon, MenuIcon } from "@telepace/icons";
import { routes, siteConfig } from "@telepace/config";

export type NavLink = { href: string; label: string };

export function MobileNav({
  links,
  signInLabel,
  startFreeLabel,
  openMenuLabel,
  closeMenuLabel,
}: {
  links: NavLink[];
  signInLabel: string;
  startFreeLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Route change closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Body scroll lock + Esc while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEsc(evt: KeyboardEvent) {
      if (evt.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? closeMenuLabel : openMenuLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-m-2 p-2 text-ink"
      >
        {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-paper">
          <div className="container-content flex h-16 items-center justify-between border-b border-hairline">
            <Link href={routes.home} className="font-display text-xl" onClick={() => setOpen(false)}>
              {siteConfig.brand.name}
            </Link>
            <button
              type="button"
              aria-label={closeMenuLabel}
              onClick={() => setOpen(false)}
              className="-m-2 p-2 text-ink"
            >
              <CloseIcon size={20} />
            </button>
          </div>

          <nav className="container-content flex flex-1 flex-col gap-6 overflow-y-auto py-10">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="font-display text-3xl transition-colors hover:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="container-content flex items-center gap-3 border-t border-hairline py-6">
            <Link href={routes.login} onClick={() => setOpen(false)} className="flex-1">
              <Button variant="secondary" className="w-full">
                {signInLabel}
              </Button>
            </Link>
            <Link href={routes.signup} onClick={() => setOpen(false)} className="flex-1">
              <Button className="w-full">{startFreeLabel}</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
