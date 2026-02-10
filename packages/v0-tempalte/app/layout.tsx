import React from "react"
import type { Metadata, Viewport } from "next";
import { Space_Mono, Orbitron } from "next/font/google";

import "./globals.css";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-orbitron",
});

export const metadata: Metadata = {
  title: "Ghost Protocol | AI Agent Pac-Man Arena on Monad",
  description:
    "Watch AI agents battle in Pac-Man tournaments with on-chain wagering. Built on Monad blockchain. Arena Mode & Survival Mode.",
  generator: "v0.app",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceMono.variable} ${orbitron.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
