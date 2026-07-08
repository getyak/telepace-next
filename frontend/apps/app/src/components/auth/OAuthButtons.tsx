"use client";

import { Button } from "@telepace/ui";

/**
 * Google OAuth entry point (docs/ui-ux-optimization-plan.md Phase 2.2).
 * Hidden until NEXT_PUBLIC_OAUTH_GOOGLE=true, i.e. until the backend
 * /auth/oauth/google flow ships — renders nothing by default.
 *
 * Reads process.env directly rather than `@telepace/config`'s `env` proxy:
 * that proxy validates the unrelated required API/WS base URLs on every
 * property access, which would fail static prerendering of this page in
 * any build environment that hasn't set them.
 */
export function OAuthButtons() {
  if (process.env.NEXT_PUBLIC_OAUTH_GOOGLE !== "true") return null;

  return (
    <div className="space-y-4 mb-4">
      <Button
        variant="secondary"
        type="button"
        className="w-full"
        onClick={() => {
          window.location.href = "/api/auth/oauth/google";
        }}
      >
        Continue with Google
      </Button>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-hairline" />
        <span className="text-xs uppercase tracking-widest text-muted">or</span>
        <div className="h-px flex-1 bg-hairline" />
      </div>
    </div>
  );
}
