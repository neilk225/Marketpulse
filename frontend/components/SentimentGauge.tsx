"use client";

import { motion, useReducedMotion } from "framer-motion";

import { useCountUp } from "@/lib/useCountUp";
import { EASE_OUT, formatScore, scoreHex, scoreLabel } from "@/lib/utils";

interface Props {
  score: number;
  headlineCount?: number;
  size?: number;
}

const START_ANGLE = 135; // bottom-left
const SWEEP = 270; // gap at the bottom
// The fill takes its time so it reads as a gauge filling, not a value snapping in.
const FILL_MS = 900;

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

/**
 * Signature element: sentiment as a circular fill gauge. A single arc in the
 * score's band color grows from the start of the track to the score position,
 * the marker dot rides its leading tip, and the value counts up — all driven off
 * one eased value (`display`) so the arc, dot, and number stay perfectly locked.
 * One meaningful accent (the band color), no decorative spectrum.
 */
export default function SentimentGauge({ score, headlineCount, size = 240 }: Props) {
  const reduce = useReducedMotion() ?? false;
  const clamped = Math.min(1, Math.max(0, score));
  const display = useCountUp(clamped, { duration: FILL_MS, enabled: !reduce });

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const stroke = 16;

  const trackFull = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP);
  const endAngle = START_ANGLE + display * SWEEP;
  const fill = arcPath(cx, cy, r, START_ANGLE, endAngle);
  const dot = polar(cx, cy, r, endAngle);
  const color = scoreHex(clamped); // final-band color, stable through the fill

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
        {/* empty track */}
        <path
          d={trackFull}
          fill="none"
          stroke="#1f2329"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* fill arc — grows to the score in the band color */}
        {display > 0.004 && (
          <path
            d={fill}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        {/* marker dot rides the leading tip of the fill */}
        <circle cx={dot.x} cy={dot.y} r={10} fill="#0a0b0d" />
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
          transition={{
            duration: 0.3,
            ease: EASE_OUT,
            delay: reduce ? 0 : FILL_MS / 1000 - 0.15,
          }}
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
