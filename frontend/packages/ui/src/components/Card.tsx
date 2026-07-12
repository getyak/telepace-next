import * as React from "react";
import { cn } from "../cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Rests on a hover shadow instead of flat. For cards that sit above paper. */
  elevated?: boolean;
  /**
   * For clickable cards. Adds a subtle hover lift and — the Apple part — an
   * immediate press-down the instant a pointer goes down (not on release), so
   * the card acknowledges touch before the navigation resolves. Reverts under
   * `prefers-reduced-motion`. Pair with an <a>/role="button" wrapper or pass
   * `onClick`; this only styles the surface.
   */
  interactive?: boolean;
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-hairline bg-paper-elevated",
        elevated ? "shadow-hover" : "shadow-none",
        interactive &&
          // transform + shadow only (compositor-friendly). The press state is
          // faster than the settle so touch-down reads as instant and release
          // eases back — Apple's "respond on the way down" feel.
          "transform-gpu cursor-pointer transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
            "hover:-translate-y-0.5 hover:shadow-hover active:translate-y-0 active:scale-[0.994] active:shadow-none active:duration-75 " +
            "motion-reduce:transform-none motion-reduce:transition-none",
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
