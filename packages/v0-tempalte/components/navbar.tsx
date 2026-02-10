"use client";

import { useState, useEffect } from "react";

function GhostIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z"
        fill="#7c3aed"
      />
      <circle cx="9" cy="10" r="1.5" fill="#0a0a0f" />
      <circle cx="15" cy="10" r="1.5" fill="#0a0a0f" />
    </svg>
  );
}

function LiveDot() {
  return (
    <span className="relative mr-1.5 flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
    </span>
  );
}

const stats = [
  { label: "Active Tournaments", value: "3" },
  { label: "Total Pool", value: "$2,450" },
  { label: "Spectators", value: "127" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-neon-purple/20 bg-dark-bg/90 backdrop-blur-lg"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <GhostIcon />
          <span className="font-display text-sm font-bold tracking-wider text-neon-purple neon-text-purple lg:text-base">
            GHOST PROTOCOL
          </span>
        </a>

        {/* Live Stats - hidden on small screens */}
        <div className="hidden items-center gap-6 rounded-full border border-neon-purple/10 bg-dark-surface/80 px-5 py-2 md:flex">
          <div className="flex items-center gap-1.5">
            <LiveDot />
            <span className="text-xs font-bold text-green-400">LIVE</span>
          </div>
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {stat.label}
              </span>
              <span className="font-display text-xs font-bold text-foreground">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Connect Wallet */}
        <button
          type="button"
          className="animate-neon-pulse rounded-lg border border-neon-purple/40 bg-neon-purple/10 px-4 py-2 font-display text-xs font-semibold tracking-wide text-neon-purple transition-all hover:bg-neon-purple/20 hover:text-white lg:px-5 lg:text-sm"
        >
          Connect Wallet
        </button>
      </nav>
    </header>
  );
}
