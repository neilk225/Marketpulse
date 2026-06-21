"use client";

import { motion } from "framer-motion";

import type { Headline } from "@/lib/types";
import {
  CONFIDENCE_LABEL,
  cx,
  EASE_OUT,
  formatScore,
  SENTIMENT_SIGNAL,
  SIGNAL_TEXT,
  sourceLabel,
  timeAgo,
} from "@/lib/utils";

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-bull",
  neutral: "bg-neutral",
  negative: "bg-bear",
};

function HeadlineRow({ h, index }: { h: Headline; index: number }) {
  const signal = SENTIMENT_SIGNAL[h.sentiment];
  const hasLink = Boolean(h.url);
  const TitleTag = hasLink ? "a" : "span";

  return (
    <motion.li
      className="border-b border-terminal-border px-4 py-3 last:border-0 hover:bg-terminal-hover"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: EASE_OUT,
        delay: Math.min(index, 12) * 0.03,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            SENTIMENT_DOT[h.sentiment],
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <TitleTag
            {...(hasLink
              ? { href: h.url, target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className={cx(
              "block text-sm leading-snug text-ink",
              hasLink && "hover:underline",
            )}
          >
            {h.title}
          </TitleTag>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="rounded border border-terminal-border px-1.5 py-0.5 text-ink-muted">
              {sourceLabel(h.source)}
            </span>
            <span className={cx("font-medium", SIGNAL_TEXT[signal])}>
              {h.sentiment.toUpperCase()}
            </span>
            <span className="tabular text-ink-faint">
              {formatScore(h.score)}
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-faint">{CONFIDENCE_LABEL[h.confidence]}</span>
            {h.published_at && (
              <>
                <span className="text-ink-faint">·</span>
                <span className="tabular text-ink-faint">
                  {timeAgo(h.published_at)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
}

export default function HeadlineList({ headlines }: { headlines: Headline[] }) {
  if (headlines.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-ink-muted">
        No recent headlines found for this ticker.
      </div>
    );
  }
  return (
    <ul className="max-h-[28rem] overflow-y-auto">
      {headlines.map((h, i) => (
        <HeadlineRow key={`${h.url || h.title}-${i}`} h={h} index={i} />
      ))}
    </ul>
  );
}
