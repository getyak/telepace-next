"use client";

import { Button } from "@telepace/ui";
import { env } from "@telepace/config";

/**
 * Google OAuth entry point (docs/ui-ux-optimization-plan.md Phase 2.2).
 * Hidden until NEXT_PUBLIC_OAUTH_GOOGLE=true, i.e. until the backend
 * /auth/oauth/google flow ships — renders nothing by default.
 */
export function OAuthButtons() {
  if (!env.oauthGoogleEnabled) return null;

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
