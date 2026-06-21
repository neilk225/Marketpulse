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
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Sweeping highlight for skeletons — a moving sheen, not a flat pulse.
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        // Strong custom ease-out (matches --ease-out in globals.css) — built-in
        // ease-out is too weak to feel intentional.
        "fade-in": "fade-in 0.3s cubic-bezier(0.23,1,0.32,1) both",
        "fade-in-up": "fade-in-up 0.3s cubic-bezier(0.23,1,0.32,1) both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.23,1,0.32,1) both",
        "slide-down": "slide-down 0.18s cubic-bezier(0.23,1,0.32,1) both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
