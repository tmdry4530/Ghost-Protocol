/** Bracket match node component */

import { Link } from 'react-router-dom';
import type { BracketMatch } from '@/types/tournament';

interface MatchNodeProps {
  readonly match: BracketMatch;
}

/**
 * Match node component
 * - Displays a single match within a bracket
 * - Status-based styling (pending/betting/active/completed)
 * - Navigates to match detail page on click
 */
export function MatchNode({ match }: MatchNodeProps) {
  const { agentA, agentB, winner, status } = match;

  // Check if match is TBD
  const isTBD = agentA.name === 'TBD' || agentB.name === 'TBD';

  // Status-based styles
  const getStatusStyle = () => {
    switch (status) {
      case 'active':
        return 'border-ghost-neon shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse';
      case 'betting':
        return 'border-ghost-orange shadow-[0_0_8px_rgba(249,115,22,0.3)]';
      case 'completed':
        return 'border-ghost-violet/50';
      case 'pending':
      default:
        return 'border-ghost-violet/20';
    }
  };

  // Status indicator
  const StatusIndicator = () => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 animate-pulse rounded-full bg-ghost-neon"></div>
            <span className="text-xs text-ghost-neon">Live</span>
          </div>
        );
      case 'betting':
        return (
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-ghost-orange"></div>
            <span className="text-xs text-ghost-orange">Betting</span>
          </div>
        );
      case 'completed':
        return <span className="text-xs text-green-400">Done</span>;
      default:
        return <span className="text-xs text-gray-500">Pending</span>;
    }
  };

  // TBD matches are not clickable
  const content = (
    <div
      className={`
        relative rounded-lg border bg-arena-card px-3 py-2
        transition-all duration-300
        ${getStatusStyle()}
        ${!isTBD && status !== 'pending' ? 'card-hover cursor-pointer' : 'opacity-60'}
      `}
    >
      {/* Status indicator */}
      <div className="mb-2 flex justify-center">
        <StatusIndicator />
      </div>

      {/* Agent A */}
      <div
        className={`
          flex items-center justify-between border-b border-ghost-violet/20 pb-1
          ${winner && winner === agentA.address ? 'text-ghost-neon font-bold' : 'text-gray-300'}
        `}
      >
        <span className="truncate text-xs" title={agentA.name}>
          {agentA.name}
        </span>
        {agentA.score !== null && <span className="ml-2 text-xs font-bold">{agentA.score}</span>}
      </div>

      {/* Agent B */}
      <div
        className={`
          flex items-center justify-between pt-1
          ${winner && winner === agentB.address ? 'text-ghost-neon font-bold' : 'text-gray-300'}
        `}
      >
        <span className="truncate text-xs" title={agentB.name}>
          {agentB.name}
        </span>
        {agentB.score !== null && <span className="ml-2 text-xs font-bold">{agentB.score}</span>}
      </div>

      {/* Winner indicator */}
      {winner && (
        <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-ghost-neon text-xs">
          👑
        </div>
      )}
    </div>
  );

  // Only wrap with link if not TBD and not pending
  if (!isTBD && status !== 'pending') {
    return <Link to={`/match/${match.id}`}>{content}</Link>;
  }

  return content;
}
