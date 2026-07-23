"use client";

/**
 * Workspace + members settings, derived from the signed-in user.
 *
 * There is no workspace CRUD backend yet — but that must never mean showing
 * someone else's company as placeholder copy. Name and slug default from the
 * caller's own identity (email local-part), and the members list is exactly
 * the people we actually know about: the caller. Real editing arrives with
 * the org settings API; until then the save action is disabled and says so.
 */

import { Button, Card, CardBody, CardFooter, Input, Label, Skeleton } from "@telepace/ui";

import { useAuth } from "@/lib/auth/AuthProvider";

/** "jane.doe@acme.com" → "jane-doe" — a URL-safe slug from the local part. */
function slugFromEmail(email: string): string {
  const local = email.split("@")[0] || "workspace";
  return (
    local
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

export function workspaceSlugFor(email: string | undefined): string {
  return email ? slugFromEmail(email) : "workspace";
}

export function WorkspacePanel({
  labels,
}: {
  labels: {
    workspaceName: string;
    workspaceNameHint: string;
    urlSlug: string;
    urlSlugHint: string;
    saveChanges: string;
  };
}) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <Card>
        <CardBody className="space-y-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardBody>
      </Card>
    );
  }

  const displayName = user?.display_name || user?.email.split("@")[0] || "";
  const defaultName = displayName ? `${displayName}'s workspace` : "";
  const defaultSlug = workspaceSlugFor(user?.email);

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <Label htmlFor="ws-name">{labels.workspaceName}</Label>
          <Input id="ws-name" defaultValue={defaultName} aria-describedby="ws-name-hint" />
          <p id="ws-name-hint" className="mt-1.5 text-xs text-muted">
            {labels.workspaceNameHint}
          </p>
        </div>
        <div>
          <Label htmlFor="ws-slug">{labels.urlSlug}</Label>
          <Input id="ws-slug" defaultValue={defaultSlug} aria-describedby="ws-slug-hint" />
          <p id="ws-slug-hint" className="mt-1.5 text-xs text-muted">
            {labels.urlSlugHint}
          </p>
        </div>
      </CardBody>
      {/* The commit sits on its own hairline shelf, mapped to the fields above. */}
      <CardFooter className="flex justify-end">
        <Button size="sm" disabled>
          {labels.saveChanges}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function McpPanel({
  labels,
}: {
  labels: {
    mcpEndpointIntro: string;
    mcpAuthHint: string;
  };
}) {
  const { user } = useAuth();
  const slug = workspaceSlugFor(user?.email);

  return (
    <Card>
      <CardBody>
        <p className="text-body">{labels.mcpEndpointIntro}</p>
        <pre className="mt-3 overflow-x-auto rounded-btn bg-paper-sunken p-3 font-mono text-sm text-ink">
          https://mcp.telepace.io/w/{slug}
        </pre>
        <p className="mt-3 text-xs text-muted">{labels.mcpAuthHint}</p>
      </CardBody>
    </Card>
  );
}

export function MembersPanel({
  labels,
}: {
  labels: {
    roleOwner: string;
    seatsHint: string;
    inviteMember: string;
  };
}) {
  const { user, status } = useAuth();

  return (
    <Card>
      <ul className="divide-y divide-hairline">
        <li className="flex items-center justify-between gap-4 px-6 py-4">
          {status === "loading" || !user ? (
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          ) : (
            <>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  {user.display_name || user.email.split("@")[0]}
                </p>
                <p className="truncate text-sm text-muted">{user.email}</p>
              </div>
              <span className="shrink-0 text-sm text-body">{labels.roleOwner}</span>
            </>
          )}
        </li>
      </ul>
      <CardFooter className="flex items-center justify-between">
        <p className="text-xs text-muted">{labels.seatsHint}</p>
        <Button variant="secondary" size="sm" disabled>
          {labels.inviteMember}
        </Button>
      </CardFooter>
    </Card>
  );
}
