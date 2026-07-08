"use client";

import { Button } from "@telepace/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-content p-10">
      <div className="mt-16 text-center">
        <p className="font-mono text-5xl text-muted mb-4">!</p>
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 max-w-md mx-auto text-body">
          An unexpected error occurred. Your data is safe — try again or refresh the page.
        </p>
        <Button className="mt-6" onClick={() => reset()}>
          Try again
        </Button>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-8 text-left max-w-lg mx-auto">
            <summary className="text-xs text-muted cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs text-muted whitespace-pre-wrap break-words">{error.message}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
