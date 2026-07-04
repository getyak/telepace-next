"use client";

import * as React from "react";
import { cn } from "../cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * Thin wrapper over the native <dialog> element — gets us focus trapping,
 * Esc-to-close, and top-layer stacking for free.
 */
export function Dialog({ open, onClose, children, className, ...rest }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto rounded-card border border-hairline bg-paper-elevated p-0 shadow-overlay backdrop:bg-ink/40",
        "open:animate-dialog-in",
        className,
      )}
      {...rest}
    >
      {children}
    </dialog>
  );
}
