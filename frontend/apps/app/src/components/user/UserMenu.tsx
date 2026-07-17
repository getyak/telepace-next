"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { routes } from "@telepace/config";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@telepace/ui";
import { ChevronDownIcon } from "@telepace/icons";

import { useAuth } from "../../lib/auth/AuthProvider";

/**
 * `collapsed` is only ever true for the desktop icon rail (64px), where the
 * name/email block and chevron have no room: the avatar alone carries the menu.
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean } = {}) {
  const t = useTranslations("nav.app.userMenu");
  const router = useRouter();
  const { status, user, logout } = useAuth();

  if (status === "loading") {
    return (
      <div className={cn("border-t border-hairline p-4", collapsed && "flex justify-center px-2")}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-pill" />
          {!collapsed && (
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === "guest" || !user) {
    return (
      <div className={cn("border-t border-hairline", collapsed ? "p-2" : "p-4")}>
        <Link
          href={routes.login}
          aria-label={collapsed ? t("signIn") : undefined}
          title={collapsed ? t("signIn") : undefined}
          className={cn(
            "tp-press tp-press-control block w-full rounded-btn border border-hairline text-center text-sm text-body transition-[color,background-color,transform] hover:bg-paper hover:text-ink",
            collapsed ? "px-0 py-2" : "px-3 py-2",
          )}
        >
          {/* At rail width the word won't fit — the arrow keeps the affordance. */}
          {collapsed ? "→" : t("signIn")}
        </Link>
      </div>
    );
  }

  const name = user.display_name || user.email.split("@")[0];
  const initial = (name[0] || "?").toUpperCase();

  return (
    <DropdownMenu className="border-t border-hairline">
      <DropdownMenuTrigger
        aria-label={collapsed ? name : undefined}
        title={collapsed ? `${name} · ${user.email}` : undefined}
        className={cn(
          "tp-press tp-press-row flex w-full items-center py-3 text-left transition-[color,background-color,transform] hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
          collapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-ink text-sm font-medium text-paper">
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{name}</span>
              <span className="block truncate text-xs text-muted">{user.email}</span>
            </span>
            <ChevronDownIcon size={14} className="shrink-0 rotate-180 text-muted" />
          </>
        )}
      </DropdownMenuTrigger>

      {/* Collapsed, the 64px rail is narrower than the menu: pin the panel's
          left edge to the rail and let it extend right, over the content. */}
      <DropdownMenuContent side="top" className={cn(collapsed ? "left-2 w-56" : "left-3 right-3")}>
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-xs text-muted">{t("signedInAs")}</p>
          <p className="truncate text-sm text-ink">{user.email}</p>
        </div>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#workspace`)}>
          {t("workspace")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#members`)}>
          {t("members")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#billing`)}>
          {t("billing")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${routes.app.settings}#api-keys`)}>
          {t("apiKeys")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-terracotta hover:text-terracotta"
          onSelect={() => {
            void logout();
          }}
        >
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
