import { Queue, Worker, Job } from 'bullmq';
import type IORedis from 'ioredis';
import { GameLoopManager } from '../game/GameLoopManager.js';
import type { MazeVariant, DifficultyTier, GameState } from '@ghost-protocol/shared';
import pino from 'pino';

const logger = pino({ name: 'match-scheduler' });

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

/** MatchScheduler 설정 */
export interface MatchSchedulerConfig {
  readonly redisConnection: IORedis;
  readonly concurrency?: number; // 기본값 8
  readonly queueName?: string;
}

/** 매치 완료 콜백 */
export type MatchCompleteCallback = (result: MatchJobResult) => void | Promise<void>;

/**
 * 매치 스케줄러
 * BullMQ 기반 작업 큐로 여러 매치를 동시에 실행합니다.
 */
export class MatchScheduler {
  private readonly queue: Queue<MatchJobData, MatchJobResult>;
  private readonly worker: Worker<MatchJobData, MatchJobResult>;
  private readonly gameLoopManager: GameLoopManager;
  private onMatchComplete: MatchCompleteCallback | null = null;

  constructor(config: MatchSchedulerConfig) {
    const queueName = config.queueName ?? 'arena-matches';
    const concurrency = config.concurrency ?? 8;

    this.gameLoopManager = new GameLoopManager();

    // BullMQ 큐 생성
    this.queue = new Queue<MatchJobData, MatchJobResult>(queueName, {
      connection: config.redisConnection,
    });

    // 워커 생성 (동시 처리 지원)
    this.worker = new Worker<MatchJobData, MatchJobResult>(
      queueName,
      async (job: Job<MatchJobData, MatchJobResult>) => {
        return this.processMatch(job);
      },
      {
        connection: config.redisConnection,
        concurrency,
      },
    );

    // 워커 이벤트 설정
    this.worker.on('completed', (job: Job<MatchJobData, MatchJobResult>) => {
      logger.info({ matchId: job.data.matchId }, 'Match completed');
      void this.onMatchComplete?.(job.returnvalue);
    });

    this.worker.on('failed', (job: Job<MatchJobData, MatchJobResult> | undefined, error: Error) => {
      logger.error({ matchId: job?.data.matchId, error: error.message }, 'Match failed');
    });
  }

  /**
   * 매치 완료 콜백 설정
   */
  setOnMatchComplete(callback: MatchCompleteCallback): void {
    this.onMatchComplete = callback;
  }

  /**
   * 매치 스케줄링
   * @param data 매치 작업 데이터
   * @returns BullMQ Job
   */
  async scheduleMatch(data: MatchJobData): Promise<Job<MatchJobData, MatchJobResult>> {
    logger.info(
      {
        matchId: data.matchId,
        agentA: data.agentA,
        agentB: data.agentB,
      },
      'Scheduling match',
    );

    return this.queue.add(`match-${data.matchId}`, data, {
      removeOnComplete: 100, // 최근 100개만 보관
      removeOnFail: 50,
    });
  }

  /**
   * 여러 매치 동시 스케줄링 (같은 라운드)
   */
  async scheduleRoundMatches(
    matches: readonly MatchJobData[],
  ): Promise<Job<MatchJobData, MatchJobResult>[]> {
    logger.info({ count: matches.length }, 'Batch scheduling round matches');

    const jobs = await Promise.all(matches.map((match) => this.scheduleMatch(match)));

    return jobs;
  }

  /**
   * 매치 처리 (워커에서 실행)
   */
  private async processMatch(job: Job<MatchJobData, MatchJobResult>): Promise<MatchJobResult> {
    const { matchId, agentA, agentB, variant, seed, difficulty } = job.data;
    const sessionId = `match:${matchId}`;

    logger.info({ matchId, agentA, agentB }, 'Match execution started');

    // Create game session
    this.gameLoopManager.createSession({
      sessionId,
      sessionType: 'match',
      variant,
      seed,
      difficulty,
      agents: [agentA, agentB],
    });

    // Execute game and wait for completion
    return new Promise<MatchJobResult>((resolve) => {
      // Return result from game over callback
      this.gameLoopManager.setOnGameOver((sid: string, state: GameState) => {
        if (sid !== sessionId) return;

        const replayData = this.gameLoopManager.getReplayData(sessionId);
        this.gameLoopManager.removeSession(sessionId);

        // Arena mode: scoreA vs scoreB (simplified - each plays in same maze)
        const scoreA = state.score;
        const scoreB = 0; // Second agent score (dual mode to be implemented)
        const winner = scoreA >= scoreB ? agentA : agentB;

        resolve({
          matchId,
          scoreA,
          scoreB,
          winner,
          replayData: replayData ?? Buffer.alloc(0),
          totalTicks: state.tick,
        });
      });

      // Start game
      this.gameLoopManager.startSession(sessionId);
    });
  }

  /**
   * Query number of pending jobs
   */
  async getPendingCount(): Promise<number> {
    return this.queue.getWaitingCount();
  }

  /**
   * Query number of active jobs
   */
  async getActiveCount(): Promise<number> {
    return this.queue.getActiveCount();
  }

  /**
   * Cleanup (on server shutdown)
   */
  async shutdown(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.gameLoopManager.shutdown();
    logger.info('MatchScheduler shutdown');
  }
}
