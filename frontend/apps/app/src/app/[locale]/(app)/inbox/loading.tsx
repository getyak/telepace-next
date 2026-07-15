import { Skeleton } from "@telepace/ui";

// Mirrors inbox/page.tsx: PageHeader over a single Card of divided rows.
export default function InboxLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <div className="mb-10 flex items-end justify-between border-b border-hairline pb-6">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-28 shrink-0" />
      </div>
      <div className="space-y-px overflow-hidden rounded-md border border-hairline">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
