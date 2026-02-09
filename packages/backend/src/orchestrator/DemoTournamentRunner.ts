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

    logger.info('데모 토너먼트 러너 시작');

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
    logger.info('데모 토너먼트 러너 정지');
  }

  /** 토너먼트 생성 및 실행 */
  private async createAndRunTournament(): Promise<void> {
    const agents = [...this.stateStore.agents.values()].filter((a) => a.active);
    if (agents.length < 8) {
      logger.warn('활성 에이전트 부족 (최소 8명 필요)');
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
      message: `새 토너먼트 #${String(this.tournamentCounter)} 시작! 8명의 AI 에이전트가 참가합니다.`,
      timestamp: Date.now(),
      data: { tournamentId },
    });

    logger.info({ tournamentId, participants: participants.length }, '데모 토너먼트 생성');

    // 라운드별 실행
    try {
      await this.runTournamentRounds(tournamentId, participants);
    } catch (error) {
      logger.error(
        {
          tournamentId,
          error: error instanceof Error ? error.message : String(error),
        },
        '토너먼트 실행 오류',
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
        '라운드 시작',
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

        // 배팅 기간 (3초 대기)
        await this.delay(3000);

        // 매치 시작으로 상태 변경
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
          message: `${agentA?.name ?? '?'} vs ${agentB?.name ?? '?'} 매치 시작!`,
          timestamp: Date.now(),
          data: { matchId, tournamentId },
        });

        // 매치 실행 (순차: A → B → 비교)
        const result = await this.runMatch(
          matchId,
          pairing.agentA,
          pairing.agentB,
          variant,
          seed,
        );

        // 결과 적용
        match.scoreA = result.scoreA;
        match.scoreB = result.scoreB;
        match.winner = result.winner;
        match.status = 'completed';

        roundWinners.push(result.winner);

        // ELO 업데이트
        const loser = result.winner === pairing.agentA ? pairing.agentB : pairing.agentA;
        this.stateStore.updateElo(result.winner, loser);

        // 매치 결과 브로드캐스트
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
          message: `${winnerAgent?.name ?? '?'} 승리! (${String(result.scoreA)} vs ${String(result.scoreB)})`,
          timestamp: Date.now(),
          data: {
            matchId,
            winner: result.winner,
            scoreA: result.scoreA,
            scoreB: result.scoreB,
          },
        });

        // 매치 간 2초 대기
        await this.delay(2000);
      }

      currentParticipants = roundWinners;
      roundNumber++;
    }

    // 토너먼트 완료
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
          message: `토너먼트 #${String(this.tournamentCounter)} 완료! 우승: ${championAgent?.name ?? '?'}`,
          timestamp: Date.now(),
          data: { tournamentId, champion },
        });

        logger.info({ tournamentId, champion: championAgent?.name }, '토너먼트 완료');
      }
    }
  }

  /** 개별 매치 실행 (순차: A실행 → B실행 → 비교) */
  private async runMatch(
    matchId: string,
    agentA: string,
    agentB: string,
    variant: MazeVariant,
    seed: number,
  ): Promise<{ scoreA: number; scoreB: number; winner: string }> {
    const difficulty: DifficultyTier = 3;

    // Agent A 실행
    const scoreA = await this.runSingleAgent(`${matchId}:a`, variant, seed, difficulty);

    // Agent B 실행 (같은 미로, 같은 시드)
    const scoreB = await this.runSingleAgent(`${matchId}:b`, variant, seed, difficulty);

    return {
      scoreA,
      scoreB,
      winner: scoreA >= scoreB ? agentA : agentB,
    };
  }

  /** 단일 에이전트 게임 실행 및 완료 대기 */
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

      // 게임 오버 콜백 설정 (기존 콜백 보존)
      const originalCallback = this.gameLoopManager.getOnGameOver();

      this.gameLoopManager.setOnGameOver((sid: string, state: GameState) => {
        // 원래 콜백 호출
        originalCallback?.(sid, state);

        if (sid === fullSessionId) {
          // 콜백 복원
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

  /** 대기 유틸 */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
