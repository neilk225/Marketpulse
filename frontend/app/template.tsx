"use client";

import { motion } from "framer-motion";

/** A template re-mounts on every navigation, so this gives each route a gentle
 *  enter transition (fade + slight rise). Honors reduce-motion via MotionConfig. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
