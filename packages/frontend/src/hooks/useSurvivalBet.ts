/**
 * SurvivalBet 컨트랙트 상호작용을 위한 커스텀 훅
 *
 * Survival Mode에서 플레이어의 생존 라운드를 예측하고 베팅하는 기능을 제공합니다.
 */

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';
import { SURVIVAL_BET_ABI, SURVIVAL_BET_ADDRESS, SessionStatus } from '../lib/contracts.js';
import { wagmiConfig } from '../lib/wagmiConfig.js';
import type { Address } from 'viem';

/**
 * 세션 정보 타입
 */
export interface SessionInfo {
  /** 플레이어 주소 */
  player: Address;
  /** 세션 상태 (0: Betting, 1: Active, 2: Settled) */
  status: SessionStatus;
  /** 전체 베팅 풀 금액 (wei) */
  totalPool: bigint;
  /** 플레이어가 탈락한 라운드 (0이면 아직 탈락하지 않음) */
  eliminationRound: number;
}

/**
 * 예측 정보 타입
 */
export interface PredictionInfo {
  /** 예측한 라운드 */
  predictedRound: number;
  /** 베팅 금액 (wei) */
  amount: bigint;
  /** 상금 청구 여부 */
  claimed: boolean;
}

/**
 * useSurvivalBet 훅 반환 타입
 */
interface UseSurvivalBetReturn {
  /** 라운드 예측 베팅하기 */
  placePrediction: (sessionId: bigint, predictedRound: number, amount: bigint) => void;
  /** 상금 청구하기 */
  claimPayout: (sessionId: bigint) => void;
  /** 세션 정보 조회 */
  getSessionInfo: (sessionId: bigint) => Promise<SessionInfo | null>;
  /** 라운드별 베팅 분포 조회 */
  getPredictionDistribution: (sessionId: bigint) => Promise<bigint[] | null>;
  /** 내 예측 정보 조회 */
  getMyPrediction: (sessionId: bigint) => Promise<PredictionInfo | null>;
  /** 예상 상금 조회 */
  calculatePayout: (sessionId: bigint) => Promise<bigint | null>;
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
 * SurvivalBet 컨트랙트 상호작용을 위한 커스텀 훅
 *
 * @returns SurvivalBet 상태 및 제어 함수들
 *
 * @example
 * ```tsx
 * function PredictionPanel({ sessionId }: { sessionId: bigint }) {
 *   const {
 *     placePrediction,
 *     getSessionInfo,
 *     getPredictionDistribution,
 *     isPending,
 *     isConfirmed
 *   } = useSurvivalBet();
 *
 *   const sessionInfo = getSessionInfo(sessionId);
 *   const distribution = getPredictionDistribution(sessionId);
 *
 *   const handlePredict = (round: number) => {
 *     placePrediction(sessionId, round, parseEther('0.05'));
 *   };
 *
 *   return (
 *     <div>
 *       <p>전체 풀: {formatEther(sessionInfo?.totalPool ?? 0n)} MON</p>
 *       {distribution?.map((amount, round) => (
 *         <button key={round} onClick={() => handlePredict(round)} disabled={isPending}>
 *           라운드 {round}: {formatEther(amount)} MON
 *         </button>
 *       ))}
 *       {isConfirmed && <p>예측 완료!</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSurvivalBet(): UseSurvivalBetReturn {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  /**
   * 라운드 예측 베팅하기
   *
   * @param sessionId - 세션 ID
   * @param predictedRound - 예측하는 생존 라운드 (1부터 시작)
   * @param amount - 베팅 금액 (wei)
   *
   * @throws 컨트랙트 주소가 설정되지 않은 경우
   */
  const placePrediction = (sessionId: bigint, predictedRound: number, amount: bigint): void => {
    if (!SURVIVAL_BET_ADDRESS) {
      throw new Error('SurvivalBet 컨트랙트 주소가 설정되지 않았습니다');
    }

    writeContract({
      address: SURVIVAL_BET_ADDRESS,
      abi: SURVIVAL_BET_ABI,
      functionName: 'placePrediction',
      args: [sessionId, predictedRound],
      value: amount,
    });
  };

  /**
   * 세션 상금 청구하기
   *
   * @param sessionId - 세션 ID
   *
   * @throws 컨트랙트 주소가 설정되지 않은 경우
   */
  const claimPayout = (sessionId: bigint): void => {
    if (!SURVIVAL_BET_ADDRESS) {
      throw new Error('SurvivalBet 컨트랙트 주소가 설정되지 않았습니다');
    }

    writeContract({
      address: SURVIVAL_BET_ADDRESS,
      abi: SURVIVAL_BET_ABI,
      functionName: 'claimPayout',
      args: [sessionId],
    });
  };

  /**
   * 세션 정보 조회
   *
   * @param sessionId - 세션 ID
   * @returns 세션 정보 또는 null (컨트랙트 주소 미설정 시)
   */
  const getSessionInfo = async (sessionId: bigint): Promise<SessionInfo | null> => {
    if (!SURVIVAL_BET_ADDRESS) return null;

    const client = getPublicClient(wagmiConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (client === undefined) return null;

    try {
      const data = await client.readContract({
        address: SURVIVAL_BET_ADDRESS,
        abi: SURVIVAL_BET_ABI,
        functionName: 'getSessionInfo',
        args: [sessionId],
      });

      const [player, status, totalPool, eliminationRound] = data as [
        Address,
        number,
        bigint,
        number,
      ];

      return {
        player,
        status: status as SessionStatus,
        totalPool,
        eliminationRound,
      };
    } catch (error) {
      console.error('세션 정보 조회 실패:', error);
      return null;
    }
  };

  /**
   * 라운드별 베팅 분포 조회
   *
   * @param sessionId - 세션 ID
   * @returns 각 라운드에 베팅된 금액 배열 또는 null (컨트랙트 주소 미설정 시)
   */
  const getPredictionDistribution = async (sessionId: bigint): Promise<bigint[] | null> => {
    if (!SURVIVAL_BET_ADDRESS) return null;

    const client = getPublicClient(wagmiConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (client === undefined) return null;

    try {
      const data = await client.readContract({
        address: SURVIVAL_BET_ADDRESS,
        abi: SURVIVAL_BET_ABI,
        functionName: 'getPredictionDistribution',
        args: [sessionId],
      });

      return data as bigint[];
    } catch (error) {
      console.error('예측 분포 조회 실패:', error);
      return null;
    }
  };

  /**
   * 내 예측 정보 조회
   *
   * @param sessionId - 세션 ID
   * @returns 예측 정보 또는 null (컨트랙트 주소 미설정 또는 지갑 미연결 시)
   */
  const getMyPrediction = async (sessionId: bigint): Promise<PredictionInfo | null> => {
    if (!SURVIVAL_BET_ADDRESS || address === undefined) return null;

    const client = getPublicClient(wagmiConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (client === undefined) return null;

    try {
      const data = await client.readContract({
        address: SURVIVAL_BET_ADDRESS,
        abi: SURVIVAL_BET_ABI,
        functionName: 'getPredictionInfo',
        args: [sessionId, address],
      });

      const [predictedRound, amount, claimed] = data as [number, bigint, boolean];

      return {
        predictedRound,
        amount,
        claimed,
      };
    } catch (error) {
      console.error('예측 정보 조회 실패:', error);
      return null;
    }
  };

  /**
   * 예상 상금 조회
   *
   * 내가 예측한 라운드가 맞았을 경우 받을 수 있는 상금을 계산합니다.
   *
   * @param sessionId - 세션 ID
   * @returns 예상 상금 (wei) 또는 null (컨트랙트 주소 미설정 또는 지갑 미연결 시)
   */
  const calculatePayout = async (sessionId: bigint): Promise<bigint | null> => {
    if (!SURVIVAL_BET_ADDRESS || address === undefined) return null;

    const client = getPublicClient(wagmiConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (client === undefined) return null;

    try {
      const data = await client.readContract({
        address: SURVIVAL_BET_ADDRESS,
        abi: SURVIVAL_BET_ABI,
        functionName: 'calculatePayout',
        args: [sessionId, address],
      });

      return data;
    } catch (error) {
      console.error('상금 계산 실패:', error);
      return null;
    }
  };

  return {
    placePrediction,
    claimPayout,
    getSessionInfo,
    getPredictionDistribution,
    getMyPrediction,
    calculatePayout,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    reset,
  };
}
