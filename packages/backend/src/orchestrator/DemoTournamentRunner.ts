/**
 * 데모 토너먼트 자동 실행기
 * 서버 시작 시 데모 에이전트로 토너먼트를 자동 생성/실행하여
 * 프론트엔드에서 실시간 데이터를 확인할 수 있게 합니다.
 */
import type { GameLoopManager } from '../game/GameLoopManager.js';
import type { SocketManager } from '../websocket/SocketManager.js';
import type { ApiStateStore, TournamentData, MatchData } from '../routes/api.js';
import type { MazeVariant, DifficultyTier, GameState } from '@ghost-protocol/shared';
import pino from 'pino';

const logger = pino({ name: 'demo-tournament' });

/** 미로 변형 목록 */
const MAZE_VARIANTS: MazeVariant[] = ['classic', 'labyrinth', 'speedway', 'fortress', 'random'];

/**
 * 데모 토너먼트 자동 실행기
 */
export class DemoTournamentRunner {
  private readonly gameLoopManager: GameLoopManager;
  private readonly socketManager: SocketManager;
  private readonly stateStore: ApiStateStore;
  private running = false;
  private tournamentCounter = 0;
  private matchCounter = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    gameLoopManager: GameLoopManager,
    socketManager: SocketManager,
    stateStore: ApiStateStore,
  ) {
    this.gameLoopManager = gameLoopManager;
    this.socketManager = socketManager;
    this.stateStore = stateStore;
  }

  /** 데모 토너먼트 자동 실행 시작 */
  start(): void {
    if (this.running) return;
    this.running = true;

    logger.info('Demo tournament runner started');

    // 즉시 첫 토너먼트 생성
    void this.createAndRunTournament();

    // 5분마다 새 토너먼트 생성
    this.intervalId = setInterval(() => {
      if (this.running) {
        void this.createAndRunTournament();
      }
    }, 5 * 60 * 1000);
  }

  /** 정지 */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Demo tournament runner stopped');
  }

  /** 토너먼트 생성 및 실행 */
  private async createAndRunTournament(): Promise<void> {
    const agents = [...this.stateStore.agents.values()].filter((a) => a.active);
    if (agents.length < 8) {
      logger.warn('Insufficient active agents (minimum 8 required)');
      return;
    }

    // 8강 토너먼트 생성
    const tournamentId = `tournament-${String(++this.tournamentCounter)}`;
    const participants = agents
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 8)
      .map((a) => a.address);

    const tournament: TournamentData = {
      id: tournamentId,
      participants,
      bracketSize: 8,
      status: 'active',
      currentRound: 1,
      matches: [],
      champion: null,
      prizePool: '1.0',
      createdAt: Date.now(),
    };

    this.stateStore.tournaments.set(tournamentId, tournament);

    // 로비에 토너먼트 생성 알림
    this.socketManager.broadcastTournamentUpdate({
      id: tournamentId,
      participants,
      bracketSize: 8,
      status: 'active',
      createdAt: tournament.createdAt,
      prizePool: '1000000000000000000',
    });

    this.socketManager.broadcastFeedItem({
      id: `feed-${Date.now().toString(36)}`,
      type: 'tournament_created',
      message: `New tournament #${String(this.tournamentCounter)} started! 8 AI agents participating.`,
      timestamp: Date.now(),
      data: { tournamentId },
    });

    logger.info({ tournamentId, participants: participants.length }, 'Demo tournament created');

    // 라운드별 실행
    try {
      await this.runTournamentRounds(tournamentId, participants);
    } catch (error) {
      logger.error(
        {
          tournamentId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Tournament execution error',
      );
    }
  }

  /** 토너먼트 라운드 순차 실행 */
  private async runTournamentRounds(
    tournamentId: string,
    participants: string[],
  ): Promise<void> {
    let currentParticipants = [...participants];
    let roundNumber = 1;

    while (currentParticipants.length > 1 && this.running) {
      const tournament = this.stateStore.tournaments.get(tournamentId);
      if (!tournament) return;

      tournament.currentRound = roundNumber;

      logger.info(
        { tournamentId, round: roundNumber, participants: currentParticipants.length },
        'Round started',
      );

      // 페어링 생성
      const pairings: Array<{ agentA: string; agentB: string }> = [];
      for (let i = 0; i < currentParticipants.length; i += 2) {
        const a = currentParticipants[i];
        const b = currentParticipants[i + 1];
        if (a && b) pairings.push({ agentA: a, agentB: b });
      }

      // 각 매치를 순차 실행 (동시 실행은 리소스 부담)
      const roundWinners: string[] = [];

      for (const pairing of pairings) {
        if (!this.running) return;

        const matchId = `match-${String(++this.matchCounter)}`;
        const variant =
          MAZE_VARIANTS[Math.floor(Math.random() * MAZE_VARIANTS.length)] ?? 'classic';
        const seed = Math.floor(Math.random() * 0xffffffff);

        const match: MatchData = {
          id: matchId,
          tournamentId,
          round: roundNumber,
          agentA: pairing.agentA,
          agentB: pairing.agentB,
          scoreA: 0,
          scoreB: 0,
          winner: null,
          status: 'betting',
          createdAt: Date.now(),
        };

        this.stateStore.matches.set(matchId, match);
        tournament.matches.push(match);

        // 로비에 매치 업데이트
        const agentA = this.stateStore.agents.get(pairing.agentA);
        const agentB = this.stateStore.agents.get(pairing.agentB);

        this.socketManager.broadcastMatchUpdate({
          id: matchId,
          tournamentId,
          agentA: pairing.agentA,
          agentB: pairing.agentB,
          agentAName: agentA?.name ?? 'Unknown',
          agentBName: agentB?.name ?? 'Unknown',
          scoreA: 0,
          scoreB: 0,
          winner: null,
          status: 'betting',
        });

        // Betting period (wait 3 seconds)
        await this.delay(3000);

        // Change status to match started
        match.status = 'active';
        this.socketManager.broadcastMatchUpdate({
          id: matchId,
          tournamentId,
          agentA: pairing.agentA,
          agentB: pairing.agentB,
          agentAName: agentA?.name ?? 'Unknown',
          agentBName: agentB?.name ?? 'Unknown',
          scoreA: 0,
          scoreB: 0,
          winner: null,
          status: 'active',
        });

        this.socketManager.broadcastFeedItem({
          id: `feed-${Date.now().toString(36)}`,
          type: 'match_started',
          message: `${agentA?.name ?? '?'} vs ${agentB?.name ?? '?'} match started!`,
          timestamp: Date.now(),
          data: { matchId, tournamentId },
        });

        // Execute match (sequential: A → B → compare)
        const result = await this.runMatch(
          matchId,
          pairing.agentA,
          pairing.agentB,
          variant,
          seed,
        );

        // Apply result
        match.scoreA = result.scoreA;
        match.scoreB = result.scoreB;
        match.winner = result.winner;
        match.status = 'completed';

        roundWinners.push(result.winner);

        // Update ELO
        const loser = result.winner === pairing.agentA ? pairing.agentB : pairing.agentA;
        this.stateStore.updateElo(result.winner, loser);

        // Broadcast match result
        const winnerAgent = this.stateStore.agents.get(result.winner);
        this.socketManager.broadcastMatchUpdate({
          id: matchId,
          tournamentId,
          agentA: pairing.agentA,
          agentB: pairing.agentB,
          agentAName: agentA?.name ?? 'Unknown',
          agentBName: agentB?.name ?? 'Unknown',
          scoreA: result.scoreA,
          scoreB: result.scoreB,
          winner: result.winner,
          status: 'completed',
        });

        this.socketManager.broadcastFeedItem({
          id: `feed-${Date.now().toString(36)}`,
          type: 'match_completed',
          message: `${winnerAgent?.name ?? '?'} wins! (${String(result.scoreA)} vs ${String(result.scoreB)})`,
          timestamp: Date.now(),
          data: {
            matchId,
            winner: result.winner,
            scoreA: result.scoreA,
            scoreB: result.scoreB,
          },
        });

        // Wait 2 seconds between matches
        await this.delay(2000);
      }

      currentParticipants = roundWinners;
      roundNumber++;
    }

    // Tournament completion
    const tournament = this.stateStore.tournaments.get(tournamentId);
    if (tournament && currentParticipants.length === 1) {
      const champion = currentParticipants[0];
      if (champion) {
        tournament.champion = champion;
        tournament.status = 'completed';

        const championAgent = this.stateStore.agents.get(champion);
        this.socketManager.broadcastTournamentUpdate({
          id: tournamentId,
          status: 'completed',
          champion,
          championName: championAgent?.name ?? 'Unknown',
        });

        this.socketManager.broadcastFeedItem({
          id: `feed-${Date.now().toString(36)}`,
          type: 'tournament_completed',
          message: `Tournament #${String(this.tournamentCounter)} completed! Champion: ${championAgent?.name ?? '?'}`,
          timestamp: Date.now(),
          data: { tournamentId, champion },
        });

        logger.info({ tournamentId, champion: championAgent?.name }, 'Tournament completed');
      }
    }
  }

  /** Execute individual match (sequential: A execution → B execution → compare) */
  private async runMatch(
    matchId: string,
    agentA: string,
    agentB: string,
    variant: MazeVariant,
    seed: number,
  ): Promise<{ scoreA: number; scoreB: number; winner: string }> {
    const difficulty: DifficultyTier = 3;

    // Execute Agent A
    const scoreA = await this.runSingleAgent(`${matchId}:a`, variant, seed, difficulty);

    // Execute Agent B (same maze, same seed)
    const scoreB = await this.runSingleAgent(`${matchId}:b`, variant, seed, difficulty);

    return {
      scoreA,
      scoreB,
      winner: scoreA >= scoreB ? agentA : agentB,
    };
  }

  /** Execute single agent game and wait for completion */
  private runSingleAgent(
    sessionId: string,
    variant: MazeVariant,
    seed: number,
    difficulty: DifficultyTier,
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      const fullSessionId = `match:${sessionId}`;

      this.gameLoopManager.createSession({
        sessionId: fullSessionId,
        sessionType: 'match',
        variant,
        seed,
        difficulty,
        agents: ['ai-agent'],
      });

      // Set game over callback (preserve existing callback)
      const originalCallback = this.gameLoopManager.getOnGameOver();

      this.gameLoopManager.setOnGameOver((sid: string, state: GameState) => {
        // Call original callback
        originalCallback?.(sid, state);

        if (sid === fullSessionId) {
          // Restore callback
          if (originalCallback) {
            this.gameLoopManager.setOnGameOver(originalCallback);
          }
          this.gameLoopManager.removeSession(fullSessionId);
          resolve(state.score);
        }
      });

      this.gameLoopManager.startSession(fullSessionId);
    });
  }

  /** Delay utility */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
