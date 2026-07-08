import { Skeleton } from "@telepace/ui";

export default function AppLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <div className="mb-10 border-b border-hairline pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
