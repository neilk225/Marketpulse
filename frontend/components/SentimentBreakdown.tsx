"use client";

import { motion, useReducedMotion } from "framer-motion";

import { useCountUp } from "@/lib/useCountUp";
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

// Each row (bar segment + legend) reveals on the same delay, so the bar and its
// number feel like one thing. Rows cascade left → right.
const ROW_STAGGER = 0.18;

function LegendCell({
  label,
  text,
  pct,
  count,
  delay,
  reduce,
}: {
  label: string;
  text: string;
  pct: number;
  count: number;
  delay: number;
  reduce: boolean;
}) {
  const shown = useCountUp(pct, { duration: 500, delay, enabled: !reduce });
  return (
    <motion.div
      className="flex flex-col"
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay }}
    >
      <span className="text-[11px] uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <span className={`tabular text-sm font-medium ${text}`}>
        {formatPct(shown)}
      </span>
      <span className="tabular mt-0.5 text-[11px] text-ink-faint">
        {count} {count === 1 ? "article" : "articles"}
      </span>
    </motion.div>
  );
}

export default function SentimentBreakdown({
  positivePct,
  negativePct,
  neutralPct,
  total,
}: Props) {
  const reduce = useReducedMotion() ?? false;
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

  return (
    <div className="space-y-3">
      {/* Stacked spectrum bar — segments grow in sequence, left to right. */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-terminal-border">
        {ROWS.map((r, i) => (
          <motion.div
            key={r.key}
            // Width reserves the final layout immediately; the fill grows via a
            // GPU transform (scaleX) rather than animating width (which paints).
            className="origin-left"
            style={{ backgroundColor: r.color, width: `${values[r.key]}%` }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: reduce ? 0 : i * ROW_STAGGER }}
          />
        ))}
      </div>

      {/* Legend — each cell reveals on its bar segment's delay, number counting up. */}
      <div className="grid grid-cols-3 gap-2">
        {ROWS.map((r, i) => (
          <LegendCell
            key={r.key}
            label={r.label}
            text={r.text}
            pct={values[r.key]}
            count={counts[r.key]}
            delay={reduce ? 0 : i * ROW_STAGGER}
            reduce={reduce}
          />
        ))}
      </div>
    </div>
  );
}
