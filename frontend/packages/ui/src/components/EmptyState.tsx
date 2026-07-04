import * as React from "react";
import { cn } from "../cn";

type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6",
        className,
      )}
      {...props}
    >
      {icon && <div className="mb-5 text-muted">{icon}</div>}
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      {description && <p className="mt-2 text-body max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
