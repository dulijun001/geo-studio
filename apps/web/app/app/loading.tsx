export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="h-7 w-44 animate-pulse rounded bg-muted" />
      <div className="h-4 w-64 animate-pulse rounded bg-muted/60" />
      <div className="space-y-2 pt-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-md border border-border bg-muted/20"
          />
        ))}
      </div>
    </div>
  );
}
