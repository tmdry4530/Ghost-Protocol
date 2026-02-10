/**
 * Challenge API 엔드포인트 단위 테스트
 * POST /api/v1/challenge, GET /api/v1/challenge, GET /api/v1/challenge/:matchId
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { createApiRouter, ApiStateStore } from '../api.js';
import type { GameLoopManager } from '../../game/GameLoopManager.js';
import type { ChallengeMatchOrchestrator } from '../../orchestrator/ChallengeMatchOrchestrator.js';
import type { DifficultyTier } from '@ghost-protocol/shared';

/** 챌린지 매치 정보 인터페이스 */
interface ChallengeMatchInfo {
  id: string;
  agentId: string;
  sessionToken: string;
  difficulty: DifficultyTier;
  status: 'waiting_agent' | 'active' | 'completed';
  sessionId: string;
  onChainMatchId: number;
  createdAt: number;
  agentSocketId: string | null;
  score: number;
  winner: 'agent' | 'ghosts' | null;
}

/** Mock GameLoopManager */
class MockGameLoopManager implements Pick<GameLoopManager, 'getActiveSessions'> {
  getActiveSessions(): string[] {
    return [];
  }
}

/** Mock ChallengeMatchOrchestrator */
class MockChallengeMatchOrchestrator {
  private matches: Map<string, ChallengeMatchInfo> = new Map();
  private shouldThrowOnCreate = false;

  /** 챌린지 생성 */
  createChallenge(agentId: string, difficulty: DifficultyTier, sessionToken: string): ChallengeMatchInfo {
    if (this.shouldThrowOnCreate) {
      throw new Error('챌린지 생성 중 오류 발생');
    }

    const challenge: ChallengeMatchInfo = {
      id: `challenge-test-${Date.now()}`,
      agentId,
      sessionToken,
      difficulty,
      status: 'waiting_agent',
      sessionId: `match:challenge-${agentId}`,
      onChainMatchId: 1001,
      createdAt: Date.now(),
      agentSocketId: null,
      score: 0,
      winner: null,
    };

    this.matches.set(challenge.id, challenge);
    return challenge;
  }

  /** 활성 매치 목록 반환 */
  getActiveMatches(): ChallengeMatchInfo[] {
    return Array.from(this.matches.values());
  }

  /** 특정 매치 조회 */
  getMatch(matchId: string): ChallengeMatchInfo | undefined {
    return this.matches.get(matchId);
  }

  /** 테스트 헬퍼: 에러 발생 설정 */
  setShouldThrowOnCreate(shouldThrow: boolean): void {
    this.shouldThrowOnCreate = shouldThrow;
  }

  /** 테스트 헬퍼: 매치 초기화 */
  reset(): void {
    this.matches.clear();
    this.shouldThrowOnCreate = false;
  }
}

describe('Challenge API', () => {
  let app: Express;
  let mockGameLoopManager: MockGameLoopManager;
  let mockChallengeOrchestrator: MockChallengeMatchOrchestrator;
  let stateStore: ApiStateStore;

  beforeEach(() => {
    // Mock 인스턴스 생성
    mockGameLoopManager = new MockGameLoopManager();
    mockChallengeOrchestrator = new MockChallengeMatchOrchestrator();
    stateStore = new ApiStateStore();

    // Express 앱 설정
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1',
      createApiRouter(
        mockGameLoopManager as unknown as GameLoopManager,
        stateStore,
        mockChallengeOrchestrator as unknown as ChallengeMatchOrchestrator,
      ),
    );

    // 각 테스트 전 초기화
    mockChallengeOrchestrator.reset();
  });

  describe('POST /api/v1/challenge', () => {
    it('정상 생성 시 201과 challenge 객체를 반환한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token-123',
          difficulty: 3,
          agentId: 'agent-test-001',
        })
        .expect(201);

      expect(response.body).toHaveProperty('challenge');
      expect(response.body.challenge).toMatchObject({
        agentId: 'agent-test-001',
        sessionToken: 'test-token-123',
        difficulty: 3,
        status: 'waiting_agent',
        score: 0,
        winner: null,
      });
      expect(response.body.challenge.id).toMatch(/^challenge-test-/);
    });

    it('agentId가 없으면 자동 생성한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token-456',
          difficulty: 2,
        })
        .expect(201);

      expect(response.body.challenge.agentId).toMatch(/^agent-/);
    });

    it('difficulty가 없으면 기본값 3을 사용한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token-789',
        })
        .expect(201);

      expect(response.body.challenge.difficulty).toBe(3);
    });

    it('sessionToken이 없으면 400 에러를 반환한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({ difficulty: 3 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('sessionToken이 필요합니다');
    });

    it('sessionToken이 빈 문자열이면 400 에러를 반환한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({ sessionToken: '', difficulty: 3 })
        .expect(400);

      expect(response.body.error).toBe('sessionToken이 필요합니다');
    });

    it('difficulty가 1 미만이면 400 에러를 반환한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token',
          difficulty: 0,
        })
        .expect(400);

      expect(response.body.error).toBe('difficulty는 1~5 사이의 정수여야 합니다');
    });

    it('difficulty가 5 초과이면 400 에러를 반환한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token',
          difficulty: 6,
        })
        .expect(400);

      expect(response.body.error).toBe('difficulty는 1~5 사이의 정수여야 합니다');
    });

    it('difficulty가 정수가 아니면 400 에러를 반환한다', async () => {
      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token',
          difficulty: 2.5,
        })
        .expect(400);

      expect(response.body.error).toBe('difficulty는 1~5 사이의 정수여야 합니다');
    });

    it('challengeOrchestrator가 없으면 503 에러를 반환한다', async () => {
      // challengeOrchestrator 없이 새 앱 생성
      const appWithoutOrchestrator = express();
      appWithoutOrchestrator.use(express.json());
      appWithoutOrchestrator.use(
        '/api/v1',
        createApiRouter(
          mockGameLoopManager as unknown as GameLoopManager,
          stateStore,
          undefined, // challengeOrchestrator 없음
        ),
      );

      const response = await request(appWithoutOrchestrator)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token',
          difficulty: 3,
        })
        .expect(503);

      expect(response.body.error).toBe('챌린지 시스템이 초기화되지 않았습니다');
    });

    it('createChallenge에서 에러 발생 시 400 에러를 반환한다', async () => {
      mockChallengeOrchestrator.setShouldThrowOnCreate(true);

      const response = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token',
          difficulty: 3,
        })
        .expect(400);

      expect(response.body.error).toBe('챌린지 생성 중 오류 발생');
    });
  });

  describe('GET /api/v1/challenge', () => {
    it('활성 챌린지 목록을 반환한다', async () => {
      // 챌린지 2개 생성
      await request(app)
        .post('/api/v1/challenge')
        .send({ sessionToken: 'token-1', difficulty: 2 });

      await request(app)
        .post('/api/v1/challenge')
        .send({ sessionToken: 'token-2', difficulty: 4 });

      const response = await request(app).get('/api/v1/challenge').expect(200);

      expect(response.body).toHaveProperty('challenges');
      expect(response.body.challenges).toHaveLength(2);
      expect(response.body.challenges[0]).toHaveProperty('id');
      expect(response.body.challenges[0]).toHaveProperty('status');
    });

    it('활성 챌린지가 없으면 빈 배열을 반환한다', async () => {
      const response = await request(app).get('/api/v1/challenge').expect(200);

      expect(response.body.challenges).toEqual([]);
    });

    it('challengeOrchestrator가 없으면 빈 배열을 반환한다', async () => {
      const appWithoutOrchestrator = express();
      appWithoutOrchestrator.use(express.json());
      appWithoutOrchestrator.use(
        '/api/v1',
        createApiRouter(
          mockGameLoopManager as unknown as GameLoopManager,
          stateStore,
          undefined,
        ),
      );

      const response = await request(appWithoutOrchestrator)
        .get('/api/v1/challenge')
        .expect(200);

      expect(response.body.challenges).toEqual([]);
    });
  });

  describe('GET /api/v1/challenge/:matchId', () => {
    it('존재하는 매치 상세 정보를 반환한다', async () => {
      // 챌린지 생성
      const createResponse = await request(app)
        .post('/api/v1/challenge')
        .send({
          sessionToken: 'test-token',
          difficulty: 3,
          agentId: 'agent-detail-test',
        })
        .expect(201);

      const matchId = createResponse.body.challenge.id as string;

      // 상세 조회
      const response = await request(app)
        .get(`/api/v1/challenge/${matchId}`)
        .expect(200);

      expect(response.body).toHaveProperty('challenge');
      expect(response.body.challenge.id).toBe(matchId);
      expect(response.body.challenge.agentId).toBe('agent-detail-test');
      expect(response.body.challenge.difficulty).toBe(3);
    });

    it('존재하지 않는 매치 조회 시 404 에러를 반환한다', async () => {
      const response = await request(app)
        .get('/api/v1/challenge/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('챌린지를 찾을 수 없습니다');
    });

    it('challengeOrchestrator가 없으면 503 에러를 반환한다', async () => {
      const appWithoutOrchestrator = express();
      appWithoutOrchestrator.use(express.json());
      appWithoutOrchestrator.use(
        '/api/v1',
        createApiRouter(
          mockGameLoopManager as unknown as GameLoopManager,
          stateStore,
          undefined,
        ),
      );

      const response = await request(appWithoutOrchestrator)
        .get('/api/v1/challenge/some-id')
        .expect(503);

      expect(response.body.error).toBe('챌린지 시스템이 초기화되지 않았습니다');
    });
  });
});
