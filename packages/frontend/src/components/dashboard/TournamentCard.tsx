/**
 * Tournament card component
 * Tournament info and status display
 */
import { Link } from 'react-router-dom';
import type { TournamentInfo, TournamentStatus } from '@/types/dashboard';
import { formatMON } from '@/lib/formatters';

/** Tournament status badge style mapping */
const statusStyles: Record<TournamentStatus, string> = {
  upcoming: 'bg-ghost-blue text-white',
  active: 'bg-ghost-neon text-arena-bg font-bold animate-pulse',
  completed: 'bg-gray-600 text-gray-300',
};

/** Tournament status text mapping */
const statusText: Record<TournamentStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
};

interface TournamentCardProps {
  /** Tournament info */
  tournament: TournamentInfo;
}

/**
 * Tournament card component
 * Displays bracket size, participants, prize pool, and status
 */
export function TournamentCard({ tournament }: TournamentCardProps) {
  const isActive = tournament.status === 'active';
  const bracketText = tournament.bracketSize === 8 ? 'Top 8' : 'Top 16';

  return (
    <div className="group relative overflow-hidden rounded-lg border border-arena-border bg-arena-card p-6 transition-all hover:border-ghost-violet hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]">
      {/* Status badge */}
      <div className="absolute right-4 top-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[tournament.status]}`}
        >
          {statusText[tournament.status]}
        </span>
      </div>

      {/* Tournament icon */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-ghost-violet via-ghost-pink to-ghost-orange">
        <span className="text-2xl">🏆</span>
      </div>

      {/* Tournament info */}
      <div className="mb-4 space-y-2">
        <h3 className="text-xl font-bold text-white">Tournament #{tournament.id.slice(-3)}</h3>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-1">
            <span className="text-ghost-neon">●</span>
            <span>{bracketText} Tournament</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-ghost-pink">●</span>
            <span>{tournament.participants.length} participants</span>
          </div>
        </div>
      </div>

      {/* Prize pool */}
      <div className="mb-4 rounded-lg border border-arena-border bg-arena-surface p-3">
        <p className="text-xs text-gray-400">Prize Pool</p>
        <p className="text-2xl font-bold text-ghost-orange">
          {formatMON(tournament.prizePool)} MON
        </p>
      </div>

      {/* Action button */}
      <Link
        to={`/tournament/${tournament.id}`}
        className={`block w-full rounded-lg py-2 text-center font-semibold transition-all ${
          isActive
            ? 'bg-gradient-to-r from-ghost-violet to-ghost-pink text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]'
            : 'border border-arena-border bg-arena-surface text-gray-300 hover:bg-arena-border'
        }`}
      >
        View Details
      </Link>

      {/* Active tournament glow effect */}
      {isActive && (
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-ghost-violet/10 to-ghost-pink/10" />
      )}
    </div>
  );
}
