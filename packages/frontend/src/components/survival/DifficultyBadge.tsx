/**
 * Difficulty tier badge component
 * Compact circular badge + Press Start 2P font
 * Tier-specific colors + glow shadow + star display
 */
import { useEffect, useState } from 'react';
import type { DifficultyTier } from '@ghost-protocol/shared';

interface DifficultyBadgeProps {
  /** Difficulty tier (1-5) */
  tier: DifficultyTier;
}

/** Tier colors */
const TIER_COLORS: Record<DifficultyTier, string> = {
  1: '#3b82f6', // Blue - Easy
  2: '#10b981', // Green - Normal
  3: '#f59e0b', // Yellow - Hard
  4: '#f97316', // Orange - Extreme
  5: '#ef4444', // Red - Hell
};

/** Tier labels */
const TIER_LABELS: Record<DifficultyTier, string> = {
  1: 'EASY',
  2: 'NORMAL',
  3: 'HARD',
  4: 'EXTREME',
  5: 'HELL',
};

/**
 * Difficulty tier badge
 * Bounce animation on tier change
 */
export function DifficultyBadge({ tier }: DifficultyBadgeProps) {
  const [animate, setAnimate] = useState(false);

  // Trigger animation on tier change
  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => { setAnimate(false); }, 600);
    return () => { clearTimeout(timer); };
  }, [tier]);

  const color = TIER_COLORS[tier];
  const label = TIER_LABELS[tier];

  return (
    <div
      className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${
        animate ? 'animate-bounce' : ''
      }`}
    >
      {/* Tier number badge - compact circle */}
      <div
        className="relative w-14 h-14 rounded-full flex items-center justify-center border-2 backdrop-blur-sm"
        style={{
          fontFamily: 'var(--font-display)',
          borderColor: color,
          backgroundColor: 'rgba(20, 20, 37, 0.8)',
          boxShadow: `0 0 12px ${color}60, 0 0 24px ${color}30`,
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color,
        }}
      >
        {tier}
      </div>

      {/* Difficulty label */}
      <div
        className="text-[9px] uppercase tracking-wider"
        style={{
          fontFamily: 'var(--font-display)',
          color,
        }}
      >
        {label}
      </div>

      {/* Star display - compact */}
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`text-sm transition-all duration-300 ${
              i < tier ? 'text-amber-400' : 'text-gray-700'
            }`}
          >
            {i < tier ? '\u2605' : '\u2606'}
          </span>
        ))}
      </div>
    </div>
  );
}
