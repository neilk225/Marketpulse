"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Reveals text word-by-word, the way an LLM streams its answer. A thin caret
 * trails the last word while it's still revealing, then disappears once done —
 * present only during the genuine reveal, never a permanent fake cursor. Shows
 * the full text instantly under reduced motion.
 */
export default function StreamingText({
  text,
  className,
  wordMs = 28,
}: {
  text: string;
  className?: string;
  wordMs?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  // Keep each word's trailing whitespace on the token so spacing survives join.
  const words = text.match(/\S+\s*/g) ?? [text];
  const [shown, setShown] = useState(reduce ? words.length : 0);

  useEffect(() => {
    if (reduce) {
      setShown(words.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= words.length) clearInterval(id);
    }, wordMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, wordMs, reduce]);

  const done = shown >= words.length;
  return (
    <span className={className}>
      {words.slice(0, shown).join("")}
      {!done && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[1em] w-[2px] -translate-y-[1px] bg-ink-muted align-middle"
        />
      )}
    </span>
  );
}
