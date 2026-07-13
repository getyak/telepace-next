"use client";

import * as React from "react";
import { cn } from "../cn";

/**
 * Lightweight dropdown menu — no portal, no dependency. Handles outside
 * click + Esc; positioning is class-driven via `align`/`side` on Content.
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger>…</DropdownMenuTrigger>
 *     <DropdownMenuContent>
 *       <DropdownMenuItem onSelect={…}>…</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 */

type MenuContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const MenuContext = React.createContext<MenuContextValue | null>(null);

function useMenu(): MenuContextValue {
  const ctx = React.useContext(MenuContext);
  if (!ctx) throw new Error("DropdownMenu.* must be used within <DropdownMenu>");
  return ctx;
}

export function DropdownMenu({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
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

  return (
    <MenuContext.Provider value={{ open, setOpen }}>
      <div ref={rootRef} className={cn("relative", className)}>
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = useMenu();
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  side = "bottom",
  children,
}: {
  className?: string;
  /** Which side of the trigger the menu opens toward. */
  side?: "bottom" | "top";
  children: React.ReactNode;
}) {
  const { open } = useMenu();
  if (!open) return null;
  return (
    <div
      role="menu"
      className={cn(
        "tp-fade-in-up absolute z-50 min-w-[180px] overflow-hidden rounded-card border border-hairline bg-paper-elevated py-1 shadow-overlay",
        side === "bottom" ? "top-full mt-2 origin-top" : "bottom-full mb-2 origin-bottom",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  className,
  onSelect,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { onSelect?: () => void }) {
  const { setOpen } = useMenu();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        setOpen(false);
      }}
      className={cn(
        "block w-full px-4 py-2 text-left text-sm text-body transition-colors hover:bg-paper hover:text-ink " +
          "active:bg-paper-sunken focus-visible:bg-paper focus-visible:text-ink focus-visible:outline-none " +
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 border-t border-hairline", className)} />;
}
