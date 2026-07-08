import Link from "next/link";
import { routes, siteConfig } from "@telepace/config";

/**
 * Shared shell for /login and /signup — single source of truth for the
 * auth page skin so the two flows can't drift in visual/copy details
 * (see docs/ui-ux-optimization-plan.md Phase 2.1/2.3).
 */
export function AuthCard({
  overline,
  title,
  footer,
  children,
}: {
  overline: string;
  title: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 bg-paper">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href={routes.home} className="font-display text-2xl">
            {siteConfig.brand.name}
          </Link>
          <p className="overline mt-4">{overline}</p>
          <h1 className="font-display text-3xl mt-2">{title}</h1>
        </div>

        {children}

        <p className="text-center text-sm text-muted mt-6">{footer}</p>
      </div>
    </div>
  );
}
