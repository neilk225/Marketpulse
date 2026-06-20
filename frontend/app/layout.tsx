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
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-terminal-bg text-ink antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
