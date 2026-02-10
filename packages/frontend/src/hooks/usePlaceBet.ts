/**
 * 통합 지갑 베팅 훅
 *
 * wagmi와 Circle 두 경로 모두 지원
 * - wagmi: useWriteContract로 직접 컨트랙트 호출
 * - Circle: 백엔드 프록시를 통해 트랜잭션 전송
 */

import { useCallback, useState } from 'react';
import { useWriteContract } from 'wagmi';
import type { MatchId, BetSide } from '@ghost-protocol/shared';
import { useUnifiedWallet } from '../providers/UnifiedWalletProvider.js';
import { WAGER_POOL_ABI, WAGER_POOL_ADDRESS } from '../lib/contracts.js';

const API_BASE = (import.meta.env['VITE_API_URL'] as string) || 'http://localhost:3001/api/v1';

/** usePlaceBet 반환 타입 */
interface UsePlaceBetReturn {
  /** 베팅 실행 함수 */
  placeBet: (matchId: MatchId, side: BetSide, amount: bigint) => Promise<string>;
  /** 로딩 상태 */
  readonly isLoading: boolean;
  /** 에러 메시지 */
  readonly error: string | null;
}

/**
 * BetSide를 컨트랙트 매개변수로 변환
 *
 * @param side - 베팅 측면
 * @returns 컨트랙트 파라미터
 */
function betSideToContractParams(side: BetSide): { side?: number; role?: number } {
  // Arena Mode: agentA (0), agentB (1)
  if (side === 'agentA') return { side: 0 };
  if (side === 'agentB') return { side: 1 };

  // Survival Mode: pacman (0), ghost (1)
  if (side === 'pacman') return { role: 0 };
  if (side === 'ghost') return { role: 1 };

  throw new Error(`지원하지 않는 BetSide: ${side}`);
}

/**
 * 통합 지갑 베팅 훅
 *
 * UnifiedWalletProvider의 source를 확인하여 적절한 경로로 베팅 전송
 *
 * @returns 베팅 함수 및 상태
 *
 * @example
 * ```tsx
 * function BetPanel() {
 *   const { placeBet, isLoading, error } = usePlaceBet();
 *   const { confirmBet } = useBetConfirmation();
 *
 *   const handleBet = async () => {
 *     try {
 *       const txHash = await placeBet(matchId, 'agentA', parseEther('0.1'));
 *       confirmBet(txHash);
 *     } catch (e) {
 *       console.error('베팅 실패:', e);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleBet} disabled={isLoading}>
 *       {isLoading ? '베팅 중...' : '베팅하기'}
 *     </button>
 *   );
 * }
 * ```
 */
export function usePlaceBet(): UsePlaceBetReturn {
  const { address, source, isConnected } = useUnifiedWallet();
  const { writeContractAsync } = useWriteContract();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 베팅 실행
   *
   * @param matchId - 매치 ID
   * @param side - 베팅 측면
   * @param amount - 베팅 금액 (wei)
   * @returns 트랜잭션 해시
   */
  const placeBet = useCallback(
    async (matchId: MatchId, side: BetSide, amount: bigint): Promise<string> => {
      if (!isConnected || !address) {
        throw new Error('지갑이 연결되지 않았습니다');
      }

      if (!WAGER_POOL_ADDRESS) {
        throw new Error('WagerPool 컨트랙트 주소가 설정되지 않았습니다. VITE_WAGER_POOL_ADDRESS 환경변수를 확인하세요.');
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = betSideToContractParams(side);

        // wagmi 경로: 직접 컨트랙트 호출
        if (source === 'wagmi') {
          // Arena Mode: placeBet(matchId, side)
          if ('side' in params && params.side !== undefined) {
            const hash = await writeContractAsync({
              address: WAGER_POOL_ADDRESS,
              abi: WAGER_POOL_ABI,
              functionName: 'placeBet',
              args: [BigInt(matchId as string), params.side],
              value: amount,
            });
            return hash;
          }

          // Survival Mode: placeBetByRole(matchId, role)
          if ('role' in params && params.role !== undefined) {
            const hash = await writeContractAsync({
              address: WAGER_POOL_ADDRESS,
              abi: WAGER_POOL_ABI,
              functionName: 'placeBetByRole',
              args: [BigInt(matchId as string), params.role],
              value: amount,
            });
            return hash;
          }
        }

        // Circle 경로: 백엔드 프록시를 통해 트랜잭션 전송
        if (source === 'circle') {
          const walletId = localStorage.getItem('gp_circle_walletId');
          const userToken = localStorage.getItem('gp_circle_userId');

          if (!walletId || !userToken) {
            throw new Error('Circle 지갑 세션이 만료되었습니다');
          }

          const method = 'side' in params ? 'placeBet' : 'placeBetByRole';
          const methodParams = 'side' in params
            ? [matchId, params.side]
            : [matchId, params.role];

          const response = await fetch(`${API_BASE}/wallet/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletId,
              userToken,
              contractAddress: WAGER_POOL_ADDRESS,
              method,
              params: methodParams,
              value: amount.toString(),
            }),
          });

          if (!response.ok) {
            const errorData = await response.json() as { error?: string };
            throw new Error(errorData.error || '트랜잭션 전송 실패');
          }

          const data = await response.json() as { txHash: string };
          return data.txHash;
        }

        throw new Error('지원하지 않는 지갑 소스');
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '알 수 없는 오류';
        setError(errorMsg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, address, source, writeContractAsync],
  );

  return {
    placeBet,
    isLoading,
    error,
  };
}

