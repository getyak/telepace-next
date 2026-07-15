"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@telepace/ui";

import { useErrorCopy } from "@/components/app/errorBoundaryCopy";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const c = useErrorCopy();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-content items-center justify-center p-6 md:p-10">
      <EmptyState
        className="w-full"
        title={c.title}
        description={c.description}
        action={<Button onClick={reset}>{c.retry}</Button>}
      />
    </div>
  );
}
