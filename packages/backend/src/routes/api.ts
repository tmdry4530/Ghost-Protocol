/**
 * Ghost Protocol REST API v1 라우터
 * 토너먼트, 매치, 리더보드, 에이전트 엔드포인트 제공
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { GameLoopManager } from '../game/GameLoopManager.js';
import type { ChallengeMatchOrchestrator } from '../orchestrator/ChallengeMatchOrchestrator.js';
import type { DifficultyTier } from '@ghost-protocol/shared';
import pino from 'pino';

const logger = pino({ name: 'api-router' });

/** 에이전트 등록 정보 (인메모리) */
export interface RegisteredAgent {
  address: string;
  name: string;
  owner: string;
  wins: number;
  losses: number;
  totalScore: number;
  elo: number;
  reputation: number;
  active: boolean;
  registeredAt: number;
}

/** 토너먼트 데이터 (인메모리) */
export interface TournamentData {
  id: string;
  participants: string[];
  bracketSize: 8 | 16;
  status: 'upcoming' | 'active' | 'completed';
  currentRound: number;
  matches: MatchData[];
  champion: string | null;
  prizePool: string;
  createdAt: number;
}

/** 매치 데이터 (인메모리) */
export interface MatchData {
  id: string;
  tournamentId: string;
  round: number;
  agentA: string;
  agentB: string;
  scoreA: number;
  scoreB: number;
  winner: string | null;
  status: 'pending' | 'betting' | 'active' | 'completed';
  createdAt: number;
}

/** API 상태 저장소 */
export class ApiStateStore {
  readonly agents: Map<string, RegisteredAgent> = new Map();
  readonly tournaments: Map<string, TournamentData> = new Map();
  readonly matches: Map<string, MatchData> = new Map();
  readonly leaderboard: RegisteredAgent[] = [];

  /** ELO 레이팅 업데이트 */
  updateElo(winnerAddr: string, loserAddr: string): void {
    const winner = this.agents.get(winnerAddr);
    const loser = this.agents.get(loserAddr);
    if (!winner || !loser) return;

    const K = 32;
    const expectedWin = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
    const expectedLose = 1 - expectedWin;

    winner.elo = Math.round(winner.elo + K * (1 - expectedWin));
    loser.elo = Math.round(loser.elo + K * (0 - expectedLose));
    winner.wins++;
    loser.losses++;
    winner.reputation = Math.min(100, winner.reputation + 2);
    loser.reputation = Math.max(0, loser.reputation - 1);

    this.refreshLeaderboard();
  }

  /** 리더보드 갱신 (ELO 내림차순) */
  refreshLeaderboard(): void {
    this.leaderboard.length = 0;
    const sorted = [...this.agents.values()]
      .filter((a) => a.active)
      .sort((a, b) => b.elo - a.elo);
    this.leaderboard.push(...sorted);
  }

  /** 데모 에이전트 등록 */
  registerDemoAgents(): void {
    const demoAgents = [
      { name: 'AlphaGhost', strategy: 'aggressive' },
      { name: 'BetaHunter', strategy: 'balanced' },
      { name: 'GammaTracker', strategy: 'defensive' },
      { name: 'DeltaStalker', strategy: 'greedy' },
      { name: 'EpsilonWraith', strategy: 'llm' },
      { name: 'ZetaPhantom', strategy: 'safety' },
      { name: 'EtaSpectre', strategy: 'aggressive' },
      { name: 'ThetaShadow', strategy: 'balanced' },
    ];

    for (let i = 0; i < demoAgents.length; i++) {
      const agent = demoAgents[i];
      if (!agent) continue;
      const address = `0x${String(i + 1).padStart(40, '0')}`;
      this.agents.set(address, {
        address,
        name: agent.name,
        owner: `0x${'owner'.padStart(40, '0')}`,
        wins: Math.floor(Math.random() * 20),
        losses: Math.floor(Math.random() * 15),
        totalScore: Math.floor(Math.random() * 50000),
        elo: 1200 + Math.floor(Math.random() * 400),
        reputation: 50 + Math.floor(Math.random() * 50),
        active: true,
        registeredAt: Date.now(),
      });
    }

    this.refreshLeaderboard();
    logger.info({ count: this.agents.size }, 'Demo agents registered');
  }
}

/**
 * API 라우터 생성
 * @param gameLoopManager 게임 루프 매니저
 * @param stateStore API 상태 저장소
 * @param challengeOrchestrator 챌린지 매치 오케스트레이터 (선택사항)
 */
export function createApiRouter(
  gameLoopManager: GameLoopManager,
  stateStore: ApiStateStore,
  challengeOrchestrator?: ChallengeMatchOrchestrator,
): Router {
  const router = Router();

  // === 토너먼트 API ===

  /** 토너먼트 목록 조회 */
  router.get('/tournaments', (_req: Request, res: Response) => {
    const tournaments = [...stateStore.tournaments.values()].map((t) => ({
      id: t.id,
      participants: t.participants,
      bracketSize: t.bracketSize,
      status: t.status,
      currentRound: t.currentRound,
      matchCount: t.matches.length,
      champion: t.champion,
      prizePool: t.prizePool,
      createdAt: t.createdAt,
    }));
    res.json({ tournaments });
  });

  /** 특정 토너먼트 상세 조회 */
  router.get('/tournaments/:id', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const tournament = stateStore.tournaments.get(id);
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    res.json({ tournament });
  });

  // === 매치 API ===

  /** 매치 목록 조회 */
  router.get('/matches', (_req: Request, res: Response) => {
    const matches = [...stateStore.matches.values()];
    res.json({ matches });
  });

  /** 특정 매치 상세 조회 */
  router.get('/matches/:id', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const match = stateStore.matches.get(id);
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }
    res.json({ match });
  });

  // === 에이전트 API ===

  /** 에이전트 목록 조회 */
  router.get('/agents', (_req: Request, res: Response) => {
    const agents = [...stateStore.agents.values()];
    res.json({ agents });
  });

  /** 특정 에이전트 상세 조회 */
  router.get('/agents/:address', (req: Request, res: Response) => {
    const address = String(req.params['address'] ?? '');
    const agent = stateStore.agents.get(address);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agent });
  });

  // === 리더보드 API ===

  /** 에이전트 리더보드 (ELO 내림차순) */
  router.get('/leaderboard', (req: Request, res: Response) => {
    const limitParam = Number(req.query['limit']);
    const limit = Math.min(Number.isFinite(limitParam) ? limitParam : 20, 100);
    res.json({
      leaderboard: stateStore.leaderboard.slice(0, limit).map((a, idx) => ({
        rank: idx + 1,
        address: a.address,
        name: a.name,
        elo: a.elo,
        wins: a.wins,
        losses: a.losses,
        winRate:
          a.wins + a.losses > 0
            ? ((a.wins / (a.wins + a.losses)) * 100).toFixed(1)
            : '0.0',
        totalScore: a.totalScore,
        reputation: a.reputation,
      })),
    });
  });

  // === 세션 API ===

  /** 활성 게임 세션 조회 */
  router.get('/sessions', (_req: Request, res: Response) => {
    res.json({
      sessions: gameLoopManager.getActiveSessions(),
    });
  });

  /** 서바이벌 세션 생성 */
  router.post('/survival', (_req: Request, res: Response) => {
    const sessionId = `surv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const seed = Math.floor(Math.random() * 0xffffffff);

    gameLoopManager.createSession({
      sessionId: `survival:${sessionId}`,
      sessionType: 'survival',
      variant: 'classic',
      seed,
      difficulty: 1,
      agents: ['player'],
    });

    gameLoopManager.startSession(`survival:${sessionId}`);

    res.status(201).json({
      sessionId,
      roomId: `survival:${sessionId}`,
      seed,
    });
  });

  // === 상태 확인 ===

  /** API 상태 요약 */
  router.get('/stats', (_req: Request, res: Response) => {
    res.json({
      activeSessions: gameLoopManager.getActiveSessions().length,
      totalAgents: stateStore.agents.size,
      activeTournaments: [...stateStore.tournaments.values()].filter(
        (t) => t.status === 'active',
      ).length,
      totalMatches: stateStore.matches.size,
    });
  });

  // === 챌린지 매치 API ===

  /** 챌린지 생성 */
  router.post('/challenge', (req: Request, res: Response) => {
    if (!challengeOrchestrator) {
      res.status(503).json({ error: 'Challenge system not initialized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const sessionToken = body['sessionToken'];
    const difficultyRaw = body['difficulty'];
    const agentId = body['agentId'];

    if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
      res.status(400).json({ error: 'sessionToken is required' });
      return;
    }

    // Validate difficulty (1~5)
    const difficulty = typeof difficultyRaw === 'number' ? difficultyRaw : 3;
    if (difficulty < 1 || difficulty > 5 || !Number.isInteger(difficulty)) {
      res.status(400).json({ error: 'difficulty must be an integer between 1 and 5' });
      return;
    }

    const finalAgentId = typeof agentId === 'string' && agentId.length > 0
      ? agentId
      : `agent-${Date.now().toString(36)}`;

    try {
      const challenge = challengeOrchestrator.createChallenge(
        finalAgentId,
        difficulty as DifficultyTier,
        sessionToken,
      );
      res.status(201).json({ challenge });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Challenge creation failed';
      logger.error({ error: message }, 'Challenge creation error');
      res.status(400).json({ error: message });
    }
  });

  /** 활성 챌린지 목록 조회 */
  router.get('/challenge', (_req: Request, res: Response) => {
    if (!challengeOrchestrator) {
      res.json({ challenges: [] });
      return;
    }
    const challenges = challengeOrchestrator.getActiveMatches();
    res.json({ challenges });
  });

  /** Challenge detail query */
  router.get('/challenge/:matchId', (req: Request, res: Response) => {
    if (!challengeOrchestrator) {
      res.status(503).json({ error: 'Challenge system not initialized' });
      return;
    }

    const matchId = String(req.params['matchId'] ?? '');
    const challenge = challengeOrchestrator.getMatch(matchId);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }
    res.json({ challenge });
  });

  return router;
}
