/**
 * Route-level loading skeleton shown while a lazily-loaded page chunk downloads.
 * Mirrors the dashboard rhythm: KPI strip, filter bar, then a card grid.
 */
export default function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel animate-shimmer p-4">
            <div className="h-2.5 w-20 rounded-full bg-navy-600/70" />
            <div className="mt-3 h-6 w-16 rounded-lg bg-navy-600/60" />
            <div className="mt-2.5 h-2 w-24 rounded-full bg-navy-700/60" />
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="panel animate-shimmer flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="h-9 w-full rounded-xl bg-navy-700/60 sm:w-44" />
        <div className="h-9 w-full rounded-xl bg-navy-700/60 sm:w-36" />
        <div className="h-9 w-full rounded-xl bg-navy-700/50 sm:w-64" />
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel animate-shimmer overflow-hidden">
            <div className="h-32 w-full bg-navy-700/50" />
            <div className="space-y-3 p-4">
              <div className="h-3 w-2/5 rounded-full bg-navy-600/70" />
              <div className="h-2.5 w-3/5 rounded-full bg-navy-700/60" />
              <div className="h-16 rounded-xl bg-navy-800/60" />
              <div className="h-2.5 w-1/3 rounded-full bg-navy-700/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
