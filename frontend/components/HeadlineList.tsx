import type { Headline } from "@/lib/types";
import {
  CONFIDENCE_LABEL,
  cx,
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

function HeadlineRow({ h }: { h: Headline }) {
  const signal = SENTIMENT_SIGNAL[h.sentiment];
  const hasLink = Boolean(h.url);
  const TitleTag = hasLink ? "a" : "span";

  return (
    <li className="border-b border-terminal-border px-4 py-3 last:border-0 hover:bg-terminal-hover">
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
    </li>
  );
}

export default function HeadlineList({ headlines }: { headlines: Headline[] }) {
  if (headlines.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-ink-muted">
        Insufficient news data for sentiment analysis
      </div>
    );
  }
  return (
    <ul className="max-h-[28rem] overflow-y-auto">
      {headlines.map((h, i) => (
        <HeadlineRow key={`${h.url || h.title}-${i}`} h={h} />
      ))}
    </ul>
  );
}
