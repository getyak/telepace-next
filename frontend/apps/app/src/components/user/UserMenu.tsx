"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { routes } from "@telepace/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@telepace/ui";
import { ChevronDownIcon } from "@telepace/icons";

import { useAuth } from "../../lib/auth/AuthProvider";

export function UserMenu() {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  if (status === "loading") {
    return (
      <div className="border-t border-hairline p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-pill" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (status === "guest" || !user) {
    return (
      <div className="border-t border-hairline p-4">
        <Link
          href={routes.login}
          className="block w-full rounded-btn border border-hairline px-3 py-2 text-center text-sm text-body transition-colors hover:bg-paper hover:text-ink"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const name = user.display_name || user.email.split("@")[0];
  const initial = (name[0] || "?").toUpperCase();

  return (
    <DropdownMenu className="border-t border-hairline">
      <DropdownMenuTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper">
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-ink text-sm font-medium text-paper">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-muted">{user.email}</span>
        </span>
        <ChevronDownIcon size={14} className="shrink-0 rotate-180 text-muted" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" className="left-3 right-3">
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-xs text-muted">Signed in as</p>
          <p className="truncate text-sm text-ink">{user.email}</p>
        </div>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#workspace`)}>
          Workspace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#members`)}>
          Members
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#billing`)}>
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#api-keys`)}>
          API keys
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-terracotta hover:text-terracotta"
          onSelect={() => {
            void logout();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
