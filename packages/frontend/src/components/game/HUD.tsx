/**
 * 게임 HUD — 클래식 아케이드 스타일
 * 미로 바로 위에 위치하는 컴팩트 바
 * Score(중앙 대형), Lives(좌측), Round+Tier(우측)
 */
import { useGameStore } from '../../stores/gameStore';

/** 생명 표시용 소형 팩맨 SVG 아이콘 */
function LifeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 0l10 10-10 10" />
    </svg>
  );
}

/** 게임 HUD 오버레이 컴포넌트 — 아케이드 스타일 */
export function HUD() {
  const gameState = useGameStore((s) => s.gameState);
  const difficulty = useGameStore((s) => s.difficulty);

  if (!gameState) return null;

  return (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {/* Left: Lives */}
      <div className="flex items-center gap-3">
        <span className="text-[9px] uppercase tracking-[0.2em] text-ghost-violet/50">Lives</span>
        <div className="flex gap-1">
          {Array.from({ length: gameState.lives }, (_, i) => (
            <LifeIcon key={i} />
          ))}
        </div>
      </div>

      {/* Center: Score (large, prominent) */}
      <div className="text-center">
        <span className="text-[9px] uppercase tracking-[0.2em] text-ghost-violet/50 block">Score</span>
        <div
          className="text-2xl font-black tabular-nums neon-text-purple text-ghost-violet leading-none"
        >
          {gameState.score.toLocaleString()}
        </div>
      </div>

      {/* Right: Round + Tier */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <span className="text-[9px] uppercase tracking-[0.2em] text-ghost-violet/50 block">Round</span>
          <div className="text-lg font-bold text-white leading-none">{gameState.round}</div>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={`text-xs transition-all duration-300 ${
                i < difficulty ? 'text-amber-400' : 'text-gray-700'
              }`}
            >
              {i < difficulty ? '\u2605' : '\u2606'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 파워업 타이머 바 */
export function PowerUpBar() {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState?.powerActive) return null;

  return (
    <div className="h-1 bg-dark-surface/50 rounded-full overflow-hidden">
      <div
        className="h-full transition-all duration-100 rounded-full"
        style={{
          width: `${String((gameState.powerTimeRemaining / 600) * 100)}%`,
          background: 'linear-gradient(90deg, var(--color-ghost-violet), var(--color-ghost-neon))',
          boxShadow: '0 0 8px rgba(124,58,237,0.5), 0 0 16px rgba(34,211,238,0.3)',
        }}
      />
    </div>
  );
}
