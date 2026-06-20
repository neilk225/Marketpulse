import { formatScore, scoreHex, scoreLabel } from "@/lib/utils";

interface Props {
  score: number;
  headlineCount?: number;
  size?: number;
}

const START_ANGLE = 135; // bottom-left
const SWEEP = 270; // gap at the bottom

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/**
 * Signature element: sentiment as a circular arc gauge. The track runs the full
 * red -> yellow -> green spectrum; a needle points to the score, and the center
 * shows the value + signal label. Not a number, not a bar chart — a gauge.
 */
export default function SentimentGauge({
  score,
  headlineCount,
  size = 240,
}: Props) {
  const clamped = Math.min(1, Math.max(0, score));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const stroke = 16;

  const track = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP);
  const markerAngle = START_ANGLE + clamped * SWEEP;
  const dot = polar(cx, cy, r, markerAngle);
  const color = scoreHex(clamped);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Sentiment score ${formatScore(clamped)} of 1.00, ${scoreLabel(
        clamped,
      )}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gaugeSpectrum" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>

        {/* under-track for unlit contrast */}
        <path
          d={track}
          fill="none"
          stroke="#1f2329"
          strokeWidth={stroke + 4}
          strokeLinecap="round"
        />
        {/* spectrum track */}
        <path
          d={track}
          fill="none"
          stroke="url(#gaugeSpectrum)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />

        {/* marker dot on the arc at the score position */}
        <circle cx={dot.x} cy={dot.y} r={9} fill="#0a0b0d" />
        <circle
          cx={dot.x}
          cy={dot.y}
          r={7}
          fill={color}
          stroke="#0a0b0d"
          strokeWidth={2}
        />
      </svg>

      <div className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center">
        <span
          className="tabular text-4xl font-semibold leading-none"
          style={{ color }}
        >
          {formatScore(clamped)}
        </span>
        <span
          className="mt-1 text-[11px] font-medium tracking-widest"
          style={{ color }}
        >
          {scoreLabel(clamped)}
        </span>
        {headlineCount !== undefined && (
          <span className="mt-2 text-[11px] text-ink-faint">
            based on{" "}
            <span className="tabular text-ink-muted">{headlineCount}</span>{" "}
            {headlineCount === 1 ? "headline" : "headlines"}
          </span>
        )}
      </div>
    </div>
  );
}
