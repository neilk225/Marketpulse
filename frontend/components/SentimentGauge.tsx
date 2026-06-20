"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { formatScore, scoreHex, scoreLabel } from "@/lib/utils";

interface Props {
  score: number;
  headlineCount?: number;
  size?: number;
}

const START_ANGLE = 135; // bottom-left
const SWEEP = 270; // gap at the bottom
const SWEEP_MS = 900;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/** Eases a value from 0 → target once on mount (and whenever target changes).
 *  Drives both the dot sweep and the number count-up off one source so they
 *  stay in lockstep. Skips straight to target when motion is reduced. */
function useCountUp(target: number, duration = SWEEP_MS, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const t = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return value;
}

/**
 * Signature element: sentiment as a circular arc gauge. On load the spectrum
 * track draws on, the marker dot sweeps from the start of the arc to the score,
 * and the value counts up — all eased together. The center shows the value +
 * 5-band label, both tinted to the score's band. Not a number, not a bar chart.
 */
export default function SentimentGauge({
  score,
  headlineCount,
  size = 240,
}: Props) {
  const reduce = useReducedMotion() ?? false;
  const clamped = Math.min(1, Math.max(0, score));
  const display = useCountUp(clamped, SWEEP_MS, !reduce);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const stroke = 16;

  const track = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP);
  const dot = polar(cx, cy, r, START_ANGLE + display * SWEEP);
  const color = scoreHex(clamped); // final-band color (stable through the sweep)

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Sentiment score ${formatScore(clamped)} of 1.00, ${scoreLabel(
        clamped,
      )}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gaugeSpectrum" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>

        {/* under-track for unlit contrast */}
        <path
          d={track}
          fill="none"
          stroke="#1f2329"
          strokeWidth={stroke + 4}
          strokeLinecap="round"
        />
        {/* spectrum track — draws on from the start of the arc */}
        <motion.path
          d={track}
          fill="none"
          stroke="url(#gaugeSpectrum)"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: SWEEP_MS / 1000, ease: "easeInOut" }}
        />

        {/* marker dot — rides the arc to the score as the value counts up */}
        <circle cx={dot.x} cy={dot.y} r={9} fill="#0a0b0d" />
        <circle
          cx={dot.x}
          cy={dot.y}
          r={7}
          fill={color}
          stroke="#0a0b0d"
          strokeWidth={2}
        />
      </svg>

      <div className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center">
        <span
          className="tabular text-4xl font-semibold leading-none"
          style={{ color }}
        >
          {formatScore(display)}
        </span>
        <motion.span
          className="mt-1 text-[11px] font-medium tracking-widest"
          style={{ color }}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: reduce ? 0 : SWEEP_MS / 1000 - 0.1 }}
        >
          {scoreLabel(clamped)}
        </motion.span>
        {headlineCount !== undefined && (
          <span className="mt-2 text-[11px] text-ink-faint">
            based on{" "}
            <span className="tabular text-ink-muted">{headlineCount}</span>{" "}
            {headlineCount === 1 ? "headline" : "headlines"}
          </span>
        )}
      </div>
    </div>
  );
}
