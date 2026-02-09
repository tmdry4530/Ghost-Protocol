/** 토너먼트 브래킷 시각화 컴포넌트 */

import type { BracketRound } from '@/types/tournament';
import { MatchNode } from './MatchNode';

interface BracketViewProps {
  /** 브래킷 사이즈 (8 또는 16) */
  readonly bracketSize: 8 | 16;
  /** 라운드 데이터 */
  readonly rounds: readonly BracketRound[];
}

/**
 * 브래킷 시각화 컴포넌트
 * - CSS Grid 기반 레이아아웃
 * - 8강/16강 지원
 * - 네온 스타일 연결선
 */
export function BracketView({ bracketSize, rounds }: BracketViewProps) {
  // 8강: 4개 라운드 (8강 → 준결승 → 결승 → 우승)
  // 16강: 5개 라운드 (16강 → 8강 → 준결승 → 결승 → 우승)
  const gridColumns = bracketSize === 8 ? 4 : 5;

  return (
    <div className="overflow-x-auto overflow-y-visible px-2 py-2">
      <div
        className="min-w-max gap-8 py-6"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${String(gridColumns)}, minmax(180px, 1fr))`,
        }}
      >
        {rounds.map((round, roundIndex) => (
          <div key={roundIndex} className="flex flex-col gap-6">
            {/* 라운드 타이틀 */}
            <div className="text-center">
              <h3 className="text-sm font-bold text-ghost-violet">{round.name}</h3>
            </div>

            {/* 매치 리스트 */}
            <div
              className="flex flex-col justify-around"
              style={{
                gap: roundIndex === 0 ? '1rem' : `${String(Math.pow(2, roundIndex) * 2)}rem`,
              }}
            >
              {round.matches.map((match) => (
                <div key={match.id} className="relative">
                  <MatchNode match={match} />

                  {/* 연결선 (마지막 라운드 제외) */}
                  {roundIndex < rounds.length - 1 && (
                    <>
                      {/* 오른쪽으로 뻗는 수평선 */}
                      <div
                        className="absolute top-1/2 h-[2px] bg-gradient-to-r from-ghost-violet/50 to-ghost-violet/20"
                        style={{
                          left: '100%',
                          width: '2rem',
                          boxShadow: '0 0 4px rgba(139, 92, 246, 0.5)',
                        }}
                      ></div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 브래킷 연결선 스타일 설명 */}
      <style>{`
        /* 브래킷 연결선 애니메이션 */
        @keyframes bracket-glow {
          0%, 100% {
            box-shadow: 0 0 4px rgba(139, 92, 246, 0.3);
          }
          50% {
            box-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
          }
        }
      `}</style>
    </div>
  );
}
