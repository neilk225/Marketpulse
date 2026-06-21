import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import Providers from "@/components/Providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "MarketPulse — Financial Sentiment Dashboard",
  description:
    "News-driven sentiment analysis for stocks, crypto, and commodities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-terminal-bg text-ink antialiased`}
      >
        <Providers>
          {children}
          <footer className="px-4 py-6 text-center text-[11px] text-ink-faint">
            Built by{" "}
            <a
              href="https://github.com/neilk225"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              Neil K.
            </a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
