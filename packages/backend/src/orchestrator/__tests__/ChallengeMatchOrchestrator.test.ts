/**
 * ChallengeMatchOrchestrator 유닛 테스트
 *
 * 검증 항목:
 * - 챌린지 생성 및 동시 한도 확인
 * - 에이전트 연결 및 카운트다운
 * - 배팅 창 오픈 및 잠금
 * - 게임 시작 및 액션 처리
 * - 에이전트 연결 해제 및 재연결
 * - 타임아웃 처리 (연결, 게임, 재연결)
 * - 게임 종료 및 승패 판정
 * - 배팅 정산
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChallengeMatchOrchestrator } from '../ChallengeMatchOrchestrator.js';
import type { GameState } from '@ghost-protocol/shared';

/** Mock GameLoopManager */
class MockGameLoopManager {
  private sessions: Map<string, { running: boolean; state: GameState }> = new Map();
  private gameOverCallback:
    | ((sessionId: string, state: GameState) => void)
    | null = null;

  createSession(config: {
    sessionId: string;
    sessionType: string;
    variant: string;
    seed: number;
    difficulty: number;
    agents: string[];
  }): void {
    this.sessions.set(config.sessionId, {
      running: false,
      state: {
        tick: 0,
        score: 0,
        lives: 3,
        round: 1,
        pacman: {
          x: 13.5,
          y: 23,
          direction: 'left',
          score: 0,
          lives: 3,
        },
        ghosts: [],
        maze: { width: 28, height: 31, walls: [], pellets: [], powerPellets: [] },
        powerActive: false,
        powerTimeRemaining: 0,
        fruitAvailable: null,
      },
    });
  }

  startSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.running = true;
    }
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.running = false;
    }
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  handleInput(_sessionId: string, _agentId: string, _direction: string): void {
    // no-op — 입력 처리 시뮬레이션
  }

  getSessionState(sessionId: string): GameState | null {
    return this.sessions.get(sessionId)?.state ?? null;
  }

  getOnGameOver(): ((sessionId: string, state: GameState) => void) | null {
    return this.gameOverCallback;
  }

  setOnGameOver(callback: ((sessionId: string, state: GameState) => void) | null): void {
    this.gameOverCallback = callback;
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, session]) => session.running)
      .map(([id]) => id);
  }

  shutdown(): void {
    this.sessions.clear();
  }

  // 테스트 헬퍼: 게임 오버 트리거
  triggerGameOver(sessionId: string, state: Partial<GameState>): void {
    const session = this.sessions.get(sessionId);
    if (session && this.gameOverCallback) {
      const fullState: GameState = { ...session.state, ...state };
      session.state = fullState; // 상태 업데이트
      this.gameOverCallback(sessionId, fullState);
    }
  }
}

/** Mock SocketManager */
class MockSocketManager {
  broadcastToLobby(_event: string, _data: Record<string, unknown>): void {
    // no-op
  }

  broadcastFeedItem(_item: {
    id: string;
    type: string;
    message: string;
    timestamp: number;
    data?: Record<string, unknown>;
  }): void {
    // no-op
  }
}

/** Mock BettingOrchestrator */
class MockBettingOrchestrator {
  openBettingWindow(
    _matchId: string,
    _agentA: string,
    _agentB: string,
    _windowSeconds: number,
  ): void {
    // no-op
  }

  lockBets(_matchId: string): Promise<void> {
    return Promise.resolve();
  }

  settleBets(_matchId: string, _winner: 'agentA' | 'agentB'): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): void {
    // no-op
  }
}

describe('ChallengeMatchOrchestrator', () => {
  let orchestrator: ChallengeMatchOrchestrator;
  let mockGameLoop: MockGameLoopManager;
  let mockSocket: MockSocketManager;
  let mockBetting: MockBettingOrchestrator | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGameLoop = new MockGameLoopManager();
    mockSocket = new MockSocketManager();
    mockBetting = undefined; // 기본값: 배팅 없음
  });

  afterEach(() => {
    orchestrator?.shutdown();
    vi.restoreAllMocks();
  });

  describe('createChallenge', () => {
    it('챌린지를 정상적으로 생성해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-1', 3, 'token-123');

      expect(challenge.id).toMatch(/^challenge-/);
      expect(challenge.agentId).toBe('agent-1');
      expect(challenge.difficulty).toBe(3);
      expect(challenge.status).toBe('waiting_agent');
      expect(challenge.sessionToken).toBe('token-123');
      expect(challenge.onChainMatchId).toBeGreaterThan(1000);
    });

    it('동시 활성 챌린지 한도(10개) 초과 시 에러를 발생시켜야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      // 10개 생성
      for (let i = 0; i < 10; i++) {
        orchestrator.createChallenge(`agent-${String(i)}`, 1, `token-${String(i)}`);
      }

      // 11번째 시도 → 에러
      expect(() => {
        orchestrator.createChallenge('agent-overflow', 1, 'token-overflow');
      }).toThrow('동시 활성 챌린지 한도 초과 (10)');
    });

    it('생성된 챌린지는 60초 후 만료되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-timeout', 2, 'token-timeout');
      expect(challenge.status).toBe('waiting_agent');

      // 59초 경과 → 아직 만료 안 됨
      vi.advanceTimersByTime(59_000);
      const stillActive = orchestrator.getMatch(challenge.id);
      expect(stillActive?.status).toBe('waiting_agent');

      // 1초 더 경과 → 만료
      vi.advanceTimersByTime(1_000);
      const expired = orchestrator.getMatch(challenge.id);
      expect(expired?.status).toBe('expired');
    });
  });

  describe('onAgentConnected', () => {
    it('에이전트가 연결되면 카운트다운 상태로 전환되어야 함 (배팅 없음)', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-connect', 1, 'token-connect');
      const success = orchestrator.onAgentConnected(challenge.id, 'socket-123');

      expect(success).toBe(true);

      const updated = orchestrator.getMatch(challenge.id);
      expect(updated?.status).toBe('countdown');
      expect(updated?.agentSocketId).toBe('socket-123');
    });

    it('에이전트가 연결되면 배팅 상태로 전환되어야 함 (배팅 있음)', () => {
      mockBetting = new MockBettingOrchestrator();
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
        mockBetting as any,
      );

      const openBettingSpy = vi.spyOn(mockBetting, 'openBettingWindow');

      const challenge = orchestrator.createChallenge('agent-bet', 2, 'token-bet');
      orchestrator.onAgentConnected(challenge.id, 'socket-456');

      const updated = orchestrator.getMatch(challenge.id);
      expect(updated?.status).toBe('betting');
      expect(openBettingSpy).toHaveBeenCalledWith(
        String(challenge.onChainMatchId),
        'agent-bet',
        expect.stringContaining('0x'),
        30,
      );
    });

    it('잘못된 matchId로 연결 시도 시 false를 반환해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const success = orchestrator.onAgentConnected('invalid-id', 'socket-999');
      expect(success).toBe(false);
    });

    it('이미 연결된 챌린지에 재연결 시도 시 false를 반환해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-double', 1, 'token-double');
      orchestrator.onAgentConnected(challenge.id, 'socket-first');

      // 이미 countdown 상태 → waiting_agent가 아니므로 false
      const success = orchestrator.onAgentConnected(challenge.id, 'socket-second');
      expect(success).toBe(false);
    });
  });

  describe('카운트다운 및 게임 시작', () => {
    it('카운트다운 3초 후 게임이 시작되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const createSessionSpy = vi.spyOn(mockGameLoop, 'createSession');
      const startSessionSpy = vi.spyOn(mockGameLoop, 'startSession');

      const challenge = orchestrator.createChallenge('agent-countdown', 3, 'token-countdown');
      orchestrator.onAgentConnected(challenge.id, 'socket-countdown');

      // 카운트다운: setInterval로 3, 2, 1, 0 브로드캐스트 → count < 0 시 startGame (총 4초)
      vi.advanceTimersByTime(4_000);

      expect(createSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: `match:${challenge.id}`,
          sessionType: 'match',
          difficulty: 3,
          agents: ['agent-countdown'],
        }),
      );
      expect(startSessionSpy).toHaveBeenCalledWith(`match:${challenge.id}`);

      const updated = orchestrator.getMatch(challenge.id);
      expect(updated?.status).toBe('active');
    });

    it('배팅 창이 30초 후 잠기고 카운트다운이 시작되어야 함', async () => {
      mockBetting = new MockBettingOrchestrator();
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
        mockBetting as any,
      );

      const lockBetsSpy = vi.spyOn(mockBetting, 'lockBets');

      const challenge = orchestrator.createChallenge('agent-bet-lock', 2, 'token-bet-lock');
      orchestrator.onAgentConnected(challenge.id, 'socket-bet-lock');

      expect(orchestrator.getMatch(challenge.id)?.status).toBe('betting');

      // 배팅 창 30초 경과
      vi.advanceTimersByTime(30_000);

      // Promise 처리를 위해 추가 tick
      await Promise.resolve();

      expect(lockBetsSpy).toHaveBeenCalledWith(String(challenge.onChainMatchId));

      const updated = orchestrator.getMatch(challenge.id);
      expect(updated?.status).toBe('countdown');

      // 카운트다운 4초 후 게임 시작 (setInterval로 4번 실행)
      vi.advanceTimersByTime(4_000);
      const started = orchestrator.getMatch(challenge.id);
      expect(started?.status).toBe('active');
    });
  });

  describe('handleAgentAction', () => {
    it('active 상태일 때만 입력을 처리해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const handleInputSpy = vi.spyOn(mockGameLoop, 'handleInput');

      const challenge = orchestrator.createChallenge('agent-action', 1, 'token-action');
      orchestrator.onAgentConnected(challenge.id, 'socket-action');

      // countdown 상태에서 입력 → 무시됨
      orchestrator.handleAgentAction(challenge.id, 'up');
      expect(handleInputSpy).not.toHaveBeenCalled();

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);

      // active 상태에서 입력 → 처리됨
      orchestrator.handleAgentAction(challenge.id, 'left');
      expect(handleInputSpy).toHaveBeenCalledWith(
        `match:${challenge.id}`,
        'agent-action',
        'left',
      );
    });
  });

  describe('onAgentDisconnected', () => {
    it('active 상태에서 연결 해제 시 재연결 타이머가 시작되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-disconnect', 1, 'token-disconnect');
      orchestrator.onAgentConnected(challenge.id, 'socket-disconnect');

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);
      expect(orchestrator.getMatch(challenge.id)?.status).toBe('active');

      // 연결 해제
      orchestrator.onAgentDisconnected('socket-disconnect');

      const updated = orchestrator.getMatch(challenge.id);
      expect(updated?.agentSocketId).toBeNull();

      // 9초 경과 → 아직 게임 유지
      vi.advanceTimersByTime(9_000);
      expect(orchestrator.getMatch(challenge.id)?.status).toBe('active');

      // 1초 더 경과 (총 10초) → 고스트 승리
      vi.advanceTimersByTime(1_000);
      const completed = orchestrator.getMatch(challenge.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.winner).toBe('ghost');
    });
  });

  describe('onAgentReconnected', () => {
    it('재연결 시 타이머가 취소되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-reconnect', 2, 'token-reconnect');
      orchestrator.onAgentConnected(challenge.id, 'socket-reconnect-1');

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);

      // 연결 해제
      orchestrator.onAgentDisconnected('socket-reconnect-1');

      // 5초 경과
      vi.advanceTimersByTime(5_000);

      // 재연결
      const success = orchestrator.onAgentReconnected(challenge.id, 'socket-reconnect-2');
      expect(success).toBe(true);

      const updated = orchestrator.getMatch(challenge.id);
      expect(updated?.agentSocketId).toBe('socket-reconnect-2');

      // 추가 5초 경과해도 게임 계속 (재연결 타이머 취소됨)
      vi.advanceTimersByTime(5_000);
      expect(orchestrator.getMatch(challenge.id)?.status).toBe('active');
    });
  });

  describe('게임 타임아웃', () => {
    it('게임 시작 5분 후 타임아웃으로 종료되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-timeout-game', 3, 'token-timeout-game');
      orchestrator.onAgentConnected(challenge.id, 'socket-timeout-game');

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);
      expect(orchestrator.getMatch(challenge.id)?.status).toBe('active');

      // 4분 59초 경과 → 아직 진행 중
      vi.advanceTimersByTime(299_000);
      expect(orchestrator.getMatch(challenge.id)?.status).toBe('active');

      // 1초 더 경과 (총 5분) → 타임아웃
      vi.advanceTimersByTime(1_000);
      const timedOut = orchestrator.getMatch(challenge.id);
      expect(timedOut?.status).toBe('completed');
      // 타임아웃 시 lives > 0이면 pacman 승리
      expect(timedOut?.winner).toBe('pacman');
    });
  });

  describe('게임 종료 콜백', () => {
    it('lives ≤ 0이면 고스트 승리로 판정되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-ghost-win', 2, 'token-ghost-win');
      orchestrator.onAgentConnected(challenge.id, 'socket-ghost-win');

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);

      // 게임 오버 트리거 (lives = 0)
      mockGameLoop.triggerGameOver(`match:${challenge.id}`, {
        lives: 0,
        score: 500,
      });

      const completed = orchestrator.getMatch(challenge.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.winner).toBe('ghost');
      expect(completed?.score).toBe(500);
    });

    it('lives > 0이면 팩맨 승리로 판정되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-pacman-win', 3, 'token-pacman-win');
      orchestrator.onAgentConnected(challenge.id, 'socket-pacman-win');

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);

      // 게임 오버 트리거 (lives = 2)
      mockGameLoop.triggerGameOver(`match:${challenge.id}`, {
        lives: 2,
        score: 1200,
      });

      const completed = orchestrator.getMatch(challenge.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.winner).toBe('pacman');
      expect(completed?.score).toBe(1200);
    });
  });

  describe('배팅 정산', () => {
    it('팩맨 승리 시 agentA로 배팅 정산되어야 함', async () => {
      mockBetting = new MockBettingOrchestrator();
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
        mockBetting as any,
      );

      const settleBetsSpy = vi.spyOn(mockBetting, 'settleBets');

      const challenge = orchestrator.createChallenge('agent-settle-pacman', 1, 'token-settle-pacman');
      orchestrator.onAgentConnected(challenge.id, 'socket-settle-pacman');

      // 배팅 창 30초 (async lockBets 포함)
      await vi.advanceTimersByTimeAsync(30_000);
      // 카운트다운 4초
      await vi.advanceTimersByTimeAsync(4_000);

      // 팩맨 승리
      mockGameLoop.triggerGameOver(`match:${challenge.id}`, {
        lives: 3,
        score: 2000,
      });

      // settleMatchBets async 플러시
      await vi.advanceTimersByTimeAsync(0);

      expect(settleBetsSpy).toHaveBeenCalledWith(
        String(challenge.onChainMatchId),
        'agentA',
      );
    });

    it('고스트 승리 시 agentB로 배팅 정산되어야 함', async () => {
      mockBetting = new MockBettingOrchestrator();
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
        mockBetting as any,
      );

      const settleBetsSpy = vi.spyOn(mockBetting, 'settleBets');

      const challenge = orchestrator.createChallenge('agent-settle-ghost', 2, 'token-settle-ghost');
      orchestrator.onAgentConnected(challenge.id, 'socket-settle-ghost');

      // 배팅 창 30초 (async lockBets 포함)
      await vi.advanceTimersByTimeAsync(30_000);
      // 카운트다운 4초
      await vi.advanceTimersByTimeAsync(4_000);

      // 고스트 승리 (lives = 0)
      mockGameLoop.triggerGameOver(`match:${challenge.id}`, {
        lives: 0,
        score: 800,
      });

      // settleMatchBets async 플러시
      await vi.advanceTimersByTimeAsync(0);

      expect(settleBetsSpy).toHaveBeenCalledWith(
        String(challenge.onChainMatchId),
        'agentB',
      );
    });
  });

  describe('getActiveMatches / getMatch', () => {
    it('활성 챌린지 목록을 반환해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      orchestrator.createChallenge('agent-list-1', 1, 'token-list-1');
      orchestrator.createChallenge('agent-list-2', 2, 'token-list-2');

      const matches = orchestrator.getActiveMatches();
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.agentId)).toContain('agent-list-1');
      expect(matches.map((m) => m.agentId)).toContain('agent-list-2');
    });

    it('특정 챌린지를 조회할 수 있어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-get', 3, 'token-get');
      const retrieved = orchestrator.getMatch(challenge.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.agentId).toBe('agent-get');
      expect(retrieved?.difficulty).toBe(3);
    });

    it('존재하지 않는 챌린지 조회 시 null을 반환해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const result = orchestrator.getMatch('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('모든 활성 챌린지를 정리해야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const c1 = orchestrator.createChallenge('agent-shutdown-1', 1, 'token-shutdown-1');
      const c2 = orchestrator.createChallenge('agent-shutdown-2', 2, 'token-shutdown-2');

      orchestrator.onAgentConnected(c1.id, 'socket-shutdown-1');
      orchestrator.onAgentConnected(c2.id, 'socket-shutdown-2');

      // 게임 시작 (카운트다운 4초)
      vi.advanceTimersByTime(4_000);

      expect(orchestrator.getActiveMatches()).toHaveLength(2);

      orchestrator.shutdown();

      // shutdown 후에도 matches Map은 유지되지만 타이머는 정리됨
      // (ArenaManager와 달리 ChallengeMatchOrchestrator는 shutdown 시 matches를 clear함)
      expect(orchestrator.getActiveMatches()).toHaveLength(0);
    });

    it('shutdown 시 모든 타이머가 정리되어야 함', () => {
      orchestrator = new ChallengeMatchOrchestrator(
        mockGameLoop as any,
        mockSocket as any,
      );

      const challenge = orchestrator.createChallenge('agent-timer-cleanup', 1, 'token-timer-cleanup');
      orchestrator.shutdown();

      // 타이머가 정리되었으므로 60초 후에도 만료되지 않음
      vi.advanceTimersByTime(60_000);

      // shutdown으로 matches가 clear되었으므로 null 반환
      const result = orchestrator.getMatch(challenge.id);
      expect(result).toBeNull();
    });
  });
});
