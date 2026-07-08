import { Skeleton } from "@telepace/ui";

export default function StudyDetailLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <Skeleton className="h-3 w-32" />
      <div className="mt-10 flex items-end justify-between border-b border-hairline pb-6">
        <div className="space-y-3">
          <Skeleton className="h-9 w-96 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-28 shrink-0" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
