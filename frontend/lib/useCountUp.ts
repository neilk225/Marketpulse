import { useEffect, useState } from "react";

/**
 * Eases a value 0 → target once on mount (and whenever target changes) via rAF.
 * `delay` (seconds) holds at 0 before starting — used to stagger several
 * count-ups so each lines up with its own reveal. Jumps straight to the target
 * when disabled (reduced motion). Drives gauge + breakdown numbers off one curve.
 */
export function useCountUp(
  target: number,
  {
    duration = 700,
    delay = 0,
    enabled = true,
  }: { duration?: number; delay?: number; enabled?: boolean } = {},
): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start - delay * 1000;
      if (elapsed >= 0) {
        const t = Math.min(1, elapsed / duration);
        setValue(target * (1 - Math.pow(1 - t, 3))); // easeOutCubic
        if (t >= 1) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, enabled]);
  return value;
}
