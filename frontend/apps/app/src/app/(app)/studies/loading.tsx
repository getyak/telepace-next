import { Skeleton } from "@telepace/ui";

export default function StudiesLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-10 w-2/3" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-full" />
        ))}
      </div>
    </div>
  );
}
