import { Link } from "@/i18n/navigation";
import { routes, siteConfig } from "@telepace/config";
import { Card } from "@telepace/ui";

/**
 * Shared shell for /login and /signup — single centered column, Linear-style.
 * Both pages must stay visually identical apart from their form fields.
 */
export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-8 text-center">
        <Link href={routes.home} className="font-display text-2xl">
          {siteConfig.brand.name}
        </Link>
      </div>

      <Card className="p-8">
        <h1 className="font-display text-3xl">{title}</h1>
        <div className="mt-6">{children}</div>
      </Card>

      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
