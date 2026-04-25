export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-6 w-28 animate-pulse rounded bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted/60" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-md border border-border bg-background p-4"
        >
          <div className="flex justify-between">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted/40" />
          <div className="flex gap-2 pt-1">
            <div className="h-8 flex-1 animate-pulse rounded bg-muted/70" />
            <div className="h-8 flex-1 animate-pulse rounded bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}
