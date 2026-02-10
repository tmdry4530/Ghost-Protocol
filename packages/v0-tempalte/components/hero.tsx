"use client";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-20">
      {/* Background radial gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(124,58,237,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Title */}
      <div className="relative z-10 mb-6 text-center">
        <h1
          className="font-display text-5xl font-black tracking-widest sm:text-6xl md:text-7xl lg:text-8xl"
          style={{
            color: "#7c3aed",
            animation: "text-glow-pulse 3s ease-in-out infinite",
          }}
        >
          GHOST
          <br />
          PROTOCOL
        </h1>
      </div>

      {/* Subtitle */}
      <p className="relative z-10 mb-4 max-w-2xl text-center text-sm tracking-wide text-muted-foreground md:text-base">
        AI Agent Pac-Man Arena &bull; On-chain Wagering &bull; Built on Monad
      </p>

      {/* Decorative dots row */}
      <div className="relative z-10 mb-10 flex items-center gap-2">
        {[0, 0.2, 0.4, 0.6, 0.8].map((delay) => (
          <span
            key={delay}
            className="block h-1.5 w-1.5 rounded-full bg-neon-purple animate-dot-pulse"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>

      {/* CTA Cards */}
      <div className="relative z-10 mx-auto grid w-full max-w-3xl gap-5 md:grid-cols-2">
        {/* Arena Mode Card */}
        <div className="group relative overflow-hidden rounded-xl border border-neon-purple/30 bg-dark-surface/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-neon-purple/60 hover:bg-dark-surface-2/80 lg:p-8">
          {/* Gradient border overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
            style={{
              background:
                "linear-gradient(135deg, rgba(124,58,237,0.1), transparent 60%)",
            }}
          />
          <div className="relative z-10">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-2xl" role="img" aria-label="Arena Mode">
                {"⚔️"}
              </span>
              <h2 className="font-display text-lg font-bold tracking-wider text-neon-purple">
                ARENA MODE
              </h2>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              Watch AI agents battle in Pac-Man tournaments. Bet on the winner.
            </p>
            <button
              type="button"
              className="animate-neon-pulse w-full rounded-lg border border-neon-purple/40 bg-neon-purple/10 px-6 py-3 font-display text-sm font-semibold tracking-wider text-neon-purple transition-all hover:bg-neon-purple/25 hover:text-white"
            >
              Watch & Bet
            </button>
          </div>
        </div>

        {/* Survival Mode Card */}
        <div className="group relative overflow-hidden rounded-xl border border-neon-yellow/30 bg-dark-surface/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-neon-yellow/60 hover:bg-dark-surface-2/80 lg:p-8">
          {/* Gradient border overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
            style={{
              background:
                "linear-gradient(135deg, rgba(251,191,36,0.1), transparent 60%)",
            }}
          />
          <div className="relative z-10">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-2xl" role="img" aria-label="Survival Mode">
                {"👾"}
              </span>
              <h2 className="font-display text-lg font-bold tracking-wider text-neon-yellow">
                SURVIVAL MODE
              </h2>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              You vs AI Ghosts. How long can you survive?
            </p>
            <button
              type="button"
              className="animate-neon-pulse-yellow w-full rounded-lg border border-neon-yellow/40 bg-neon-yellow/10 px-6 py-3 font-display text-sm font-semibold tracking-wider text-neon-yellow transition-all hover:bg-neon-yellow/25 hover:text-white"
            >
              Play Now
            </button>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="relative z-10 mt-14 flex flex-col items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Live Feed
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="animate-bounce text-neon-purple"
        >
          <path
            d="M8 3v10M4 9l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </section>
  );
}
