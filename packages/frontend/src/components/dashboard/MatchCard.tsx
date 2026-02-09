/**
 * Match card component
 * Live match info display and spectating link
 */
import { Link } from 'react-router-dom';
import type { MatchInfo, MatchStatus } from '@/types/dashboard';

/** Match status badge style mapping */
const statusStyles: Record<MatchStatus, string> = {
  pending: 'bg-gray-700 text-gray-300',
  betting: 'bg-ghost-orange text-white animate-pulse',
  active: 'bg-ghost-neon text-arena-bg font-bold',
  completed: 'bg-ghost-violet text-white',
  cancelled: 'bg-gray-600 text-gray-400',
};

/** Match status text mapping */
const statusText: Record<MatchStatus, string> = {
  pending: 'Pending',
  betting: 'Betting Live',
  active: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface MatchCardProps {
  /** Match info */
  match: MatchInfo;
}

/**
 * Match card component
 * Displays agent matchup info, scores, and status
 */
export function MatchCard({ match }: MatchCardProps) {
  const isLive = match.status === 'active';
  const isBetting = match.status === 'betting';

  return (
    <div className="group relative overflow-hidden rounded-lg border border-arena-border bg-arena-card p-6 transition-all hover:border-ghost-neon hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]">
      {/* Status badge */}
      <div className="absolute right-4 top-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[match.status]}`}
        >
          {statusText[match.status]}
        </span>
      </div>

      {/* Agent matchup info */}
      <div className="mb-4 space-y-3">
        {/* Agent A */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-ghost-violet to-ghost-pink" />
            <div>
              <p className="font-bold text-white">{match.agentAName}</p>
              <p className="text-xs text-gray-400">Agent A</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-ghost-neon">{match.scoreA.toLocaleString()}</p>
          </div>
        </div>

        {/* VS divider */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-arena-border to-transparent" />
          <span className="text-sm font-bold text-gray-500">VS</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-arena-border to-transparent" />
        </div>

        {/* Agent B */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-ghost-blue to-ghost-neon" />
            <div>
              <p className="font-bold text-white">{match.agentBName}</p>
              <p className="text-xs text-gray-400">Agent B</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-ghost-pink">{match.scoreB.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Action button */}
      <div className="mt-6">
        {match.status === 'completed' ? (
          <Link
            to={`/match/${match.id}`}
            className="block w-full rounded-lg border border-arena-border bg-arena-surface py-2 text-center font-semibold text-gray-400 transition-colors hover:bg-arena-border"
          >
            View Results
          </Link>
        ) : (
          <Link
            to={`/match/${match.id}`}
            className={`block w-full rounded-lg py-2 text-center font-semibold transition-all ${
              isLive || isBetting
                ? 'bg-gradient-to-r from-ghost-violet to-ghost-pink text-white hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]'
                : 'border border-arena-border bg-arena-surface text-gray-300 hover:bg-arena-border'
            }`}
          >
            {isLive && 'Watch'}
            {isBetting && 'Bet & Watch'}
            {match.status === 'pending' && 'Pending'}
          </Link>
        )}
      </div>

      {/* Live match pulse effect */}
      {isLive && (
        <div className="absolute -right-2 -top-2 h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ghost-neon opacity-75" />
          <span className="relative inline-flex h-4 w-4 rounded-full bg-ghost-neon" />
        </div>
      )}
    </div>
  );
}
