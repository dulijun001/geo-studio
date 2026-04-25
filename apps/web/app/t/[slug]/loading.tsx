/**
 * Tenant-scoped loading skeleton.
 *
 * Next.js 14 App Router streams this to the browser while the RSC page is still
 * fetching data on the server. The sidebar layout stays rendered (instant feel)
 * and only the main area swaps skeleton → content. For dev against a remote
 * Supabase this turns a 3s blank page into a 50ms skeleton + progressive load.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="h-4 w-80 animate-pulse rounded bg-muted/60" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-md border border-border bg-muted/30" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md border border-border bg-muted/20"
          />
        ))}
      </div>
    </div>
  );
}
