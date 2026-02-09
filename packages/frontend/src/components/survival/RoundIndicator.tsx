/**
 * 라운드 표시 컴포넌트
 * 현재 라운드와 난이도를 고스트 SVG로 시각화
 * Press Start 2P 폰트 + 네온 퍼플 글로우 애니메이션
 */
import { useEffect, useState } from 'react';
import type { DifficultyTier } from '@ghost-protocol/shared';

interface RoundIndicatorProps {
  /** 현재 라운드 */
  round: number;
  /** 현재 난이도 */
  difficulty: DifficultyTier;
}

/** 난이도별 고스트 색상 */
const GHOST_COLORS: Record<DifficultyTier, string> = {
  1: 'rgba(59,130,246,0.6)',   // 블루
  2: 'rgba(16,185,129,0.6)',   // 그린
  3: 'rgba(245,158,11,0.6)',   // 옐로우
  4: 'rgba(249,115,22,0.6)',   // 오렌지
  5: 'rgba(239,68,68,0.6)',    // 레드
};

/**
 * 라운드 표시 컴포넌트
 * 라운드 변경 시 슬라이드 애니메이션
 */
export function RoundIndicator({ round, difficulty }: RoundIndicatorProps) {
  const [animate, setAnimate] = useState(false);

  // 라운드 변경 시 애니메이션 트리거
  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => { setAnimate(false); }, 1000);
    return () => { clearTimeout(timer); };
  }, [round]);

  const ghostColor = GHOST_COLORS[difficulty];

  return (
    <div className={`transition-all duration-500 ${animate ? 'animate-slide-down' : ''}`}>
      {/* 라운드 번호 */}
      <div className="text-center mb-2">
        <div
          className="text-[10px] tracking-[0.3em] text-muted-foreground mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ROUND
        </div>
        <div
          className="text-5xl font-black tracking-wider animate-text-glow"
          style={{
            fontFamily: 'var(--font-display)',
            color: '#7c3aed',
          }}
        >
          {round}
        </div>
      </div>

      {/* 고스트 SVG 표시 (난이도 시각화) */}
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: difficulty }, (_, i) => (
          <svg
            key={i}
            className="animate-float"
            style={{ animationDelay: `${String(i * 0.2)}s` }}
            width="20"
            height="22"
            viewBox="0 0 24 26"
            fill="none"
          >
            <path
              d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z"
              fill={ghostColor}
            />
            <circle cx="9" cy="9" r="1.5" fill="rgba(255,255,255,0.5)" />
            <circle cx="15" cy="9" r="1.5" fill="rgba(255,255,255,0.5)" />
          </svg>
        ))}
      </div>
    </div>
  );
}
