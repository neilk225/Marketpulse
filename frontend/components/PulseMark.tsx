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

      {/* Live pulse — a filled glow that expands out of the peak dot and fades,
          on a loop (Tailwind animate-ping style). Filled, not a hollow ring, so it
          reads as a halo behind the solid dot rather than a detached empty circle.
          Single 2-keyframe easeOut on a pure GPU scale transform = smooth. */}
      {!reduce && (
        <motion.circle
          cx={DOT.cx}
          cy={DOT.cy}
          r={DOT.r}
          fill="#10b981"
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 2.2], opacity: [0.45, 0] }}
          transition={{
            duration: 1.3,
            ease: "easeOut",
            repeat: Infinity,
            repeatDelay: 0.25,
            delay: 1.1,
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
        transition={{ duration: 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.9 }}
        style={dotCenter}
      />
    </svg>
  );
}
