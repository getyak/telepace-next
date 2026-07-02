import * as React from "react";
import { cn } from "../cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean };

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-hairline bg-paper-elevated",
        elevated ? "shadow-hover" : "shadow-none",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("border-b border-hairline px-6 py-4", className)} {...p} />
);

export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-6 py-5", className)} {...p} />
);

export const CardFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("border-t border-hairline px-6 py-4", className)} {...p} />
);
