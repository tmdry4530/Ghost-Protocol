import type { AgentAddress } from '@ghost-protocol/shared';
import { useGameStore } from '../../stores/gameStore.js';

interface MatchStatsOverlayProps {
  /** Agent A info */
  agentA: { address: AgentAddress; name: string; score: number };
  /** Agent B info */
  agentB: { address: AgentAddress; name: string; score: number };
}

/**
 * Match stats overlay
 * Real-time match info displayed as a semi-transparent bar over the game canvas
 */
export function MatchStatsOverlay({ agentA, agentB }: MatchStatsOverlayProps) {
  const gameState = useGameStore((s) => s.gameState);

  if (!gameState) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      {/* Semi-transparent dark background bar */}
      <div
        className="flex items-center justify-between px-6 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,26,0.95) 0%, rgba(10,10,26,0.7) 100%)',
          fontFamily: "'Courier New', monospace",
        }}
      >
        {/* Agent A info */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-ghost-blue animate-pulse" />
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">{agentA.name}</div>
            <div className="text-lg font-bold text-white">{agentA.score.toLocaleString()}</div>
          </div>
        </div>

        {/* Center: VS + Round + Tick */}
        <div className="text-center">
          <div className="text-sm font-bold text-ghost-violet mb-1">VS</div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>Round {gameState.round}</span>
            <span>Tick {gameState.tick}</span>
          </div>
        </div>

        {/* Agent B info */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider text-right">
              {agentB.name}
            </div>
            <div className="text-lg font-bold text-white text-right">
              {agentB.score.toLocaleString()}
            </div>
          </div>
          <div className="w-3 h-3 rounded-full bg-ghost-pink animate-pulse" />
        </div>
      </div>

      {/* Power-up indicator */}
      {gameState.powerActive && (
        <div className="absolute top-full left-0 right-0 flex items-center justify-center py-2">
          <div
            className="px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{
              background: 'rgba(34, 211, 238, 0.2)',
              border: '1px solid #22d3ee',
              color: '#22d3ee',
              boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)',
            }}
          >
            Power-Up Active ({Math.ceil(gameState.powerTimeRemaining / 60)}s)
          </div>
        </div>
      )}
    </div>
  );
}
