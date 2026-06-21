import { formatScore, scoreHex } from "@/lib/utils";

/** A sentiment score in its band color, dimmed when the reading is stale, with a
 *  tooltip explaining freshness. The single home for the stale → opacity/title
 *  mapping, shared by the watchlist and recents lists so they can't drift. */
export default function ScoreValue({
  score,
  stale,
  className,
}: {
  score: number;
  stale: boolean;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{ color: scoreHex(score), opacity: stale ? 0.6 : 1 }}
      title={stale ? "Last reading (may be stale)" : "Current sentiment"}
    >
      {formatScore(score)}
    </span>
  );
}
