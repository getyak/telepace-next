import * as React from "react";
import { cn } from "../cn";

type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-hairline px-8 py-16 text-center",
        className,
      )}
      {...props}
    >
      {icon && <div className="mb-4 text-muted">{icon}</div>}
      <h3 className="font-display text-2xl">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-body">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
