function MonadBadge() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-neon-purple/20 bg-dark-surface/60 px-4 py-2">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="text-neon-purple"
      >
        <rect
          x="1"
          y="1"
          width="14"
          height="14"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M5 8L8 5L11 8L8 11L5 8Z"
          fill="currentColor"
          fillOpacity={0.6}
        />
      </svg>
      <span className="text-xs font-bold tracking-wider text-neon-purple">
        Built on Monad
      </span>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="text-muted-foreground transition-colors hover:text-foreground"
    >
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21.5c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function HackathonBadge() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-neon-yellow/20 bg-dark-surface/60 px-4 py-2">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="text-neon-yellow"
      >
        <path
          d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z"
          fill="currentColor"
          fillOpacity={0.6}
        />
      </svg>
      <span className="text-xs font-bold tracking-wider text-neon-yellow">
        Monad Hackathon
      </span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-neon-purple/10 bg-dark-bg">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between">
        {/* Left badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <MonadBadge />
          <HackathonBadge />
        </div>

        {/* Center text */}
        <p className="text-center text-[10px] tracking-wider text-muted-foreground">
          GHOST PROTOCOL &copy; 2026 &bull; All bets are final &bull;
          Play responsibly
        </p>

        {/* Right links */}
        <div className="flex items-center gap-4">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
    </footer>
  );
}
