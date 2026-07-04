"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, icons } from "@telepace/ui";
import { routes } from "@telepace/config";

type NavLink = { href: string; label: string };

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center text-ink"
      >
        {open ? <icons.CloseIcon size={22} /> : <icons.MenuIcon size={22} />}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 top-16 z-30 flex flex-col bg-paper">
            <nav className="flex flex-1 flex-col justify-center gap-2 px-8">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="font-display text-3xl text-ink py-2 hover:text-accent transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-3 border-t border-hairline px-8 py-8">
              <Link href={routes.login} className="text-sm text-body hover:text-ink transition-colors">
                Sign in
              </Link>
              <Link href={routes.signup}>
                <Button className="w-full" size="lg">
                  Start free
                </Button>
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
