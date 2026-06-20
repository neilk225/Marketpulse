"use client";

import { MotionConfig } from "framer-motion";

/** App-wide motion settings. `reducedMotion="user"` makes EVERY framer-motion
 *  component honor the OS "reduce motion" setting automatically — transform/
 *  layout animations are skipped, opacity/color kept — so we don't repeat the
 *  check per component. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
