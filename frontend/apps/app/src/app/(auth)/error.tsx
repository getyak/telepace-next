"use client";

import { Button } from "@telepace/ui";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full rounded-card border border-hairline bg-paper-elevated p-8 text-center">
        <p className="font-mono text-4xl text-muted mb-4">!</p>
        <h1 className="font-display text-2xl">Authentication error</h1>
        <p className="mt-3 text-sm text-body">
          Something went wrong during sign-in. Please try again.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <a href="/" className="text-sm text-muted hover:text-ink transition-colors mt-2">
            Go home
          </a>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-6 text-left">
            <summary className="text-xs text-muted cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs text-muted whitespace-pre-wrap break-words">{error.message}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
