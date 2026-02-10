import { parseAbi } from 'viem';

/**
 * 스마트 컨트랙트 ABI 및 주소 정의
 *
 * Ghost Protocol의 WagerPool 및 SurvivalBet 컨트랙트와 상호작용하기 위한
 * ABI 및 배포된 컨트랙트 주소를 정의합니다.
 */

/**
 * WagerPool 컨트랙트 ABI (human-readable format)
 *
 * Arena Mode에서 AI vs AI 매치에 베팅하고 상금을 청구하는 기능을 제공합니다.
 */
export const WAGER_POOL_ABI = parseAbi([
  // 쓰기 함수
  'function placeBet(uint256 matchId, uint8 side) external payable',
  'function placeBetByRole(uint256 matchId, uint8 role) external payable',
  'function claimWinnings(uint256 matchId) external',
  'function lockBets(uint256 matchId) external',
  'function settleBets(uint256 matchId, uint8 winner) external',
  'function refund(uint256 matchId) external',

  // 읽기 함수
  'function getPoolInfo(uint256 matchId) external view returns (uint256 totalPool, uint256 sideAPool, uint256 sideBPool, uint8 status)',
  'function getBetInfo(uint256 matchId, address bettor) external view returns (uint8 side, uint256 amount, bool claimed)',
  'function getMatchOdds(uint256 matchId) external view returns (uint256 oddsA, uint256 oddsB)',

  // 이벤트
  'event BetPlaced(uint256 indexed matchId, address indexed bettor, uint8 side, uint256 amount)',
  'event BetsLocked(uint256 indexed matchId, uint256 totalPool)',
  'event BetsSettled(uint256 indexed matchId, uint8 winner, uint256 totalPayout)',
  'event WinningsClaimed(uint256 indexed matchId, address indexed bettor, uint256 amount)',
  'event BetsRefunded(uint256 indexed matchId)',
]);

/**
 * SurvivalBet 컨트랙트 ABI (human-readable format)
 *
 * Survival Mode에서 플레이어의 생존 라운드를 예측하고 베팅하는 기능을 제공합니다.
 */
export const SURVIVAL_BET_ABI = parseAbi([
  // 쓰기 함수
  'function placePrediction(uint256 sessionId, uint8 predictedRound) external payable',
  'function claimPayout(uint256 sessionId) external',
  'function createSession(address player) external returns (uint256)',
  'function recordRoundSurvived(uint256 sessionId, uint8 round) external',
  'function settleSession(uint256 sessionId, uint8 eliminationRound) external',

  // 읽기 함수
  'function getSessionInfo(uint256 sessionId) external view returns (address player, uint8 status, uint256 totalPool, uint8 eliminationRound)',
  'function getPredictionInfo(uint256 sessionId, address bettor) external view returns (uint8 predictedRound, uint256 amount, bool claimed)',
  'function getPredictionDistribution(uint256 sessionId) external view returns (uint256[] memory roundAmounts)',
  'function calculatePayout(uint256 sessionId, address bettor) external view returns (uint256)',

  // 이벤트
  'event PredictionPlaced(uint256 indexed sessionId, address indexed bettor, uint8 predictedRound, uint256 amount)',
  'event RoundSurvived(uint256 indexed sessionId, uint8 round)',
  'event SessionSettled(uint256 indexed sessionId, uint8 eliminationRound, uint256 totalPayout)',
  'event PayoutClaimed(uint256 indexed sessionId, address indexed bettor, uint256 amount)',
]);

/**
 * WagerPool 컨트랙트 주소
 *
 * 환경 변수 VITE_WAGER_POOL_ADDRESS에서 가져옵니다.
 * 설정되지 않은 경우 undefined를 반환하여 graceful degradation을 지원합니다.
 */
export const WAGER_POOL_ADDRESS = import.meta.env['VITE_WAGER_POOL_ADDRESS'] as
  | `0x${string}`
  | undefined;

/**
 * SurvivalBet 컨트랙트 주소
 *
 * 환경 변수 VITE_SURVIVAL_BET_ADDRESS에서 가져옵니다.
 * 설정되지 않은 경우 undefined를 반환하여 graceful degradation을 지원합니다.
 */
export const SURVIVAL_BET_ADDRESS = import.meta.env['VITE_SURVIVAL_BET_ADDRESS'] as
  | `0x${string}`
  | undefined;

/**
 * WagerPool 베팅 측면 열거형
 */
export enum Side {
  /** Agent A 측에 베팅 */
  AgentA = 0,
  /** Agent B 측에 베팅 */
  AgentB = 1,
}

/**
 * WagerPool 풀 상태 열거형
 */
export enum PoolStatus {
  /** 베팅 접수 중 */
  Open = 0,
  /** 베팅 마감됨 */
  Locked = 1,
  /** 결과 정산 완료 */
  Settled = 2,
  /** 환불 처리됨 */
  Refunded = 3,
}

/**
 * SurvivalBet 세션 상태 열거형
 */
export enum SessionStatus {
  /** 베팅 접수 중 */
  Betting = 0,
  /** 게임 진행 중 */
  Active = 1,
  /** 결과 정산 완료 */
  Settled = 2,
}
