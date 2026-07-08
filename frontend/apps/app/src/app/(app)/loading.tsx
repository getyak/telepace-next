import { Skeleton } from "@telepace/ui";

export default function AppLoading() {
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-10 w-1/2" />
      <div className="mt-10 space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
