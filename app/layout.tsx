import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Steam Guardrail | Steam Game Reviews, Risk Scores, and Buying Advice",
  description:
    "Daily Steam game review analysis with risk scores, refund warnings, social feedback summaries, pricing plans, and buy-or-skip advice for PC players.",
  keywords: [
    "Steam reviews",
    "Steam game analysis",
    "PC game buying guide",
    "Steam sale advice",
    "game review scores",
    "refund risk",
    "DRM warnings",
  ],
  openGraph: {
    title: "Steam Guardrail",
    description: "Review trending Steam games before you buy with risk scores, public feedback, and buyer reports.",
    type: "website",
    url: "https://steam-guardrail-app.jqqbest.chatgpt.site",
  },
  twitter: {
    card: "summary_large_image",
    title: "Steam Guardrail",
    description: "Daily Steam review analysis and safer buying advice for PC players.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
