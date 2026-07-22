export default function Loading() {
  return (
    <main
      className="flex min-h-[60vh] flex-col gap-4 px-6 py-8"
      aria-busy="true"
      data-testid="route-loading"
    >
      <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-8 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </main>
  );
}
