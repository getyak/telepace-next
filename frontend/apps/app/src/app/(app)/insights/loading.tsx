import { Skeleton } from "@telepace/ui";

export default function InsightsLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-3 h-10 w-1/2" />
      <div className="mt-10 space-y-6">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
