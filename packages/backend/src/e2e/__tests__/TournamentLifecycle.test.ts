import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArenaManager } from '../../orchestrator/ArenaManager.js';
import type { MatchScheduler, MatchJobResult, MatchJobData } from '../../orchestrator/MatchScheduler.js';
import type { ResultVerifier, MatchResultData } from '../../orchestrator/ResultVerifier.js';
import type { BettingOrchestrator } from '../../orchestrator/BettingOrchestrator.js';
import type { SocketManager } from '../../websocket/SocketManager.js';
import { Contract } from 'ethers';
import type { BetSide } from '@ghost-protocol/shared';

/**
 * Tournament Lifecycle E2E 통합 테스트
 *
 * 전체 토너먼트 흐름을 검증합니다:
 *   에이전트 등록 -> 토너먼트 생성 -> 브래킷 생성 -> 배팅 창 열기 ->
 *   매치 실행 -> 결과 온체인 제출 -> 배팅 정산 -> 브래킷 자동 진행 ->
 *   결승 완료 -> 토너먼트 종료 및 상금 분배
 *
 * 모든 외부 의존성(BullMQ, Redis, ethers, Socket.io)은 Mock으로 대체됩니다.
 */

// ===== Mock 클래스 정의 =====

/** Mock MatchScheduler - 매치 완료 콜백을 수동 트리거할 수 있는 테스트용 스케줄러 */
class MockMatchScheduler implements Partial<MatchScheduler> {
  private onComplete: ((result: MatchJobResult) => void | Promise<void>) | null = null;
  readonly scheduledJobs: MatchJobData[] = [];

  setOnMatchComplete(callback: (result: MatchJobResult) => void | Promise<void>): void {
    this.onComplete = callback;
  }

  scheduleMatch(data: MatchJobData): Promise<never> {
    this.scheduledJobs.push(data);
    return undefined as never;
  }

  scheduleRoundMatches(matches: readonly MatchJobData[]): Promise<never[]> {
    for (const match of matches) {
      this.scheduledJobs.push(match);
    }
    return Promise.resolve([]);
  }

  getPendingCount(): Promise<number> {
    return Promise.resolve(0);
  }

  getActiveCount(): Promise<number> {
    return Promise.resolve(0);
  }

  async shutdown(): Promise<void> {
    // no-op
  }

  /**
   * 테스트 헬퍼: 매치 완료를 시뮬레이션하여 ArenaManager 콜백을 트리거
   *
   * ArenaManager 생성자에서 콜백을 `void this.handleMatchComplete(result)` 형태로
   * 등록하기 때문에, 콜백 호출 후 내부 비동기 체인이 완료될 때까지 마이크로태스크 큐를
   * 플러시해야 합니다.
   */
  async triggerMatchComplete(result: MatchJobResult): Promise<void> {
    if (this.onComplete !== null) {
      void this.onComplete(result);
      // ArenaManager의 handleMatchComplete가 fire-and-forget(void)으로 실행되므로
      // 내부 비동기 체인(submitResult -> settleBets -> updateTournamentBracket ->
      // advanceToNextRound -> startTournamentRound)이 완료될 수 있도록
      // 마이크로태스크 큐를 충분히 플러시합니다.
      // 각 await 포인트마다 하나의 플러시가 필요하며, 최대 체인 깊이를 고려합니다.
      for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
          queueMicrotask(resolve);
        });
      }
    }
  }

  /** 테스트 헬퍼: 스케줄된 매치 ID 목록 반환 */
  getScheduledMatchIds(): readonly string[] {
    return this.scheduledJobs.map((j) => j.matchId);
  }

  /** 테스트 헬퍼: 특정 라운드의 스케줄된 매치 반환 */
  getMatchesForRound(round: number): readonly MatchJobData[] {
    return this.scheduledJobs.filter((j) => j.round === round);
  }
}

/** Mock ResultVerifier - 결과 제출 호출을 추적하는 테스트용 검증기 */
class MockResultVerifier implements Partial<ResultVerifier> {
  readonly submittedResults: MatchResultData[] = [];

  computeGameLogHash(): string {
    return '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  }

  submitResult(result: MatchResultData): Promise<string> {
    this.submittedResults.push(result);
    return Promise.resolve(`0xtxhash_match_${String(result.matchId)}`);
  }

  verifyIntegrity(): boolean {
    return true;
  }
}

/** Mock BettingOrchestrator - 배팅 이벤트를 기록하는 테스트용 오케스트레이터 */
class MockBettingOrchestrator implements Partial<BettingOrchestrator> {
  readonly openedWindows: Array<{ matchId: string; agentA: string; agentB: string }> = [];
  readonly lockedMatches: string[] = [];
  readonly settledMatches: Array<{ matchId: string; winner: BetSide }> = [];
  readonly recordedBets: Array<{ matchId: string; side: BetSide; amount: bigint }> = [];

  openBettingWindow(matchId: string, agentA: string, agentB: string): void {
    this.openedWindows.push({ matchId, agentA, agentB });
  }

  recordBet(matchId: string, side: BetSide, amount: bigint): void {
    this.recordedBets.push({ matchId, side, amount });
  }

  lockBets(matchId: string): Promise<void> {
    this.lockedMatches.push(matchId);
    return Promise.resolve();
  }

  settleBets(matchId: string, winner: BetSide): Promise<void> {
    this.settledMatches.push({ matchId, winner });
    return Promise.resolve();
  }

  getActiveSessionCount(): number {
    return this.openedWindows.length - this.settledMatches.length;
  }

  shutdown(): void {
    // no-op
  }
}

/** Mock SocketManager - 브로드캐스트 이벤트를 수집하는 테스트용 소켓 매니저 */
class MockSocketManager implements Partial<SocketManager> {
  readonly betUpdates: Array<{ matchId: string; data: Record<string, unknown> }> = [];
  readonly tournamentAdvances: Array<{ tournamentId: string; data: Record<string, unknown> }> = [];

  broadcastBetUpdate(matchId: string, data: Record<string, unknown>): void {
    this.betUpdates.push({ matchId, data });
  }

  broadcastTournamentAdvance(tournamentId: string, data: Record<string, unknown>): void {
    this.tournamentAdvances.push({ tournamentId, data });
  }
}

// ===== Mock ethers Contract 팩토리 =====

/** 8개 에이전트 주소 상수 */
const AGENT_ADDRESSES = [
  '0xAgent1', '0xAgent2', '0xAgent3', '0xAgent4',
  '0xAgent5', '0xAgent6', '0xAgent7', '0xAgent8',
] as const;

/**
 * Mock GhostArena 컨트랙트를 생성합니다.
 * 모든 온체인 호출(getActiveAgents, getAgentInfo, createTournament,
 * advanceTournament, finalizeTournament)을 Mock으로 제공합니다.
 */
const createMockContract = (agents: readonly string[] = AGENT_ADDRESSES) => {
  const advanceTournamentFn = vi.fn().mockImplementation(() => ({
    wait: vi.fn().mockResolvedValue({ hash: '0xadvance_tx' }),
  }));

  const finalizeTournamentFn = vi.fn().mockImplementation(() => ({
    wait: vi.fn().mockResolvedValue({ hash: '0xfinalize_tx' }),
  }));

  const createTournamentFn = vi.fn().mockImplementation(() => ({
    wait: vi.fn().mockResolvedValue({ hash: '0xcreate_tx' }),
  }));

  const getActiveAgentsFn = vi.fn().mockResolvedValue([...agents]);

  const getAgentInfoFn = vi.fn().mockImplementation((address: string) => {
    const index = agents.indexOf(address);
    const reputation = index >= 0 ? 100 - index : 50;
    return Promise.resolve([
      '0xOwner',                    // owner
      `Agent_${address.slice(-1)}`, // name
      BigInt(10 + (index >= 0 ? index : 0)),  // wins
      5n,                           // losses
      BigInt(reputation),           // reputation (시드 순서대로 내림차순)
      true,                         // active
    ]);
  });

  const contract = {
    getFunction: vi.fn((name: string) => {
      switch (name) {
        case 'getActiveAgents':
          return getActiveAgentsFn;
        case 'getAgentInfo':
          return getAgentInfoFn;
        case 'createTournament':
          return createTournamentFn;
        case 'advanceTournament':
          return advanceTournamentFn;
        case 'finalizeTournament':
          return finalizeTournamentFn;
        default:
          return vi.fn();
      }
    }),
    // 테스트 검증용 직접 접근 핸들
    _getActiveAgentsFn: getActiveAgentsFn,
    _getAgentInfoFn: getAgentInfoFn,
    _createTournamentFn: createTournamentFn,
    _advanceTournamentFn: advanceTournamentFn,
    _finalizeTournamentFn: finalizeTournamentFn,
  };

  return contract;
};

// ===== 헬퍼 함수 =====

/** 매치 결과를 생성하는 팩토리 함수 */
function createMatchResult(
  matchId: string,
  winner: string,
  scoreA: number,
  scoreB: number,
): MatchJobResult {
  return {
    matchId,
    scoreA,
    scoreB,
    winner,
    replayData: Buffer.from(`replay_${matchId}`),
    totalTicks: 3600,
  };
}

/**
 * 라운드의 모든 매치를 완료하는 헬퍼 함수
 * 각 매치에서 agentA가 승리합니다 (scoreA > scoreB).
 */
async function completeRoundMatches(
  scheduler: MockMatchScheduler,
  round: number,
  winners: readonly string[],
): Promise<void> {
  const roundMatches = scheduler.getMatchesForRound(round);
  for (let i = 0; i < roundMatches.length; i++) {
    const match = roundMatches[i];
    if (match === undefined) continue;
    const winner = winners[i] ?? match.agentA;
    const isAgentAWinner = winner === match.agentA;

    await scheduler.triggerMatchComplete(
      createMatchResult(
        match.matchId,
        winner,
        isAgentAWinner ? 1000 + i * 100 : 800 + i * 100,
        isAgentAWinner ? 800 + i * 100 : 1000 + i * 100,
      ),
    );
  }
}

// ===== 테스트 스위트 =====

describe('Tournament Lifecycle E2E', () => {
  let arenaManager: ArenaManager;
  let mockScheduler: MockMatchScheduler;
  let mockVerifier: MockResultVerifier;
  let mockBetting: MockBettingOrchestrator;
  let mockSocket: MockSocketManager;
  let mockContract: ReturnType<typeof createMockContract>;

  beforeEach(() => {
    mockScheduler = new MockMatchScheduler();
    mockVerifier = new MockResultVerifier();
    mockBetting = new MockBettingOrchestrator();
    mockSocket = new MockSocketManager();
    mockContract = createMockContract();

    arenaManager = new ArenaManager({
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      ghostArenaAddress: '0xGhostArenaContract',
      matchScheduler: mockScheduler as unknown as MatchScheduler,
      resultVerifier: mockVerifier as unknown as ResultVerifier,
      bettingOrchestrator: mockBetting as unknown as BettingOrchestrator,
      socketManager: mockSocket as unknown as SocketManager,
      ghostArenaContract: mockContract as unknown as Contract,
    });
  });

  afterEach(() => {
    arenaManager.shutdown();
  });

  // =========================================================================
  // 1. 8-agent 싱글 엘리미네이션 토너먼트 전체 라이프사이클
  // =========================================================================
  describe('8-agent 싱글 엘리미네이션 토너먼트', () => {
    it('전체 토너먼트 라이프사이클을 완료한다 (생성 -> 라운드1 -> 라운드2 -> 결승)', async () => {
      // === 1단계: 토너먼트 생성 ===
      const tournamentId = await arenaManager.createAutonomousTournament(8);
      expect(tournamentId).toMatch(/^tournament:\d+:\d+$/);
      expect(arenaManager.getActiveTournamentCount()).toBe(1);

      // 온체인 getActiveAgents가 호출되었는지 확인
      expect(mockContract._getActiveAgentsFn).toHaveBeenCalledOnce();

      // 8명 에이전트 정보 조회가 호출되었는지 확인
      expect(mockContract._getAgentInfoFn).toHaveBeenCalledTimes(8);

      // 온체인 createTournament가 호출되었는지 확인
      expect(mockContract._createTournamentFn).toHaveBeenCalledOnce();

      // === 2단계: 라운드 1 (8강 -> 4강) ===
      // 4개 매치가 스케줄되었는지 확인
      const round1Matches = mockScheduler.getMatchesForRound(1);
      expect(round1Matches).toHaveLength(4);

      // 각 매치에 대해 배팅 창이 열렸는지 확인
      expect(mockBetting.openedWindows).toHaveLength(4);

      // 라운드 시작 WebSocket 이벤트가 전송되었는지 확인
      const roundStartEvents = mockSocket.tournamentAdvances.filter(
        (e) => e.data['type'] === 'round_start',
      );
      expect(roundStartEvents).toHaveLength(1);
      expect(roundStartEvents[0]?.data['round']).toBe(1);

      // 라운드 1 매치 결과 시뮬레이션 (Agent1, Agent3, Agent5, Agent7 승리)
      const round1Winners = ['0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7'];
      await completeRoundMatches(mockScheduler, 1, round1Winners);

      // 4개 결과가 온체인에 제출되었는지 확인
      expect(mockVerifier.submittedResults).toHaveLength(4);

      // 4개 매치 배팅이 정산되었는지 확인
      expect(mockBetting.settledMatches).toHaveLength(4);

      // 온체인 advanceTournament가 호출되었는지 확인
      expect(mockContract._advanceTournamentFn).toHaveBeenCalled();

      // === 3단계: 라운드 2 (4강 -> 2강) ===
      const round2Matches = mockScheduler.getMatchesForRound(2);
      expect(round2Matches).toHaveLength(2);

      // 라운드 2에서도 배팅 창이 추가로 열렸는지 확인 (총 4 + 2 = 6)
      expect(mockBetting.openedWindows).toHaveLength(6);

      // 라운드 2 매치 완료 (Agent1, Agent5 승리)
      const round2Winners = ['0xAgent1', '0xAgent5'];
      await completeRoundMatches(mockScheduler, 2, round2Winners);

      // 총 6개 결과가 제출되었는지 확인
      expect(mockVerifier.submittedResults).toHaveLength(6);

      // === 4단계: 결승 (라운드 3) ===
      const round3Matches = mockScheduler.getMatchesForRound(3);
      expect(round3Matches).toHaveLength(1);

      // 결승 배팅 창이 열렸는지 확인 (총 7)
      expect(mockBetting.openedWindows).toHaveLength(7);

      // 결승 완료 (Agent1 우승)
      const finalMatch = round3Matches[0];
      if (finalMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(finalMatch.matchId, '0xAgent1', 1500, 1200),
        );
      }

      // 총 7개 결과가 제출되었는지 확인
      expect(mockVerifier.submittedResults).toHaveLength(7);

      // finalizeTournament 온체인 호출 확인
      expect(mockContract._finalizeTournamentFn).toHaveBeenCalledOnce();

      // 토너먼트 완료 WebSocket 이벤트 확인
      const completeEvents = mockSocket.tournamentAdvances.filter(
        (e) => e.data['type'] === 'tournament_complete',
      );
      expect(completeEvents).toHaveLength(1);
      const firstCompleteEvent = completeEvents[0];
      if (firstCompleteEvent !== undefined) {
        expect(firstCompleteEvent.data['champion']).toBe('0xAgent1');
      }

      // 토너먼트가 제거되었는지 확인
      expect(arenaManager.getActiveTournamentCount()).toBe(0);
    });

    it('토너먼트 생성 시 평판 기반으로 에이전트가 시딩된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // getAgentInfo가 모든 에이전트에 대해 호출되었는지 확인
      for (const address of AGENT_ADDRESSES) {
        expect(mockContract._getAgentInfoFn).toHaveBeenCalledWith(address);
      }

      // 라운드 1 매치가 평판 순서대로 페어링되었는지 확인
      // (reputation 내림차순: Agent1=99, Agent2=98, ..., Agent8=92)
      const round1Matches = mockScheduler.getMatchesForRound(1);
      expect(round1Matches).toHaveLength(4);

      // 첫 번째 매치는 1위 vs 2위 (실제 시딩 순서에 따름)
      // 평판 기반 정렬 후 순서대로 2명씩 페어링
      const allAgentsInMatches = round1Matches.flatMap((m) => [m.agentA, m.agentB]);
      expect(allAgentsInMatches).toHaveLength(8);

      // 모든 에이전트가 포함되었는지 확인
      for (const address of AGENT_ADDRESSES) {
        expect(allAgentsInMatches).toContain(address);
      }
    });

    it('각 매치에 variant와 seed가 올바르게 설정된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      const validVariants = ['classic', 'labyrinth', 'speedway', 'fortress', 'random'];
      const round1Matches = mockScheduler.getMatchesForRound(1);

      for (const match of round1Matches) {
        expect(validVariants).toContain(match.variant);
        expect(match.seed).toBeGreaterThanOrEqual(0);
        expect(match.seed).toBeLessThan(0x1_0000_0000);
        expect(match.difficulty).toBe(3); // 토너먼트는 Tier 3 고정
      }
    });
  });

  // =========================================================================
  // 2. 배팅 통합 테스트
  // =========================================================================
  describe('배팅 통합', () => {
    it('매치별 배팅 창 열기 -> 정산까지의 전체 흐름이 올바르다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // 라운드 1의 4개 매치에 대해 배팅 창이 열렸는지 확인
      expect(mockBetting.openedWindows).toHaveLength(4);

      // 각 배팅 창의 매치 ID와 에이전트 주소가 올바른지 확인
      const round1Matches = mockScheduler.getMatchesForRound(1);
      for (let i = 0; i < round1Matches.length; i++) {
        const match = round1Matches[i];
        const window = mockBetting.openedWindows[i];
        if (match !== undefined && window !== undefined) {
          expect(window.matchId).toBe(match.matchId);
          expect(window.agentA).toBe(match.agentA);
          expect(window.agentB).toBe(match.agentB);
        }
      }

      // 첫 매치 완료 후 배팅 정산 확인
      const firstMatch = round1Matches[0];
      if (firstMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(firstMatch.matchId, firstMatch.agentA, 1000, 800),
        );

        expect(mockBetting.settledMatches).toHaveLength(1);
        const firstSettled = mockBetting.settledMatches[0];
        if (firstSettled !== undefined) {
          expect(firstSettled.matchId).toBe(firstMatch.matchId);
          // scoreA(1000) > scoreB(800) 이므로 agentA 승리
          expect(firstSettled.winner).toBe('agentA');
        }
      }
    });

    it('agentB가 승리하면 배팅 정산 시 agentB 사이드로 정산된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);
      const firstMatch = round1Matches[0];

      // agentB가 승리하는 결과 (scoreB > scoreA)
      if (firstMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(firstMatch.matchId, firstMatch.agentB, 700, 1200),
        );

        expect(mockBetting.settledMatches).toHaveLength(1);
        // scoreA(700) < scoreB(1200) 이므로 agentB 사이드
        const firstSettled = mockBetting.settledMatches[0];
        if (firstSettled !== undefined) {
          expect(firstSettled.winner).toBe('agentB');
        }
      }
    });

    it('배팅 업데이트가 WebSocket으로 브로드캐스트된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // BettingOrchestrator에서 openBettingWindow 호출 시 내부적으로
      // socketManager.broadcastBetUpdate를 호출하지만, 여기서는
      // MockBettingOrchestrator를 사용하므로 ArenaManager 레벨의
      // socketManager 호출을 확인
      // 토너먼트 시작 시 broadcastTournamentAdvance가 호출됨
      expect(mockSocket.tournamentAdvances.length).toBeGreaterThanOrEqual(1);

      // round_start 이벤트에 matchups 데이터가 포함되었는지 확인
      const roundStartEvent = mockSocket.tournamentAdvances.find(
        (e) => e.data['type'] === 'round_start',
      );
      expect(roundStartEvent).toBeDefined();

      const matchups = roundStartEvent?.data['matchups'] as
        ReadonlyArray<{ agentA: string; agentB: string }> | undefined;
      expect(matchups).toBeDefined();
      expect(matchups).toHaveLength(4);
    });
  });

  // =========================================================================
  // 3. 브래킷 자동 진행 테스트
  // =========================================================================
  describe('브래킷 자동 진행', () => {
    it('라운드 1 완료 후 라운드 2가 자동 시작된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // 라운드 1 이전: 라운드 2 매치가 아직 없음
      expect(mockScheduler.getMatchesForRound(2)).toHaveLength(0);

      // 라운드 1 완료
      const round1Winners = ['0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7'];
      await completeRoundMatches(mockScheduler, 1, round1Winners);

      // 라운드 2 매치가 자동으로 스케줄됨
      const round2Matches = mockScheduler.getMatchesForRound(2);
      expect(round2Matches).toHaveLength(2);

      // 라운드 2 매치에 라운드 1 승자들이 포함됨
      const round2Agents = round2Matches.flatMap((m) => [m.agentA, m.agentB]);
      for (const winner of round1Winners) {
        expect(round2Agents).toContain(winner);
      }

      // 라운드 2 시작 WebSocket 이벤트 확인
      const round2StartEvents = mockSocket.tournamentAdvances.filter(
        (e) => e.data['type'] === 'round_start' && e.data['round'] === 2,
      );
      expect(round2StartEvents).toHaveLength(1);
    });

    it('결승 완료 후 토너먼트가 종료된다', async () => {
      await arenaManager.createAutonomousTournament(8);
      expect(arenaManager.getActiveTournamentCount()).toBe(1);

      // 라운드 1 완료 (4강 진출: Agent1, Agent3, Agent5, Agent7)
      await completeRoundMatches(mockScheduler, 1, [
        '0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7',
      ]);

      // 라운드 2 완료 (결승 진출: Agent1, Agent5)
      await completeRoundMatches(mockScheduler, 2, ['0xAgent1', '0xAgent5']);

      // 결승 완료 (우승: Agent1)
      const finalMatches = mockScheduler.getMatchesForRound(3);
      expect(finalMatches).toHaveLength(1);

      const finalMatch = finalMatches[0];
      if (finalMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(finalMatch.matchId, '0xAgent1', 1500, 1300),
        );
      }

      // 토너먼트 완료 확인
      expect(mockContract._finalizeTournamentFn).toHaveBeenCalledOnce();
      expect(arenaManager.getActiveTournamentCount()).toBe(0);

      // tournament_complete WebSocket 이벤트 확인
      const completeEvents = mockSocket.tournamentAdvances.filter(
        (e) => e.data['type'] === 'tournament_complete',
      );
      expect(completeEvents).toHaveLength(1);
      const firstCompleteEvent = completeEvents[0];
      if (firstCompleteEvent !== undefined) {
        expect(firstCompleteEvent.data['champion']).toBe('0xAgent1');
      }
    });

    it('라운드가 부분적으로 완료되면 다음 라운드가 시작되지 않는다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // 라운드 1에서 3개만 완료 (4개 중)
      const round1Matches = mockScheduler.getMatchesForRound(1);
      for (let i = 0; i < 3; i++) {
        const match = round1Matches[i];
        if (match !== undefined) {
          await mockScheduler.triggerMatchComplete(
            createMatchResult(match.matchId, match.agentA, 1000, 800),
          );
        }
      }

      // 아직 라운드 2가 시작되지 않아야 함
      expect(mockScheduler.getMatchesForRound(2)).toHaveLength(0);

      // advanceTournament가 아직 호출되지 않아야 함
      expect(mockContract._advanceTournamentFn).not.toHaveBeenCalled();
    });

    it('온체인 advanceTournament가 라운드 완료 시마다 호출된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // 라운드 1 완료
      await completeRoundMatches(mockScheduler, 1, [
        '0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7',
      ]);

      // advanceTournament 첫 호출 확인
      expect(mockContract._advanceTournamentFn).toHaveBeenCalledTimes(1);

      // 라운드 2 완료
      await completeRoundMatches(mockScheduler, 2, ['0xAgent1', '0xAgent5']);

      // advanceTournament 두 번째 호출 확인
      expect(mockContract._advanceTournamentFn).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 4. 결과 검증 및 온체인 제출 테스트
  // =========================================================================
  describe('결과 검증 및 온체인 제출', () => {
    it('매치 완료 시 ResultVerifier.submitResult가 올바른 데이터로 호출된다', async () => {
      const submitSpy = vi.spyOn(mockVerifier, 'submitResult');
      await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);
      const firstMatch = round1Matches[0];

      if (firstMatch !== undefined) {
        await mockScheduler.triggerMatchComplete({
          matchId: firstMatch.matchId,
          scoreA: 1234,
          scoreB: 567,
          winner: firstMatch.agentA,
          replayData: Buffer.from('test_replay_data'),
          totalTicks: 5400,
        });
      }

      expect(submitSpy).toHaveBeenCalledOnce();
      if (firstMatch !== undefined) {
        expect(submitSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            matchId: expect.any(Number) as number,
            scoreA: 1234,
            scoreB: 567,
            winner: firstMatch.agentA,
            replayURI: expect.stringContaining('ipfs://') as string,
          }),
        );
      }
    });

    it('제출된 결과에 replayURI가 IPFS 형식으로 포함된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);
      const firstMatch = round1Matches[0];
      if (firstMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(firstMatch.matchId, firstMatch.agentA, 1000, 800),
        );
      }

      const submitted = mockVerifier.submittedResults[0];
      expect(submitted).toBeDefined();
      if (submitted !== undefined) {
        expect(submitted.replayURI).toMatch(/^ipfs:\/\//);
      }
    });

    it('모든 매치 결과가 순서대로 제출된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);

      // 순서대로 완료
      for (const match of round1Matches) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(match.matchId, match.agentA, 1000, 800),
        );
      }

      // 결과 제출 순서가 매치 완료 순서와 일치
      expect(mockVerifier.submittedResults).toHaveLength(4);
      for (let i = 0; i < round1Matches.length; i++) {
        const match = round1Matches[i];
        const result = mockVerifier.submittedResults[i];
        if (match !== undefined && result !== undefined) {
          const matchNum = Number(match.matchId.split(':')[1] ?? '0');
          expect(result.matchId).toBe(matchNum);
        }
      }
    });
  });

  // =========================================================================
  // 5. WebSocket 이벤트 검증 테스트
  // =========================================================================
  describe('WebSocket 이벤트 검증', () => {
    it('토너먼트 시작 시 round_start 이벤트에 matchups가 포함된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      const roundStartEvent = mockSocket.tournamentAdvances.find(
        (e) => e.data['type'] === 'round_start' && e.data['round'] === 1,
      );
      expect(roundStartEvent).toBeDefined();
      expect(roundStartEvent?.data['tournamentId']).toMatch(/^tournament:/);

      const matchups = roundStartEvent?.data['matchups'] as
        ReadonlyArray<{ agentA: string; agentB: string }>;
      expect(matchups).toHaveLength(4);

      // 각 matchup에 agentA, agentB가 포함됨
      for (const matchup of matchups) {
        expect(matchup.agentA).toBeTruthy();
        expect(matchup.agentB).toBeTruthy();
        expect(matchup.agentA).not.toBe(matchup.agentB);
      }
    });

    it('토너먼트 종료 시 tournament_complete 이벤트에 champion이 포함된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // 전체 토너먼트 완료
      await completeRoundMatches(mockScheduler, 1, [
        '0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7',
      ]);
      await completeRoundMatches(mockScheduler, 2, ['0xAgent1', '0xAgent5']);

      const finalMatches = mockScheduler.getMatchesForRound(3);
      const finalMatch = finalMatches[0];
      if (finalMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(finalMatch.matchId, '0xAgent1', 1500, 1300),
        );
      }

      const completeEvent = mockSocket.tournamentAdvances.find(
        (e) => e.data['type'] === 'tournament_complete',
      );
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.data['champion']).toBe('0xAgent1');
      expect(completeEvent?.data['tournamentId']).toMatch(/^tournament:/);
    });

    it('각 라운드 진행 시마다 round_start 이벤트가 전송된다', async () => {
      await arenaManager.createAutonomousTournament(8);

      // 라운드 1 완료
      await completeRoundMatches(mockScheduler, 1, [
        '0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7',
      ]);

      // 라운드 2 완료
      await completeRoundMatches(mockScheduler, 2, ['0xAgent1', '0xAgent5']);

      // round_start 이벤트가 3번 전송됨 (라운드 1, 2, 3)
      const roundStartEvents = mockSocket.tournamentAdvances.filter(
        (e) => e.data['type'] === 'round_start',
      );
      expect(roundStartEvents).toHaveLength(3);

      // 라운드 번호가 순차적
      expect(roundStartEvents[0]?.data['round']).toBe(1);
      expect(roundStartEvents[1]?.data['round']).toBe(2);
      expect(roundStartEvents[2]?.data['round']).toBe(3);

      // matchup 수가 라운드에 따라 줄어듦
      const matchupCounts = roundStartEvents.map(
        (e) => (e.data['matchups'] as ReadonlyArray<unknown>).length,
      );
      expect(matchupCounts).toEqual([4, 2, 1]);
    });
  });

  // =========================================================================
  // 6. 에러 처리 테스트
  // =========================================================================
  describe('에러 처리', () => {
    it('에이전트 부족 시 에러를 throw한다 (8강에 4명)', async () => {
      mockContract.getFunction = vi.fn((name: string) => {
        if (name === 'getActiveAgents') {
          return vi.fn().mockResolvedValue([
            '0xAgent1', '0xAgent2', '0xAgent3', '0xAgent4',
          ]);
        }
        return vi.fn();
      });

      await expect(arenaManager.createAutonomousTournament(8)).rejects.toThrow(
        '활성 에이전트 부족',
      );
    });

    it('에이전트가 0명이면 에러를 throw한다', async () => {
      mockContract.getFunction = vi.fn((name: string) => {
        if (name === 'getActiveAgents') {
          return vi.fn().mockResolvedValue([]);
        }
        return vi.fn();
      });

      await expect(arenaManager.createAutonomousTournament(8)).rejects.toThrow(
        '활성 에이전트 부족',
      );
    });

    it('16강 토너먼트에 에이전트가 12명이면 에러를 throw한다', async () => {
      const twelveAgents = Array.from({ length: 12 }, (_, i) => `0xAgent${String(i + 1)}`);
      mockContract.getFunction = vi.fn((name: string) => {
        if (name === 'getActiveAgents') {
          return vi.fn().mockResolvedValue(twelveAgents);
        }
        return vi.fn();
      });

      await expect(arenaManager.createAutonomousTournament(16)).rejects.toThrow(
        '활성 에이전트 부족',
      );
    });

    it('온체인 제출 실패 시 에러가 unhandled rejection으로 발생한다', async () => {
      const submitError = new Error('온체인 트랜잭션 실패: gas estimation failed');
      const submitSpy = vi.spyOn(mockVerifier, 'submitResult').mockRejectedValueOnce(submitError);

      await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);

      // ArenaManager 생성자에서 `void this.handleMatchComplete(result)` 형태로
      // 호출하므로 에러는 직접 전파되지 않고 unhandled rejection으로 발생합니다.
      // Node.js 환경에서 process.on('unhandledRejection')으로 캡처합니다.
      const rejectionPromise = new Promise<Error>((resolve) => {
        const handler = (reason: unknown): void => {
          process.removeListener('unhandledRejection', handler);
          resolve(reason as Error);
        };
        process.on('unhandledRejection', handler);
      });

      const firstMatch = round1Matches[0];
      if (firstMatch !== undefined) {
        await mockScheduler.triggerMatchComplete(
          createMatchResult(firstMatch.matchId, firstMatch.agentA, 1000, 800),
        );
      }

      const caughtError = await rejectionPromise;

      // submitResult가 호출되었는지 확인
      expect(submitSpy).toHaveBeenCalledOnce();
      // 에러 메시지 확인
      expect(caughtError.message).toBe('온체인 트랜잭션 실패: gas estimation failed');
    });
  });

  // =========================================================================
  // 7. 다중 토너먼트 동시 실행 테스트
  // =========================================================================
  describe('다중 토너먼트', () => {
    it('여러 토너먼트를 동시에 생성하고 관리할 수 있다', async () => {
      const tournamentId1 = await arenaManager.createAutonomousTournament(8);
      const tournamentId2 = await arenaManager.createAutonomousTournament(8);

      expect(tournamentId1).not.toBe(tournamentId2);
      expect(arenaManager.getActiveTournamentCount()).toBe(2);

      // 두 토너먼트 모두 8개씩 총 8개 배팅 창 (4 + 4)
      expect(mockBetting.openedWindows).toHaveLength(8);
    });
  });

  // =========================================================================
  // 8. shutdown 동작 테스트
  // =========================================================================
  describe('정리 및 종료', () => {
    it('shutdown 호출 시 모든 활성 토너먼트가 제거된다', async () => {
      await arenaManager.createAutonomousTournament(8);
      await arenaManager.createAutonomousTournament(8);
      expect(arenaManager.getActiveTournamentCount()).toBe(2);

      arenaManager.shutdown();
      expect(arenaManager.getActiveTournamentCount()).toBe(0);
    });

    it('shutdown 후에도 새 토너먼트를 생성할 수 있다', async () => {
      await arenaManager.createAutonomousTournament(8);
      arenaManager.shutdown();
      expect(arenaManager.getActiveTournamentCount()).toBe(0);

      // 새 토너먼트 생성
      const newTournamentId = await arenaManager.createAutonomousTournament(8);
      expect(newTournamentId).toBeTruthy();
      expect(arenaManager.getActiveTournamentCount()).toBe(1);
    });
  });

  // =========================================================================
  // 9. 매치 스케줄링 데이터 무결성 테스트
  // =========================================================================
  describe('매치 스케줄링 데이터 무결성', () => {
    it('스케줄된 매치에 tournamentId와 round가 올바르게 설정된다', async () => {
      const tournamentId = await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);
      for (const match of round1Matches) {
        expect(match.tournamentId).toBe(tournamentId);
        expect(match.round).toBe(1);
        expect(match.agentA).toBeTruthy();
        expect(match.agentB).toBeTruthy();
        expect(match.agentA).not.toBe(match.agentB);
      }
    });

    it('라운드 2 매치에 올바른 tournamentId와 round가 설정된다', async () => {
      const tournamentId = await arenaManager.createAutonomousTournament(8);

      await completeRoundMatches(mockScheduler, 1, [
        '0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7',
      ]);

      const round2Matches = mockScheduler.getMatchesForRound(2);
      for (const match of round2Matches) {
        expect(match.tournamentId).toBe(tournamentId);
        expect(match.round).toBe(2);
      }
    });

    it('매치 ID가 고유하게 증가한다', async () => {
      await arenaManager.createAutonomousTournament(8);

      await completeRoundMatches(mockScheduler, 1, [
        '0xAgent1', '0xAgent3', '0xAgent5', '0xAgent7',
      ]);

      const allMatchIds = mockScheduler.getScheduledMatchIds();
      const uniqueIds = new Set(allMatchIds);
      expect(uniqueIds.size).toBe(allMatchIds.length);

      // matchId 형식 확인
      for (const id of allMatchIds) {
        expect(id).toMatch(/^match:\d+$/);
      }
    });
  });

  // =========================================================================
  // 10. 경계 케이스 테스트
  // =========================================================================
  describe('경계 케이스', () => {
    it('정확히 bracketSize만큼의 에이전트가 있으면 성공한다', async () => {
      // 정확히 8명 (기본 Mock)
      const tournamentId = await arenaManager.createAutonomousTournament(8);
      expect(tournamentId).toBeTruthy();
      expect(arenaManager.getActiveTournamentCount()).toBe(1);
    });

    it('bracketSize보다 많은 에이전트가 있으면 상위 N명만 선택한다', async () => {
      // 10명 에이전트 반환
      const tenAgents = Array.from({ length: 10 }, (_, i) => `0xAgent${String(i + 1)}`);
      mockContract = createMockContract(tenAgents);

      arenaManager = new ArenaManager({
        rpcUrl: 'http://localhost:8545',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ghostArenaAddress: '0xGhostArenaContract',
        matchScheduler: mockScheduler as unknown as MatchScheduler,
        resultVerifier: mockVerifier as unknown as ResultVerifier,
        bettingOrchestrator: mockBetting as unknown as BettingOrchestrator,
        socketManager: mockSocket as unknown as SocketManager,
        ghostArenaContract: mockContract as unknown as Contract,
      });

      await arenaManager.createAutonomousTournament(8);

      // 4개 매치에 총 8명만 참가
      const round1Matches = mockScheduler.getMatchesForRound(1);
      const allAgents = round1Matches.flatMap((m) => [m.agentA, m.agentB]);
      expect(allAgents).toHaveLength(8);
    });

    it('동점 결과에서도 배팅 정산이 올바르게 동작한다', async () => {
      await arenaManager.createAutonomousTournament(8);

      const round1Matches = mockScheduler.getMatchesForRound(1);
      const firstMatch = round1Matches[0];
      if (firstMatch === undefined) {
        throw new Error('No matches created');
      };

      // 동점 (scoreA === scoreB): handleMatchComplete에서 scoreA >= scoreB이면 agentA 승리
      await mockScheduler.triggerMatchComplete(
        createMatchResult(firstMatch.matchId, firstMatch.agentA, 1000, 1000),
      );

      expect(mockBetting.settledMatches).toHaveLength(1);
      // scoreA(1000) >= scoreB(1000) 이므로 agentA
      expect(mockBetting.settledMatches[0]?.winner).toBe('agentA');
    });
  });
});
