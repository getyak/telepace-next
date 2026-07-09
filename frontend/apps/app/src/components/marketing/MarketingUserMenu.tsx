"use client";

/**
 * Top-bar auth affordance for the marketing site.
 *
 * Guest → the original "sign in" link + "start free" button (unchanged look).
 * Authenticated → an initial-avatar dropdown that opens downward, with a
 * shortcut back into the app, settings, and sign out. Mirrors the sidebar
 * `UserMenu` structure (components/user/UserMenu.tsx) but positioned for a
 * header instead of a sidebar footer.
 *
 * `initialHasSession` comes from the server (it reads the httpOnly session
 * cookie), so during the brief `useAuth()` "loading" window we render an
 * avatar skeleton instead of the guest buttons — no flash of "sign in" for
 * users who are already logged in.
 */

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { routes } from "@telepace/config";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@telepace/ui";
import { ChevronDownIcon } from "@telepace/icons";

import { useAuth } from "../../lib/auth/AuthProvider";

export type MarketingUserMenuLabels = {
  signIn: string;
  startFree: string;
  dashboard: string;
  settings: string;
  signOut: string;
  signedInAs: string;
};

function GuestActions({ labels }: { labels: MarketingUserMenuLabels }) {
  return (
    <>
      <Link href={routes.login} className="text-sm text-body transition-colors hover:text-ink">
        {labels.signIn}
      </Link>
      <Link href={routes.signup}>
        <Button size="sm">{labels.startFree}</Button>
      </Link>
    </>
  );
}

export function MarketingUserMenu({
  initialHasSession,
  labels,
}: {
  initialHasSession: boolean;
  labels: MarketingUserMenuLabels;
}) {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  // Resolving /me. Bias the placeholder toward the server's cookie hint so
  // returning users don't see the guest buttons flash before the avatar.
  if (status === "loading") {
    if (initialHasSession) {
      return <Skeleton className="h-9 w-9 rounded-pill" />;
    }
    return <GuestActions labels={labels} />;
  }

  if (status === "guest" || !user) {
    return <GuestActions labels={labels} />;
  }

  const name = user.display_name || user.email.split("@")[0];
  const initial = (name[0] || "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-pill transition-opacity hover:opacity-80">
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-ink text-sm font-medium text-paper">
          {initial}
        </span>
        <ChevronDownIcon size={14} className="text-muted" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" className="right-0">
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-xs text-muted">{labels.signedInAs}</p>
          <p className="truncate text-sm text-ink">{user.email}</p>
        </div>
        <DropdownMenuItem onSelect={() => router.push(routes.app.root)}>
          {labels.dashboard}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(routes.app.settings)}>
          {labels.settings}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-terracotta hover:text-terracotta"
          onSelect={() => {
            void logout();
          }}
        >
          {labels.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
