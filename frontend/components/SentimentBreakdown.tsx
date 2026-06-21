"use client";

import { motion } from "framer-motion";

import { EASE_OUT, formatPct } from "@/lib/utils";

interface Props {
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  total: number;
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
  total,
}: Props) {
  const values: Record<string, number> = {
    positive: positivePct,
    neutral: neutralPct,
    negative: negativePct,
  };

  // Derive whole-article counts from the percentages so the three always sum to
  // the total (neutral absorbs any rounding remainder).
  const positive = Math.round((positivePct / 100) * total);
  const negative = Math.round((negativePct / 100) * total);
  const counts: Record<string, number> = {
    positive,
    negative,
    neutral: Math.max(0, total - positive - negative),
  };
  const article = (n: number) => `${n} ${n === 1 ? "article" : "articles"}`;

  return (
    <div className="space-y-3">
      {/* Stacked spectrum bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-terminal-border">
        {ROWS.map((r, i) => (
          <motion.div
            key={r.key}
            // Width reserves the final layout immediately; the fill grows via a
            // GPU transform (scaleX) rather than animating width (which paints).
            className="origin-left"
            style={{ backgroundColor: r.color, width: `${values[r.key]}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.15 + i * 0.05 }}
          />
        ))}
      </div>

      {/* Legend with percentages + article counts */}
      <div className="grid grid-cols-3 gap-2">
        {ROWS.map((r) => (
          <div key={r.key} className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">
              {r.label}
            </span>
            <span className={`tabular text-sm font-medium ${r.text}`}>
              {formatPct(values[r.key])}
            </span>
            <span className="tabular mt-0.5 text-[11px] text-ink-faint">
              {article(counts[r.key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
