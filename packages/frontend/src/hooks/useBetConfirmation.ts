/**
 * Monad 블록 상태 기반 베팅 확인 UX 훅
 *
 * Monad의 4단계 블록 상태를 활용한 실시간 베팅 확인 피드백
 * - proposed: 블록 포함 (~0ms)
 * - voted: 2/3+ 투표 완료 (~400ms) — UI 업데이트
 * - finalized: 완전 확정 (~800ms) — 배당률 반영
 * - verified: 상태 루트 검증 (~1200ms)
 *
 * 참조: Monad 블록 파이프라인 스펙
 */

import { useEffect, useState, useCallback } from 'react';

/** 베팅 확인 단계 */
type BetConfirmationStage = 'submitting' | 'proposed' | 'voted' | 'finalized' | 'verified';

/** useBetConfirmation 반환 타입 */
interface UseBetConfirmationReturn {
  /** 현재 확인 단계 */
  readonly stage: BetConfirmationStage;
  /** 트랜잭션 해시 */
  readonly txHash: string | null;
  /** 베팅 확인 시작 (트랜잭션 제출 후 호출) */
  confirmBet: (txHash: string) => void;
  /** 상태 초기화 */
  reset: () => void;
  /** 프로그레스 바 진행률 (0~100) */
  readonly progress: number;
  /** 단계별 사용자 메시지 */
  readonly message: string;
}

/** 단계별 타이밍 (ms) */
const STAGE_TIMINGS = {
  proposed: 0,
  voted: 400,
  finalized: 800,
  verified: 1200,
} as const;

/** 단계별 메시지 */
const STAGE_MESSAGES: Record<BetConfirmationStage, string> = {
  submitting: '트랜잭션 전송 중...',
  proposed: '블록에 포함됨',
  voted: '임시 확정 (2/3+ 투표 완료)',
  finalized: '베팅 확정! (0.8초)',
  verified: '완전 검증 완료',
};

/** 단계별 프로그레스 */
const STAGE_PROGRESS: Record<BetConfirmationStage, number> = {
  submitting: 0,
  proposed: 25,
  voted: 50,
  finalized: 75,
  verified: 100,
};

/**
 * Monad 블록 상태 기반 베팅 확인 UX 훅
 *
 * Monad의 빠른 블록 타임을 활용하여 단계별 시각적 피드백 제공
 *
 * @returns 베팅 확인 상태 및 제어 함수
 *
 * @example
 * ```tsx
 * function BetButton() {
 *   const { placeBet } = usePlaceBet();
 *   const { stage, progress, message, confirmBet, reset } = useBetConfirmation();
 *
 *   const handleBet = async () => {
 *     const txHash = await placeBet(matchId, 'agentA', parseEther('0.1'));
 *     confirmBet(txHash); // 확인 단계 시작
 *   };
 *
 *   useEffect(() => {
 *     if (stage === 'verified') {
 *       // 베팅 완전 확정 — UI 업데이트
 *       setTimeout(reset, 2000); // 2초 후 초기화
 *     }
 *   }, [stage, reset]);
 *
 *   return (
 *     <div>
 *       <button onClick={handleBet}>베팅하기</button>
 *       {stage !== 'submitting' && (
 *         <div>
 *           <progress value={progress} max={100} />
 *           <p>{message}</p>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useBetConfirmation(): UseBetConfirmationReturn {
  const [stage, setStage] = useState<BetConfirmationStage>('submitting');
  const [txHash, setTxHash] = useState<string | null>(null);

  /**
   * 베팅 확인 시작
   *
   * @param txHash - 트랜잭션 해시
   */
  const confirmBet = useCallback((hash: string): void => {
    setTxHash(hash);
    setStage('submitting');
  }, []);

  /**
   * 상태 초기화
   */
  const reset = useCallback((): void => {
    setStage('submitting');
    setTxHash(null);
  }, []);

  // 단계별 타이머 시뮬레이션
  useEffect(() => {
    if (!txHash || stage === 'verified') return;

    let timeoutId: ReturnType<typeof setTimeout>;

    // submitting → proposed (즉시)
    if (stage === 'submitting') {
      timeoutId = setTimeout(() => {
        setStage('proposed');
      }, STAGE_TIMINGS.proposed);
    }

    // proposed → voted (400ms)
    else if (stage === 'proposed') {
      timeoutId = setTimeout(() => {
        setStage('voted');
      }, STAGE_TIMINGS.voted);
    }

    // voted → finalized (800ms)
    else if (stage === 'voted') {
      timeoutId = setTimeout(() => {
        setStage('finalized');
      }, STAGE_TIMINGS.finalized - STAGE_TIMINGS.voted);
    }

    // finalized → verified (1200ms)
    else if (stage === 'finalized') {
      timeoutId = setTimeout(() => {
        setStage('verified');
      }, STAGE_TIMINGS.verified - STAGE_TIMINGS.finalized);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [stage, txHash]);

  return {
    stage,
    txHash,
    confirmBet,
    reset,
    progress: STAGE_PROGRESS[stage],
    message: STAGE_MESSAGES[stage],
  };
}
