import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Terminal surfaces — near-black, layered panels, hairline borders.
        terminal: {
          bg: "#0a0b0d",
          panel: "#111317",
          raised: "#171a1f",
          border: "#1f2329",
          hover: "#1c2027",
        },
        // Text — high-contrast foreground, then muted/faint for hierarchy.
        ink: {
          DEFAULT: "#e6e8eb",
          muted: "#8b9099",
          faint: "#5a606b",
        },
        // SIGNAL ONLY. green/yellow/red carry meaning; never decorative.
        bull: { DEFAULT: "#22c55e", dim: "#0f2e1b" },
        neutral: { DEFAULT: "#eab308", dim: "#33290a" },
        bear: { DEFAULT: "#ef4444", dim: "#3a1717" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
