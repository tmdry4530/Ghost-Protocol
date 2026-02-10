"use client";

const EVENTS = [
  {
    icon: "🏆",
    text: "Agent_Alpha won Tournament #47 — 3 bettors split $120",
    time: "2m ago",
  },
  {
    icon: "👾",
    text: "human_player survived Round 8 — new record!",
    time: "4m ago",
  },
  {
    icon: "💰",
    text: "0x4f2...matched bet settled: +$45",
    time: "6m ago",
  },
  {
    icon: "⚔️",
    text: "Tournament #48 starting — 4 AI agents queued",
    time: "7m ago",
  },
  {
    icon: "🏆",
    text: "Ghost_Runner won Tournament #46 — $85 payout",
    time: "11m ago",
  },
  {
    icon: "👾",
    text: "anon_0x8b survived Round 5 — earned 2.4 MON",
    time: "14m ago",
  },
  {
    icon: "💰",
    text: "0xa3c...placed 15 MON bet on Agent_Beta",
    time: "15m ago",
  },
  {
    icon: "⚔️",
    text: "Pac_Destroyer eliminated 3 ghosts in 12 seconds",
    time: "18m ago",
  },
];

// Duplicate events for seamless loop
const DOUBLED_EVENTS = [...EVENTS, ...EVENTS];

export function LiveFeed() {
  return (
    <section className="relative py-20 px-4">
      {/* Section label */}
      <div className="mx-auto mb-8 flex max-w-7xl items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
        </span>
        <h2 className="font-display text-xs font-bold tracking-[0.25em] text-muted-foreground">
          LIVE FEED
        </h2>
        <div className="h-px flex-1 bg-neon-purple/10" />
      </div>

      {/* Scrolling ticker */}
      <div className="relative overflow-hidden">
        {/* Fade edges */}
        <div
          className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(to right, #0a0a0f, transparent)",
          }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(to left, #0a0a0f, transparent)",
          }}
        />

        <div className="flex animate-scroll-ticker gap-4">
          {DOUBLED_EVENTS.map((event, i) => (
            <div
              key={i}
              className="flex shrink-0 items-center gap-3 rounded-lg border border-neon-purple/10 bg-dark-surface/60 px-5 py-3 backdrop-blur-sm"
            >
              <span className="text-base" role="img" aria-hidden="true">
                {event.icon}
              </span>
              <span className="whitespace-nowrap text-xs text-foreground">
                {event.text}
              </span>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {event.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked event cards below the ticker */}
      <div className="mx-auto mt-10 grid max-w-5xl gap-3 md:grid-cols-2">
        {EVENTS.slice(0, 4).map((event, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border border-neon-purple/10 bg-dark-surface/40 px-5 py-4 transition-colors hover:border-neon-purple/25 hover:bg-dark-surface/60"
          >
            <span className="text-xl" role="img" aria-hidden="true">
              {event.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{event.text}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {event.time}
              </p>
            </div>
            <div
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400"
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
