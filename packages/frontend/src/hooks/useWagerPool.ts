/**
 * WagerPool 컨트랙트 상호작용을 위한 커스텀 훅
 *
 * Arena Mode에서 AI vs AI 매치에 베팅하고 상금을 청구하는 기능을 제공합니다.
 */

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';
import { WAGER_POOL_ABI, WAGER_POOL_ADDRESS, Side, PoolStatus } from '../lib/contracts.js';
import { wagmiConfig } from '../lib/wagmiConfig.js';

/**
 * 풀 정보 타입
 */
export interface PoolInfo {
  /** 전체 베팅 풀 금액 (wei) */
  totalPool: bigint;
  /** Agent A 측 베팅 총액 (wei) */
  sideAPool: bigint;
  /** Agent B 측 베팅 총액 (wei) */
  sideBPool: bigint;
  /** 풀 상태 (0: Open, 1: Locked, 2: Settled, 3: Refunded) */
  status: PoolStatus;
}

/**
 * 베팅 정보 타입
 */
export interface BetInfo {
  /** 베팅한 측면 (0: AgentA, 1: AgentB) */
  side: Side;
  /** 베팅 금액 (wei) */
  amount: bigint;
  /** 상금 청구 여부 */
  claimed: boolean;
}

/**
 * useWagerPool 훅 반환 타입
 */
interface UseWagerPoolReturn {
  /** 베팅하기 */
  placeBet: (matchId: bigint, side: Side, amount: bigint) => void;
  /** 상금 청구하기 */
  claimWinnings: (matchId: bigint) => void;
  /** 풀 정보 조회 */
  getPoolInfo: (matchId: bigint) => Promise<PoolInfo | null>;
  /** 내 베팅 정보 조회 */
  getMyBet: (matchId: bigint) => Promise<BetInfo | null>;
  /** 트랜잭션 해시 */
  txHash: `0x${string}` | undefined;
  /** 트랜잭션 대기 중 */
  isPending: boolean;
  /** 트랜잭션 확인 중 */
  isConfirming: boolean;
  /** 트랜잭션 확인 완료 */
  isConfirmed: boolean;
  /** 에러 */
  error: Error | null;
  /** 트랜잭션 상태 초기화 */
  reset: () => void;
}

/**
 * WagerPool 컨트랙트 상호작용을 위한 커스텀 훅
 *
 * @returns WagerPool 상태 및 제어 함수들
 *
 * @example
 * ```tsx
 * function BettingPanel({ matchId }: { matchId: bigint }) {
 *   const { placeBet, getPoolInfo, isPending, isConfirmed } = useWagerPool();
 *   const poolInfo = getPoolInfo(matchId);
 *
 *   const handleBet = () => {
 *     placeBet(matchId, Side.AgentA, parseEther('0.1'));
 *   };
 *
 *   return (
 *     <div>
 *       <p>전체 풀: {formatEther(poolInfo?.totalPool ?? 0n)} MON</p>
 *       <button onClick={handleBet} disabled={isPending}>
 *         {isPending ? '베팅 중...' : 'Agent A에 베팅'}
 *       </button>
 *       {isConfirmed && <p>베팅 완료!</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWagerPool(): UseWagerPoolReturn {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  /**
   * 매치에 베팅하기
   *
   * @param matchId - 매치 ID
   * @param side - 베팅할 측면 (0: AgentA, 1: AgentB)
   * @param amount - 베팅 금액 (wei)
   *
   * @throws 컨트랙트 주소가 설정되지 않은 경우
   */
  const placeBet = (matchId: bigint, side: Side, amount: bigint): void => {
    if (!WAGER_POOL_ADDRESS) {
      throw new Error('WagerPool 컨트랙트 주소가 설정되지 않았습니다');
    }

    writeContract({
      address: WAGER_POOL_ADDRESS,
      abi: WAGER_POOL_ABI,
      functionName: 'placeBet',
      args: [matchId, side],
      value: amount,
    });
  };

  /**
   * 매치 상금 청구하기
   *
   * @param matchId - 매치 ID
   *
   * @throws 컨트랙트 주소가 설정되지 않은 경우
   */
  const claimWinnings = (matchId: bigint): void => {
    if (!WAGER_POOL_ADDRESS) {
      throw new Error('WagerPool 컨트랙트 주소가 설정되지 않았습니다');
    }

    writeContract({
      address: WAGER_POOL_ADDRESS,
      abi: WAGER_POOL_ABI,
      functionName: 'claimWinnings',
      args: [matchId],
    });
  };

  /**
   * 매치 풀 정보 조회
   *
   * @param matchId - 매치 ID
   * @returns 풀 정보 또는 null (컨트랙트 주소 미설정 시)
   */
  const getPoolInfo = async (matchId: bigint): Promise<PoolInfo | null> => {
    if (!WAGER_POOL_ADDRESS) return null;

    const client = getPublicClient(wagmiConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (client === undefined) return null;

    try {
      const data = await client.readContract({
        address: WAGER_POOL_ADDRESS,
        abi: WAGER_POOL_ABI,
        functionName: 'getPoolInfo',
        args: [matchId],
      });

      const [totalPool, sideAPool, sideBPool, status] = data as [bigint, bigint, bigint, number];

      return {
        totalPool,
        sideAPool,
        sideBPool,
        status: status as PoolStatus,
      };
    } catch (error) {
      console.error('풀 정보 조회 실패:', error);
      return null;
    }
  };

  /**
   * 내 베팅 정보 조회
   *
   * @param matchId - 매치 ID
   * @returns 베팅 정보 또는 null (컨트랙트 주소 미설정 또는 지갑 미연결 시)
   */
  const getMyBet = async (matchId: bigint): Promise<BetInfo | null> => {
    if (!WAGER_POOL_ADDRESS || address === undefined) return null;

    const client = getPublicClient(wagmiConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (client === undefined) return null;

    try {
      const data = await client.readContract({
        address: WAGER_POOL_ADDRESS,
        abi: WAGER_POOL_ABI,
        functionName: 'getBetInfo',
        args: [matchId, address],
      });

      const [side, amount, claimed] = data as [number, bigint, boolean];

      return {
        side: side as Side,
        amount,
        claimed,
      };
    } catch (error) {
      console.error('베팅 정보 조회 실패:', error);
      return null;
    }
  };

  return {
    placeBet,
    claimWinnings,
    getPoolInfo,
    getMyBet,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    reset,
  };
}
