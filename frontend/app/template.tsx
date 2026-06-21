"use client";

import { motion } from "framer-motion";

import { EASE_OUT } from "@/lib/utils";

/** A template re-mounts on every navigation, so this gives each route a gentle
 *  enter transition (fade + slight rise). Honors reduce-motion via MotionConfig. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
