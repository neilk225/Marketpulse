import { timeAgo } from "@/lib/utils";

/**
 * Shown when the backend returned a stored score with `stale: true` (live
 * scoring was unavailable). Amber/neutral signal — a warning, not an error.
 */
export default function StaleBadge({ computedAt }: { computedAt: string | null }) {
  return (
    <div className="inline-flex items-center gap-2 rounded border border-neutral/40 bg-neutral-dim px-2.5 py-1 text-[11px] text-neutral">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral" aria-hidden />
      Last updated {timeAgo(computedAt)} — live scoring unavailable
    </div>
  );
}
