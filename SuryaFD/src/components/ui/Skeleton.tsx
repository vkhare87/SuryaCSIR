export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[#f0eee6] dark:bg-[#30302e] rounded-[6px] ${className}`} />
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-4 w-full">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32 ml-auto" />
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-surface-hover h-12 border-b border-border" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 border-b border-border flex items-center px-6 gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-4 w-1/5 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-3xl p-6 space-y-4 shadow-sm">
      <div className="flex justify-between">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-8 w-1/2" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
