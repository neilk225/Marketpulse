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

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://marketpulse.fyi";
const TITLE = "MarketPulse: A financial sentiment dashboard";
const DESCRIPTION =
  "News-driven sentiment analysis for stocks, crypto, and commodities.";
const OG_IMAGE = {
  url: "/api/og",
  width: 1200,
  height: 630,
  alt: "MarketPulse — news-driven sentiment for stocks, crypto & commodities",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "MarketPulse",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
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
