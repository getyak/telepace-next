import * as React from "react";
import { cn } from "../cn";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "neutral" | "accent" | "success" | "warning" | "danger";
};

const variants = {
  neutral: "bg-paper-sunken text-body",
  accent: "bg-accent-soft text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium leading-normal",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
