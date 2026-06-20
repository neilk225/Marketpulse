import { cx } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("animate-pulse rounded bg-terminal-raised", className)} />
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-5">
      {children}
    </div>
  );
}

/** Header skeleton — rendered above the grid (mirrors the real ticker header) so
 *  the grid + sidebar don't shift position when the data resolves. */
export function TickerHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Full ticker-detail skeleton — no blank screen while the score loads. */
export function TickerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-[240px] w-[240px] rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </Panel>
        <Panel>
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="mb-3 h-2 w-full" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </Panel>
      </div>

      <Panel>
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Panel>
    </div>
  );
}
