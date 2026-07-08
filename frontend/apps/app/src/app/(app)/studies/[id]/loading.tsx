import { Skeleton } from "@telepace/ui";

export default function StudyDetailLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      {/* Back link */}
      <Skeleton className="h-4 w-24 mb-6" />

      {/* Header */}
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-10 w-3/4 mb-3" />
      <Skeleton className="h-4 w-2/3" />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-card" />
        ))}
      </div>

      {/* Outline section */}
      <div className="mt-14 space-y-3">
        <Skeleton className="h-4 w-16 mb-4" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
