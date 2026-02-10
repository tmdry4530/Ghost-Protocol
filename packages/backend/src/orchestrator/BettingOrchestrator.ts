import { Contract, Wallet, JsonRpcProvider } from 'ethers';
import type { SocketManager } from '../websocket/SocketManager.js';
import { BETTING_WINDOW_MIN, BETTING_WINDOW_MAX } from '@ghost-protocol/shared';
import type { BettingPool, MatchId, BetSide } from '@ghost-protocol/shared';
import pino from 'pino';

const logger = pino({ name: 'betting-orchestrator' });

/** BettingOrchestrator 설정 */
export interface BettingOrchestratorConfig {
  readonly rpcUrl: string;
  readonly privateKey: string;
  readonly wagerPoolAddress: string;
  readonly socketManager: SocketManager;
}

/** WagerPool ABI (필요한 함수만) */
const WAGER_POOL_ABI = [
  'function lockBets(uint256 matchId) external',
  'function settleBets(uint256 matchId, uint8 winner) external',
] as const;

/** 활성 배팅 세션 */
interface BettingSession {
  readonly matchId: string;
  readonly pool: BettingPool;
  windowTimer: ReturnType<typeof setTimeout> | null;
  oddsInterval: ReturnType<typeof setInterval> | null;
  locked: boolean;
}

/**
 * 배팅 오케스트레이터
 * 매치별 배팅 창을 관리하고 온체인 배팅 잠금/정산을 처리합니다.
 */
export class BettingOrchestrator {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly wagerPoolContract: Contract;
  private readonly socketManager: SocketManager;
  private readonly sessions: Map<string, BettingSession> = new Map();

  constructor(config: BettingOrchestratorConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.wagerPoolContract = new Contract(
      config.wagerPoolAddress,
      WAGER_POOL_ABI,
      this.wallet,
    );
    this.socketManager = config.socketManager;
  }

  /**
   * 매치 배팅 창 열기
   * @param matchId 매치 ID
   * @param agentA 에이전트 A 주소
   * @param agentB 에이전트 B 주소
   * @param windowSeconds 배팅 창 시간 (초) - BETTING_WINDOW_MIN ~ MAX 사이
   */
  openBettingWindow(
    matchId: string,
    agentA: string,
    agentB: string,
    windowSeconds?: number,
  ): void {
    const window = windowSeconds ?? this.calculateBettingWindow();

    logger.info({ matchId, window }, 'Opening betting window');

    // 초기 배팅 풀 생성
    const pool: BettingPool = {
      matchId: matchId as MatchId,
      totalPool: 0n,
      sideA: 0n,
      sideB: 0n,
      oddsA: 2.0,
      oddsB: 2.0,
      betCount: 0,
      locked: false,
    };

    const session: BettingSession = {
      matchId,
      pool,
      windowTimer: null,
      oddsInterval: null,
      locked: false,
    };

    this.sessions.set(matchId, session);

    // 배팅 창 열림 알림
    this.socketManager.broadcastBetUpdate(matchId, {
      type: 'betting_opened',
      matchId,
      agentA,
      agentB,
      windowSeconds: window,
      pool: this.serializePool(pool),
    });

    // 실시간 배당률 업데이트 (1초마다)
    session.oddsInterval = setInterval(() => {
      this.broadcastOddsUpdate(matchId);
    }, 1000);

    // 배팅 창 타이머 (만료 시 잠금)
    session.windowTimer = setTimeout(() => {
      void this.lockBets(matchId);
    }, window * 1000);
  }

  /**
   * 배팅 기록 (서버사이드 트래킹용)
   * 실제 배팅은 온체인 WagerPool.placeBet()으로 직접 처리
   */
  recordBet(matchId: string, side: BetSide, amount: bigint): void {
    const session = this.sessions.get(matchId);
    if (!session || session.locked) return;

    // 로컬 풀 상태 업데이트 (배당률 계산용)
    const updatedPool: BettingPool = {
      ...session.pool,
      totalPool: session.pool.totalPool + amount,
      sideA: side === 'agentA' ? session.pool.sideA + amount : session.pool.sideA,
      sideB: side === 'agentB' ? session.pool.sideB + amount : session.pool.sideB,
      betCount: session.pool.betCount + 1,
      oddsA: this.calculateOdds(
        side === 'agentA' ? session.pool.sideA + amount : session.pool.sideA,
        side === 'agentB' ? session.pool.sideB + amount : session.pool.sideB,
      ).oddsA,
      oddsB: this.calculateOdds(
        side === 'agentA' ? session.pool.sideA + amount : session.pool.sideA,
        side === 'agentB' ? session.pool.sideB + amount : session.pool.sideB,
      ).oddsB,
    };

    // session.pool is readonly, create new session
    this.sessions.set(matchId, {
      ...session,
      pool: updatedPool,
    });

    // 즉시 배팅 업데이트 브로드캐스트
    this.socketManager.broadcastBetUpdate(matchId, {
      type: 'bet_placed',
      matchId,
      side,
      amount: amount.toString(),
      pool: this.serializePool(updatedPool),
    });
  }

  /**
   * 배팅 잠금 (온체인)
   * 배팅 창 만료 시 자동 호출
   */
  async lockBets(matchId: string): Promise<void> {
    const session = this.sessions.get(matchId);
    if (!session || session.locked) return;

    // 타이머 정리
    if (session.oddsInterval) clearInterval(session.oddsInterval);
    if (session.windowTimer) clearTimeout(session.windowTimer);

    logger.info({ matchId }, 'Locking bets');

    try {
      // 온체인 잠금
      const tx = (await this.wagerPoolContract.getFunction('lockBets')(matchId)) as { wait: () => Promise<unknown> };
      await tx.wait();

      // 세션 업데이트
      this.sessions.set(matchId, {
        ...session,
        locked: true,
        oddsInterval: null,
        windowTimer: null,
        pool: { ...session.pool, locked: true },
      });

      // 잠금 알림
      this.socketManager.broadcastBetUpdate(matchId, {
        type: 'bets_locked',
        matchId,
        totalPool: session.pool.totalPool.toString(),
      });

      logger.info({ matchId }, 'Bets locked');
    } catch (error) {
      logger.error({
        matchId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to lock bets');
    }
  }

  /**
   * 배팅 정산 (매치 결과 후)
   * @param matchId 매치 ID
   * @param winner 승리 사이드 ('agentA' | 'agentB')
   */
  async settleBets(matchId: string, winner: BetSide): Promise<void> {
    const session = this.sessions.get(matchId);
    if (!session) return;

    logger.info({ matchId, winner }, 'Settling bets');

    try {
      // 온체인 정산 (winner를 uint8로 변환: agentA=0, agentB=1)
      const winnerSide = winner === 'agentA' ? 0 : 1;
      const tx = (await this.wagerPoolContract.getFunction('settleBets')(matchId, winnerSide)) as { wait: () => Promise<unknown> };
      await tx.wait();

      // 정산 알림
      this.socketManager.broadcastBetUpdate(matchId, {
        type: 'bets_settled',
        matchId,
        winner,
        totalPool: session.pool.totalPool.toString(),
      });

      // 세션 정리
      this.sessions.delete(matchId);

      logger.info({ matchId, winner }, 'Bets settled');
    } catch (error) {
      logger.error({
        matchId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to settle bets');
    }
  }

  /**
   * 실시간 배당률 계산
   */
  private calculateOdds(sideA: bigint, sideB: bigint): { oddsA: number; oddsB: number } {
    const totalBigInt = sideA + sideB;
    if (totalBigInt === 0n) return { oddsA: 2.0, oddsB: 2.0 };

    const total = Number(totalBigInt);
    const a = Number(sideA);
    const b = Number(sideB);

    return {
      oddsA: a > 0 ? total / a : 99.99,
      oddsB: b > 0 ? total / b : 99.99,
    };
  }

  /**
   * 배당률 업데이트 브로드캐스트
   */
  private broadcastOddsUpdate(matchId: string): void {
    const session = this.sessions.get(matchId);
    if (!session || session.locked) return;

    this.socketManager.broadcastBetUpdate(matchId, {
      type: 'odds_update',
      matchId,
      pool: this.serializePool(session.pool),
    });
  }

  /**
   * 배팅 창 시간 결정 (30~60초 범위)
   */
  private calculateBettingWindow(): number {
    return Math.floor(
      Math.random() * (BETTING_WINDOW_MAX - BETTING_WINDOW_MIN + 1) + BETTING_WINDOW_MIN,
    );
  }

  /**
   * BettingPool 직렬화 (BigInt → string)
   */
  private serializePool(pool: BettingPool): Record<string, unknown> {
    return {
      matchId: pool.matchId,
      totalPool: pool.totalPool.toString(),
      sideA: pool.sideA.toString(),
      sideB: pool.sideB.toString(),
      oddsA: pool.oddsA,
      oddsB: pool.oddsB,
      betCount: pool.betCount,
      locked: pool.locked,
    };
  }

  /**
   * 활성 배팅 세션 수
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 정리 (서버 종료 시)
   */
  shutdown(): void {
    for (const [matchId, session] of this.sessions) {
      if (session.windowTimer) clearTimeout(session.windowTimer);
      if (session.oddsInterval) clearInterval(session.oddsInterval);
      this.sessions.delete(matchId);
    }
    logger.info('BettingOrchestrator shutdown');
  }
}
