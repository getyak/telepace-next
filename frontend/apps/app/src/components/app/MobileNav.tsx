"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { routes, siteConfig } from "@telepace/config";

import { UserMenu } from "../user/UserMenu";
import { isNavItemActive, primaryNavItems, workspaceNavItems } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(evt: KeyboardEvent) {
      if (evt.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className="md:hidden border-b border-hairline sticky top-0 z-40 bg-paper flex items-center justify-between h-14 px-4">
        <Link href={routes.app.root} className="font-display text-xl">
          {siteConfig.brand.name}
        </Link>
        <button
          type="button"
          className="p-2 text-ink"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-30 bg-paper flex flex-col md:hidden">
          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
            {primaryNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-btn px-3 py-3 font-display text-2xl ${
                  isNavItemActive(item, pathname) ? "text-ink" : "text-body"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <p className="overline mt-4 mb-1 px-3">Workspace</p>
            {workspaceNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-btn px-3 py-3 font-display text-2xl ${
                  isNavItemActive(item, pathname) ? "text-ink" : "text-body"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <UserMenu />
        </div>
      )}
    </>
  );
}
