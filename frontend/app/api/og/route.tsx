import { ImageResponse } from "next/og";

export const runtime = "edge";

// The brand mark — same sparkline + cool-green peak dot as app/icon.svg — inlined
// as an SVG data URI so it renders inside the OG image without a separate asset.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 32 32" fill="none"><path d="M4 23 L9 20 L13 21 L18 15 L22 16 L27 9" stroke="#e6e8eb" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27" cy="9" r="3" fill="#10b981"/></svg>`;
const MARK_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`;

// Inter (TTF, satori-parseable) from fontsource — close to the app's Geist. Wrapped
// so a fetch failure falls back to the default font rather than breaking the image.
async function loadFont(weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${weight}-normal.ttf`,
    );
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "MarketPulse";
  const description =
    searchParams.get("description") ||
    "News-driven sentiment for stocks, crypto & commodities.";

  const [bold, regular] = await Promise.all([loadFont(700), loadFont(400)]);
  const fonts = [
    bold && { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
    regular && { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[];

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0b0d",
          color: "#e6e8eb",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: "80px",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <img src={MARK_SRC} width={140} height={140} alt="" />
          <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: "-0.03em" }}>
            {title}
          </div>
        </div>
        <div
          style={{
            fontSize: 38,
            color: "#8b9099",
            marginTop: "28px",
            textAlign: "center",
            maxWidth: "82%",
          }}
        >
          {description}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "56px",
            fontSize: 26,
            color: "#5a606b",
            letterSpacing: "0.05em",
          }}
        >
          marketpulse.fyi
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined },
  );
}
