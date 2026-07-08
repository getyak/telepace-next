"use client";

import { Button } from "@telepace/ui";

export default function MarketingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-5xl text-muted mb-4">!</p>
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 text-body">
          An unexpected error occurred. Please try again or return to the homepage.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => reset()}>
            Try again
          </Button>
          <a href="/">
            <Button>Go home</Button>
          </a>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-8 text-left">
            <summary className="text-xs text-muted cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs text-muted whitespace-pre-wrap break-words">{error.message}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
