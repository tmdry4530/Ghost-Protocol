/**
 * 인메모리 매치 스케줄러
 * BullMQ/Redis 의존성 없이 매치를 순차/동시 실행
 * 외부에서 공유된 GameLoopManager를 주입받아 WebSocket 브로드캐스트와 연동
 */
import { GameLoopManager } from '../game/GameLoopManager.js';
import type { MazeVariant, DifficultyTier, GameState } from '@ghost-protocol/shared';
import pino from 'pino';

const logger = pino({ name: 'in-memory-match-scheduler' });

/** 매치 작업 데이터 */
export interface MatchJobData {
  readonly matchId: string;
  readonly agentA: string;
  readonly agentB: string;
  readonly variant: MazeVariant;
  readonly seed: number;
  readonly difficulty: DifficultyTier;
  readonly tournamentId: string;
  readonly round: number;
}

/** 매치 결과 */
export interface MatchJobResult {
  readonly matchId: string;
  readonly scoreA: number;
  readonly scoreB: number;
  readonly winner: string;
  readonly replayData: Buffer;
  readonly totalTicks: number;
}

/** 매치 완료 콜백 */
export type MatchCompleteCallback = (result: MatchJobResult) => void | Promise<void>;

/**
 * 인메모리 매치 스케줄러
 * Redis 불필요 — 프로세스 내 큐로 매치 실행
 */
export class InMemoryMatchScheduler {
  private readonly gameLoopManager: GameLoopManager;
  private readonly concurrency: number;
  private onMatchComplete: MatchCompleteCallback | null = null;
  private activeMatches: Set<string> = new Set();
  private pendingQueue: MatchJobData[] = [];

  /**
   * @param gameLoopManager 공유 게임 루프 매니저 (SocketManager와 동일 인스턴스)
   * @param concurrency 동시 실행 수 (기본 4)
   */
  constructor(gameLoopManager: GameLoopManager, concurrency = 4) {
    this.gameLoopManager = gameLoopManager;
    this.concurrency = concurrency;
  }

  /** 매치 완료 콜백 설정 */
  setOnMatchComplete(callback: MatchCompleteCallback): void {
    this.onMatchComplete = callback;
  }

  /** 매치 스케줄링 */
  async scheduleMatch(data: MatchJobData): Promise<void> {
    logger.info({ matchId: data.matchId, agentA: data.agentA, agentB: data.agentB }, 'Scheduling match');

    if (this.activeMatches.size < this.concurrency) {
      await this.processMatch(data);
    } else {
      this.pendingQueue.push(data);
    }
  }

  /** 여러 매치 동시 스케줄링 */
  async scheduleRoundMatches(matches: readonly MatchJobData[]): Promise<void> {
    logger.info({ count: matches.length }, 'Batch scheduling round matches');
    const promises = matches.map((match) => this.scheduleMatch(match));
    await Promise.all(promises);
  }

  /** Process match - sequential execution (A plays → B plays → compare scores) */
  private async processMatch(data: MatchJobData): Promise<void> {
    const { matchId, agentA, agentB, variant, seed, difficulty } = data;
    this.activeMatches.add(matchId);

    logger.info({ matchId, agentA, agentB }, 'Match execution started');

    try {
      // Execute Agent A
      const scoreA = await this.runAgent(matchId, agentA, variant, seed, difficulty);

      // Execute Agent B (same maze, same seed)
      const scoreB = await this.runAgent(matchId, agentB, variant, seed, difficulty);

      const winner = scoreA >= scoreB ? agentA : agentB;
      const replayData =
        this.gameLoopManager.getReplayData(`match:${matchId}:${agentA}`) ?? Buffer.alloc(0);

      const result: MatchJobResult = {
        matchId,
        scoreA,
        scoreB,
        winner,
        replayData,
        totalTicks: 0,
      };

      logger.info({ matchId, scoreA, scoreB, winner }, 'Match completed');

      // Invoke callback
      if (this.onMatchComplete) {
        await this.onMatchComplete(result);
      }
    } catch (error) {
      logger.error(
        { matchId, error: error instanceof Error ? error.message : String(error) },
        'Match execution failed',
      );
    } finally {
      this.activeMatches.delete(matchId);
      // Process pending matches
      void this.processNext();
    }
  }

  /** Execute individual agent and wait until game over */
  private runAgent(
    matchId: string,
    agent: string,
    variant: MazeVariant,
    seed: number,
    difficulty: DifficultyTier,
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      const sessionId = `match:${matchId}:${agent}`;

      this.gameLoopManager.createSession({
        sessionId,
        sessionType: 'match',
        variant,
        seed,
        difficulty,
        agents: [agent],
      });

      // Temporary callback to return score on game over
      const originalOnGameOver = this.gameLoopManager.getOnGameOver();

      this.gameLoopManager.setOnGameOver((sid: string, state: GameState) => {
        // Also call original callback (WebSocket broadcast)
        originalOnGameOver?.(sid, state);

        if (sid === sessionId) {
          this.gameLoopManager.removeSession(sessionId);
          resolve(state.score);
        }
      });

      this.gameLoopManager.startSession(sessionId);
    });
  }

  /** Process next match from pending queue */
  private async processNext(): Promise<void> {
    if (this.pendingQueue.length > 0 && this.activeMatches.size < this.concurrency) {
      const next = this.pendingQueue.shift();
      if (next) {
        await this.processMatch(next);
      }
    }
  }

  /** Number of pending jobs */
  getPendingCount(): number {
    return this.pendingQueue.length;
  }

  /** Number of active jobs */
  getActiveCount(): number {
    return this.activeMatches.size;
  }

  /** Cleanup */
  shutdown(): void {
    this.pendingQueue = [];
    this.activeMatches.clear();
    logger.info('InMemoryMatchScheduler shutdown');
  }
}
