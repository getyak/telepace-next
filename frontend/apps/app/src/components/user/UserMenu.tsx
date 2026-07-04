"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { routes } from "@telepace/config";

import { useAuth } from "../../lib/auth/AuthProvider";

export function UserMenu() {
  const { status, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(evt: MouseEvent) {
      if (!rootRef.current?.contains(evt.target as Node)) setOpen(false);
    }
    function onEsc(evt: KeyboardEvent) {
      if (evt.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (status === "loading") {
    return (
      <div className="p-4 border-t border-hairline">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-paper animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 bg-paper rounded animate-pulse" />
            <div className="h-2.5 w-32 bg-paper rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (status === "guest" || !user) {
    return (
      <div className="p-4 border-t border-hairline">
        <Link
          href={routes.login}
          className="block w-full text-center rounded-btn border border-hairline px-3 py-2 text-sm text-body hover:bg-paper hover:text-ink transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const name = user.display_name || user.email.split("@")[0];
  const initial = (name[0] || "?").toUpperCase();

  return (
    <div ref={rootRef} className="relative border-t border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-paper transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center font-medium text-sm">
          {initial}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-ink truncate">{name}</span>
          <span className="block text-xs text-muted truncate">{user.email}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-3 right-3 mb-2 rounded-card border border-hairline bg-paper-elevated shadow-lg overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-hairline">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="text-sm text-ink truncate">{user.email}</p>
          </div>
          <nav className="py-1 text-sm">
            <MenuLink href={`${routes.app.settings}#workspace`} onClick={() => setOpen(false)}>
              Workspace
            </MenuLink>
            <MenuLink href={`${routes.app.settings}#members`} onClick={() => setOpen(false)}>
              Members
            </MenuLink>
            <MenuLink href={`${routes.app.settings}#billing`} onClick={() => setOpen(false)}>
              Billing
            </MenuLink>
            <MenuLink href={`${routes.app.settings}#api-keys`} onClick={() => setOpen(false)}>
              API keys
            </MenuLink>
          </nav>
          <div className="border-t border-hairline py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="w-full text-left px-4 py-2 text-sm text-terracotta hover:bg-paper transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block px-4 py-2 text-body hover:bg-paper hover:text-ink transition-colors"
    >
      {children}
    </Link>
  );
}
