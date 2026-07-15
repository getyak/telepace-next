import * as React from "react";
import { cn } from "../cn";
import { Spinner } from "./Spinner";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "danger"
    | "inverse"
    | "inverse-outline";
  size?: "sm" | "md" | "lg";
  /** Shows a spinner and blocks clicks while an async action runs. */
  loading?: boolean;
  /**
   * Square, icon-only button (no text). Takes the `icon` rung of the press
   * ladder — a small target needs a deeper scale to travel the same ~1.5px a
   * text button does. Pair with an `aria-label`.
   */
  icon?: boolean;
};

const base =
  // Press feedback comes from the `tp-press` ladder (see globals.css): the dip
  // is faster than the release, and the rung is graded by size so every
  // control travels the same perceived distance. Colour transitions stay here;
  // the transform belongs to the ladder.
  "inline-flex items-center justify-center gap-2 font-medium tp-press " +
  "transition-[color,background-color,transform] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed " +
  // A disabled control must not pretend to respond.
  "disabled:active:transform-none rounded-btn";

const variants = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  secondary: "bg-transparent text-ink border border-hairline hover:bg-paper-elevated",
  ghost: "bg-transparent text-body hover:text-ink",
  danger: "bg-danger text-paper hover:bg-danger/90",
  // For dark (bg-ink) sections — replaces ad-hoc className overrides.
  inverse: "bg-paper text-ink hover:bg-paper-elevated",
  "inverse-outline": "bg-transparent text-paper border border-paper/30 hover:bg-paper/10",
};

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const spinnerSize = {
  sm: 12,
  md: 14,
  lg: 16,
};

const iconSizes = {
  sm: "h-8 w-8 p-0",
  md: "h-10 w-10 p-0",
  lg: "h-12 w-12 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        variants[variant],
        icon ? iconSizes[size] : sizes[size],
        icon ? "tp-press-icon" : "tp-press-control",
        className,
      )}
      {...props}
    >
      {loading && <Spinner size={spinnerSize[size]} />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
