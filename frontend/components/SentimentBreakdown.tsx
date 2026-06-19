import { formatPct } from "@/lib/utils";

interface Props {
  positivePct: number;
  negativePct: number;
  neutralPct: number;
}

const ROWS = [
  { key: "positive", label: "Positive", color: "#22c55e", text: "text-bull" },
  { key: "neutral", label: "Neutral", color: "#eab308", text: "text-neutral" },
  { key: "negative", label: "Negative", color: "#ef4444", text: "text-bear" },
] as const;

export default function SentimentBreakdown({
  positivePct,
  negativePct,
  neutralPct,
}: Props) {
  const values: Record<string, number> = {
    positive: positivePct,
    neutral: neutralPct,
    negative: negativePct,
  };

  return (
    <div className="space-y-3">
      {/* Stacked spectrum bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-terminal-border">
        {ROWS.map((r) => (
          <div
            key={r.key}
            style={{ width: `${values[r.key]}%`, backgroundColor: r.color }}
          />
        ))}
      </div>

      {/* Legend with percentages */}
      <div className="grid grid-cols-3 gap-2">
        {ROWS.map((r) => (
          <div key={r.key} className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">
              {r.label}
            </span>
            <span className={`tabular text-sm font-medium ${r.text}`}>
              {formatPct(values[r.key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
