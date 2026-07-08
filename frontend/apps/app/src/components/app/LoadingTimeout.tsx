"use client";

import { useEffect, useState } from "react";
import { Button } from "@telepace/ui";

export function LoadingTimeout({
  loading,
  timeoutMs = 15000,
  onRetry,
  children,
  loadingFallback,
}: {
  loading: boolean;
  timeoutMs?: number;
  onRetry?: () => void;
  children: React.ReactNode;
  loadingFallback: React.ReactNode;
}) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [loading, timeoutMs]);

  if (!loading) return <>{children}</>;

  if (timedOut) {
    return (
      <div className="mx-auto max-w-content p-10">
        <div className="mt-16 text-center">
          <h2 className="font-display text-2xl">This is taking longer than expected</h2>
          <p className="mt-3 text-body max-w-md mx-auto">
            The server may be slow. You can retry or come back later.
          </p>
          {onRetry && (
            <Button className="mt-6" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return <>{loadingFallback}</>;
}
