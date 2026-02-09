import { useState } from 'react';

/** Bettor info interface */
interface BettorInfo {
  readonly address: string;
  readonly totalWagered: number;
  readonly winRate: number;
  readonly biggestWin: number;
  readonly netProfit: number;
}

/** Rank badge component */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#ffd700] to-[#ffb800] px-3 py-1 text-sm font-bold text-gray-900">
        👑 {rank}
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#c0c0c0] to-[#a0a0a0] px-3 py-1 text-sm font-bold text-gray-900">
        🥈 {rank}
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#cd7f32] to-[#b87333] px-3 py-1 text-sm font-bold text-gray-900">
        🥉 {rank}
      </span>
    );
  }
  return <span className="px-3 py-1 text-sm font-semibold text-gray-400">{rank}</span>;
}

/** Win rate color calculation */
function getWinRateColor(winRate: number): string {
  if (winRate >= 60) return 'text-green-400';
  if (winRate >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

/** Profit color calculation */
function getProfitColor(profit: number): string {
  return profit >= 0 ? 'text-green-400' : 'text-red-400';
}

/** MON formatting */
function formatMON(value: number): string {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MON`;
}

/** Top bettors component */
export function TopBettors() {
  const [bettors] = useState<BettorInfo[]>([]);

  if (bettors.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-arena-border bg-arena-card p-8 text-center">
          <p className="text-lg font-semibold text-gray-400">No Bettor Data</p>
          <p className="mt-2 text-sm text-gray-500">
            Top bettors will appear here when bets are placed.
          </p>
        </div>
        <div className="rounded-lg bg-arena-surface/30 border border-arena-border/50 p-4">
          <p className="text-sm text-gray-400">
            💡 <span className="font-semibold text-white">Tip:</span> A high total wagered amount
            does not always mean high profits. Win rate and betting strategy matter!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg bg-arena-card border border-arena-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-arena-border bg-arena-surface/50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Rank</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Player</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Total Wagered</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Win Rate</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Biggest Win</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {bettors.map((bettor, idx) => {
              const rank = idx + 1;

              return (
                <tr
                  key={bettor.address}
                  className="border-b border-arena-border/50 transition-colors hover:bg-ghost-violet/10 odd:bg-arena-surface/20"
                >
                  <td className="px-4 py-3">
                    <RankBadge rank={rank} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-gray-400">{bettor.address}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">
                    {formatMON(bettor.totalWagered)}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${getWinRateColor(bettor.winRate)}`}>
                    {bettor.winRate}%
                  </td>
                  <td className="px-4 py-3 font-semibold text-ghost-neon">
                    {formatMON(bettor.biggestWin)}
                  </td>
                  <td className={`px-4 py-3 font-bold ${getProfitColor(bettor.netProfit)}`}>
                    {bettor.netProfit >= 0 ? '+' : ''}
                    {formatMON(bettor.netProfit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-arena-surface/30 border border-arena-border/50 p-4">
        <p className="text-sm text-gray-400">
          💡 <span className="font-semibold text-white">Tip:</span> A high total wagered amount
          does not always mean high profits. Win rate and betting strategy matter!
        </p>
      </div>
    </div>
  );
}
