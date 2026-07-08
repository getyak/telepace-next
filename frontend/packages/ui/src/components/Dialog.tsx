"use client";

import * as React from "react";
import { cn } from "../cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * Modal dialog built on the native `<dialog>` element: focus trap, Esc,
 * and top-layer stacking come for free. Entry scales 0.98 → 1 over
 * `motion.base`; backdrop styling lives in globals.css.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(evt) => {
        // Click on the backdrop (the dialog element itself) dismisses.
        if (evt.target === ref.current) onClose();
      }}
      className={cn(
        "tp-dialog m-auto w-full max-w-md rounded-card border border-hairline bg-paper-elevated p-0 text-ink shadow-overlay",
        className,
      )}
    >
      <div className="p-6">
        {title && <h2 className="font-display text-2xl">{title}</h2>}
        <div className={title ? "mt-4" : undefined}>{children}</div>
      </div>
    </dialog>
  );
}
