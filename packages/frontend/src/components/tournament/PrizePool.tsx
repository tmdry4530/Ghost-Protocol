/** Prize pool display component */

interface PrizePoolProps {
  /** 총 상금 풀 (MON 단위) */
  readonly totalPoolMon: number;
  /** 브래킷 사이즈 (8 또는 16) */
  readonly bracketSize: 8 | 16;
}

/** Prize distribution ratio (Top 8 bracket) */
const PRIZE_DISTRIBUTION_8 = {
  first: 50, // 50%
  second: 30, // 30%
  third: 20, // 20% (split between 2 semifinal losers)
} as const;

/** Prize distribution ratio (Top 16 bracket) */
const PRIZE_DISTRIBUTION_16 = {
  first: 40, // 40%
  second: 25, // 25%
  third: 15, // 15% (2 semifinal losers)
  fourth: 20, // 20% (split between 4 quarterfinal losers)
} as const;

/**
 * Prize pool display component
 * - Shows total prize and per-rank distribution
 * - Neon glow effect
 */
export function PrizePool({ totalPoolMon, bracketSize }: PrizePoolProps) {
  const totalMon = totalPoolMon;
  const distribution = bracketSize === 8 ? PRIZE_DISTRIBUTION_8 : PRIZE_DISTRIBUTION_16;

  const calculatePrize = (percentage: number): string => {
    return ((totalMon * percentage) / 100).toFixed(2);
  };

  return (
    <div className="rounded-lg border border-ghost-violet/30 bg-arena-card p-6">
      {/* Trophy icon and title */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-3xl">🏆</span>
        <h3 className="text-lg font-bold text-white">Prize Pool</h3>
      </div>

      {/* Total prize */}
      <div className="mb-6 rounded-lg bg-gradient-to-r from-ghost-violet/20 to-ghost-neon/20 p-4">
        <p className="mb-1 text-xs text-gray-400">Total Prize</p>
        <p
          className="neon-text text-2xl font-bold text-ghost-neon"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {totalMon.toFixed(2)} MON
        </p>
      </div>

      {/* Per-rank distribution */}
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-md bg-ghost-violet/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🥇</span>
            <span className="text-sm text-gray-300">1st Place</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-ghost-neon">
              {calculatePrize(distribution.first)} MON
            </p>
            <p className="text-xs text-gray-500">{distribution.first}%</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-ghost-blue/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🥈</span>
            <span className="text-sm text-gray-300">2nd Place</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-ghost-blue">
              {calculatePrize(distribution.second)} MON
            </p>
            <p className="text-xs text-gray-500">{distribution.second}%</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-ghost-pink/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🥉</span>
            <span className="text-sm text-gray-300">3rd Place</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-ghost-pink">
              {calculatePrize(distribution.third)} MON
            </p>
            <p className="text-xs text-gray-500">{distribution.third}%</p>
          </div>
        </div>

        {'fourth' in distribution && (
          <div className="flex items-center justify-between rounded-md bg-gray-500/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎖️</span>
              <span className="text-sm text-gray-300">4th Place</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-400">
                {calculatePrize(distribution.fourth)} MON
              </p>
              <p className="text-xs text-gray-500">{distribution.fourth}%</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
