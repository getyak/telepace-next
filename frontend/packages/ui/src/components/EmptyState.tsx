import * as React from "react";
import { cn } from "../cn";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-16",
        className,
      )}
    >
      {icon && <div className="mb-5 text-muted">{icon}</div>}
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-body leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
