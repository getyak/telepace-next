import { Skeleton } from "@telepace/ui";

// Mirrors insights/page.tsx: PageHeader over a stack of tall theme Cards.
export default function InsightsLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <div className="mb-10 flex items-end justify-between border-b border-hairline pb-6">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-28 shrink-0" />
      </div>
      <div className="grid gap-6">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
