"use client";

import { motion, useReducedMotion } from "framer-motion";

import { EASE_IN_OUT, EASE_OUT } from "@/lib/utils";

// Same sparkline as the favicon (app/icon.svg), kept in lockstep so the brand
// mark is identical on the tab and the page.
const PATH = "M4 23 L9 20 L13 21 L18 15 L22 16 L27 9";
const DOT = { cx: 27, cy: 9, r: 2.4 };

/**
 * The MarketPulse mark, animated: the line draws on, the green peak dot pops in,
 * then it keeps a slow live "ping" — a steady pulse on the latest reading. Falls
 * back to the static mark when the user asks for reduced motion.
 */
export default function PulseMark({ size = 56 }: { size?: number }) {
  const reduce = useReducedMotion() ?? false;
  const dotCenter = { transformBox: "fill-box", transformOrigin: "center" } as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      // The live ping expands past the peak dot near the edge — let it draw
      // beyond the 32×32 box instead of being clipped to it.
      style={{ overflow: "visible" }}
    >
      <motion.path
        d={PATH}
        stroke="#e6e8eb"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: EASE_IN_OUT }}
      />

      {/* Live ping ring — a soft ripple out of the peak dot, on a loop. Fades in
          AND out and expands with a gentle deceleration. Scale is a pure GPU
          transform (no non-scaling-stroke, which forces a per-frame repaint and
          makes the loop stutter); a thin base stroke keeps it delicate. */}
      {!reduce && (
        <motion.circle
          cx={DOT.cx}
          cy={DOT.cy}
          r={DOT.r}
          fill="none"
          stroke="#10b981"
          strokeWidth={1}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [0.8, 1.7, 2.6], opacity: [0, 0.5, 0] }}
          transition={{
            duration: 2.4,
            ease: "easeOut",
            times: [0, 0.5, 1],
            repeat: Infinity,
            repeatDelay: 0.4,
            delay: 1,
          }}
          style={dotCenter}
        />
      )}

      {/* The peak dot — pops in once the line has nearly finished drawing. */}
      <motion.circle
        cx={DOT.cx}
        cy={DOT.cy}
        r={DOT.r}
        fill="#10b981"
        initial={reduce ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.85 }}
        style={dotCenter}
      />
    </svg>
  );
}
