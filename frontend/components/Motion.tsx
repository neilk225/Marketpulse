"use client";

import { motion } from "framer-motion";

import { EASE_OUT } from "@/lib/utils";

/** Mount-entrance wrapper: fades + rises into place. Pass `delay` to stagger a
 *  group of them (e.g. delay={i * 0.06}). Honors reduce-motion via MotionConfig. */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
