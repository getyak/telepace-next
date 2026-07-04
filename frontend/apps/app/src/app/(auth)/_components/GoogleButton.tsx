"use client";

/**
 * "Continue with Google" — rendered only when NEXT_PUBLIC_OAUTH_GOOGLE is
 * set (the backend flow ships separately). Includes the Vercel-style
 * "Last used" memory pill.
 */

import { Button } from "@telepace/ui";
import { GoogleIcon } from "@telepace/icons";

export function GoogleButton({ lastUsed }: { lastUsed: boolean }) {
  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        className="h-11 w-full"
        onClick={() => {
          // The OAuth entry point is a full-page navigation, not an XHR.
          window.location.href = "/api/auth/oauth/google";
        }}
      >
        <GoogleIcon size={16} />
        Continue with Google
      </Button>
      {lastUsed && (
        <span className="absolute -right-2 -top-2 rounded-pill bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
          Last used
        </span>
      )}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <div className="h-px flex-1 bg-hairline" />
      <span className="text-xs uppercase tracking-widest text-muted">or</span>
      <div className="h-px flex-1 bg-hairline" />
    </div>
  );
}
