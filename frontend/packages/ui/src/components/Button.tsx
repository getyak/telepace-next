import * as React from "react";
import { cn } from "../cn";
import { Spinner } from "./Spinner";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "inverse" | "inverse-outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed rounded-btn";

const variants = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  secondary: "bg-transparent text-ink border border-hairline hover:bg-paper-elevated",
  ghost: "bg-transparent text-body hover:text-ink",
  danger: "bg-danger text-paper hover:bg-danger/90",
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

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && <Spinner size={spinnerSize[size]} />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
