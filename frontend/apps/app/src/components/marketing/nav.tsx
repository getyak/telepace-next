"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, icons } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";

const navLinks = [
  { href: routes.product.voice, label: "Voice" },
  { href: routes.product.agent, label: "Agent" },
  { href: routes.pricing, label: "Pricing" },
  { href: routes.docs, label: "Docs" },
  { href: routes.mcp, label: "MCP" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll + close on Escape while the overlay is open.
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
      <header className="border-b border-hairline sticky top-0 z-40 bg-paper/85 backdrop-blur">
        <div className="container-content flex items-center justify-between h-16">
          <Link href={routes.home} className="tp-press-text font-display text-xl">
            {siteConfig.brand.name}
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-body">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="tp-press-text hover:text-ink transition-[color,opacity]">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link href={routes.login} className="tp-press-text text-sm text-body hover:text-ink transition-[color,opacity]">
              Sign in
            </Link>
            <Link href={routes.signup}>
              <Button size="sm">Start free</Button>
            </Link>
          </div>
          <button
            type="button"
            className="tp-press tp-press-icon md:hidden -mr-2 p-2 text-ink rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <icons.CloseIcon size={20} /> : <icons.MenuIcon size={20} />}
          </button>
        </div>
      </header>

      {open && (
        // Rendered as a sibling of <header>, not a descendant: the header's
        // `backdrop-blur` establishes a containing block for fixed-position
        // descendants, which would collapse a nested `fixed top-16 bottom-0`
        // overlay to zero height.
        <div className="fixed inset-x-0 top-16 bottom-0 z-30 bg-paper flex flex-col md:hidden">
          <nav className="flex-1 overflow-y-auto px-6 py-10 flex flex-col gap-2">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="tp-press-text font-display text-3xl py-2">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-hairline px-6 py-6 flex flex-col gap-3">
            <Link href={routes.login} className="tp-press tp-press-control block text-center rounded-btn border border-hairline py-3 text-sm text-body">
              Sign in
            </Link>
            <Link href={routes.signup}>
              <Button size="lg" className="w-full">
                Start free
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
