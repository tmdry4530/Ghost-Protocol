/**
 * Game over screen - cinematic dark overlay
 * Final score, round, new record indicator
 * Red neon glow title + scan effect
 */
interface GameOverScreenProps {
  /** Final round */
  finalRound: number;
  /** Final score */
  finalScore: number;
  /** Whether a new record was achieved */
  isRecord: boolean;
  /** Restart callback */
  onRestart: () => void;
  /** Navigate to dashboard callback */
  onDashboard: () => void;
}

/**
 * Survival game over screen
 * Cinematic result card displayed over a fullscreen dark blur overlay
 */
export function GameOverScreen({
  finalRound,
  finalScore,
  isRecord,
  onRestart,
  onDashboard,
}: GameOverScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
      {/* Result card */}
      <div className="relative max-w-md w-full mx-4 overflow-hidden">
        {/* Scan effect overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(124,58,237,0.03) 50%, transparent 100%)',
            animation: 'scanline-anim 4s linear infinite',
          }}
        />

        <div className="relative z-0 border border-ghost-violet/20 bg-dark-surface/80 backdrop-blur-sm rounded-2xl p-8">
          {/* Title - red neon glow */}
          <div className="text-center mb-8">
            <h2
              className="text-6xl sm:text-7xl tracking-widest mb-3"
              style={{
                fontFamily: 'var(--font-display)',
                color: '#ef4444',
                textShadow:
                  '0 0 20px rgba(239,68,68,0.8), 0 0 40px rgba(239,68,68,0.4), 0 0 60px rgba(239,68,68,0.2)',
              }}
            >
              GAME OVER
            </h2>
            {/* New record badge */}
            {isRecord && (
              <div
                className="animate-neon-pulse-yellow inline-block rounded-lg px-4 py-1.5 mt-2 tracking-wider text-2xl"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#fbbf24',
                  textShadow: '0 0 12px rgba(251,191,36,0.6), 0 0 24px rgba(251,191,36,0.3)',
                }}
              >
                NEW RECORD
              </div>
            )}
          </div>

          {/* Stats card */}
          <div className="space-y-3 mb-8">
            {/* Final round */}
            <div className="flex justify-between items-center p-4 border border-ghost-violet/20 bg-dark-surface/80 backdrop-blur-sm rounded-xl">
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                FINAL ROUND
              </span>
              <span
                className="text-3xl font-bold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {finalRound}
              </span>
            </div>

            {/* Final score */}
            <div className="flex justify-between items-center p-4 border border-ghost-violet/20 bg-dark-surface/80 backdrop-blur-sm rounded-xl">
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                FINAL SCORE
              </span>
              <span
                className="text-3xl font-bold neon-text-purple"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#7c3aed',
                }}
              >
                {finalScore.toLocaleString()}
              </span>
            </div>

            {/* New record notification */}
            {isRecord && (
              <div className="p-4 border border-amber-400/20 bg-amber-900/10 rounded-xl text-center">
                <p
                  className="text-amber-400 text-[10px] tracking-wider"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Previous record broken!
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            {/* Try again - neon purple pulse */}
            <button
              onClick={onRestart}
              className="animate-neon-pulse flex-1 py-3 px-6 rounded-lg transition-all duration-200 hover:scale-105 border border-ghost-violet/40 bg-ghost-violet/10 text-ghost-violet hover:bg-ghost-violet/25 hover:text-white"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
            >
              TRY AGAIN
            </button>

            {/* Dashboard - muted style */}
            <button
              onClick={onDashboard}
              className="flex-1 py-3 px-6 rounded-lg transition-all duration-200 border border-ghost-violet/10 bg-dark-surface/60 text-muted-foreground hover:border-ghost-violet/30 text-xs"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
            >
              DASHBOARD
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
