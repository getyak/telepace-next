import { Skeleton } from "@telepace/ui";

export default function StudiesLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <div className="mb-10 flex items-end justify-between border-b border-hairline pb-6">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 shrink-0" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-[72px] w-full" />
      </div>
    </div>
  );
}
