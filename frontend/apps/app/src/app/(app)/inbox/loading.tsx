import { Skeleton } from "@telepace/ui";

export default function InboxLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="mt-3 h-10 w-2/5" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
