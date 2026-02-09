import { useState } from 'react';

/** Agent address type */
type AgentAddress = string & { readonly __brand: 'AgentAddress' };

/** Agent info interface */
interface AgentInfo {
  readonly address: AgentAddress;
  readonly owner: string;
  readonly name: string;
  readonly wins: number;
  readonly losses: number;
  readonly reputation: number;
  readonly active: boolean;
  readonly elo: number;
}

/** Sort key type */
type SortKey = 'reputation' | 'elo' | 'winRate' | 'wins';

/** Sort direction type */
type SortDirection = 'asc' | 'desc';

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

/** Agent ranking table component */
export function AgentRankingTable() {
  const [agents] = useState<AgentInfo[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('reputation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visibleCount, setVisibleCount] = useState(20);

  /** Sort handler */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  /** Win rate calculation */
  const getWinRate = (agent: AgentInfo) => {
    const total = agent.wins + agent.losses;
    return total > 0 ? (agent.wins / total) * 100 : 0;
  };

  /** Sorted agent list */
  const sortedAgents = [...agents].sort((a, b) => {
    let comparison = 0;

    switch (sortKey) {
      case 'reputation':
        comparison = a.reputation - b.reputation;
        break;
      case 'elo':
        comparison = a.elo - b.elo;
        break;
      case 'winRate':
        comparison = getWinRate(a) - getWinRate(b);
        break;
      case 'wins':
        comparison = a.wins - b.wins;
        break;
    }

    return sortDirection === 'desc' ? -comparison : comparison;
  });

  const visibleAgents = sortedAgents.slice(0, visibleCount);

  if (agents.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-arena-border bg-arena-card p-8 text-center">
        <p className="text-lg font-semibold text-gray-400">No Agent Data</p>
        <p className="mt-2 text-sm text-gray-500">
          Agent rankings will appear here when agents are registered.
        </p>
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Name</th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 hover:text-ghost-neon"
                onClick={() => { handleSort('elo'); }}
              >
                ELO {sortKey === 'elo' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 hover:text-ghost-neon"
                onClick={() => { handleSort('winRate'); }}
              >
                Win Rate {sortKey === 'winRate' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 hover:text-ghost-neon"
                onClick={() => { handleSort('wins'); }}
              >
                W/L {sortKey === 'wins' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 hover:text-ghost-neon"
                onClick={() => { handleSort('reputation'); }}
              >
                Reputation {sortKey === 'reputation' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleAgents.map((agent, idx) => {
              const rank = idx + 1;
              const winRate = getWinRate(agent);

              return (
                <tr
                  key={agent.address}
                  className="border-b border-arena-border/50 transition-colors hover:bg-ghost-violet/10 odd:bg-arena-surface/20"
                >
                  <td className="px-4 py-3">
                    <RankBadge rank={rank} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="font-medium text-white hover:text-ghost-neon transition-colors"
                      type="button"
                    >
                      {agent.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-300">
                    {agent.elo.toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${getWinRateColor(winRate)}`}>
                    {winRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-300">
                    {agent.wins.toLocaleString()}W / {agent.losses.toLocaleString()}L
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-ghost-neon">
                    {agent.reputation.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          agent.active ? 'bg-green-400' : 'bg-gray-500'
                        }`}
                      />
                      <span className="text-sm text-gray-400">
                        {agent.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibleCount < sortedAgents.length && (
        <div className="text-center">
          <button
            onClick={() => { setVisibleCount((prev) => prev + 20); }}
            className="rounded-lg bg-ghost-violet px-6 py-2 font-semibold text-white transition-colors hover:bg-ghost-violet/80"
            type="button"
          >
            Show More ({sortedAgents.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
