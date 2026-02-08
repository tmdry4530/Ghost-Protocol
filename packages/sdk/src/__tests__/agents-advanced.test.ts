import { describe, it, expect } from 'vitest';
import type { GameState, MazeData, PacmanState, GhostState } from '@ghost-protocol/shared';
import { AggressiveAgent } from '../agents/AggressiveAgent.js';
import { LLMAgent, type LLMAgentConfig } from '../agents/LLMAgent.js';

/** 테스트용 미로 생성 */
function createTestMaze(overrides?: Partial<MazeData>): MazeData {
  const walls: boolean[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
  const pellets: boolean[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));

  return {
    width: 5,
    height: 5,
    walls,
    pellets,
    powerPellets: [],
    ...overrides,
  };
}

/** 테스트용 팩맨 상태 생성 */
function createTestPacman(overrides?: Partial<PacmanState>): PacmanState {
  return {
    x: 0,
    y: 0,
    direction: 'right',
    score: 0,
    lives: 3,
    ...overrides,
  };
}

/** 테스트용 고스트 생성 */
function createTestGhost(overrides?: Partial<GhostState>): GhostState {
  return {
    id: 'blinky',
    x: 10,
    y: 10,
    mode: 'chase',
    ...overrides,
  };
}

/** 테스트용 게임 상태 생성 */
function createTestGameState(overrides?: Partial<GameState>): GameState {
  return {
    tick: 0,
    round: 1,
    score: 0,
    lives: 3,
    pacman: createTestPacman(),
    ghosts: [],
    maze: createTestMaze(),
    powerActive: false,
    powerTimeRemaining: 0,
    fruitAvailable: null,
    ...overrides,
  };
}

describe('AggressiveAgent', () => {
  it('파워 펠릿이 있을 때 파워 펠릿으로 이동', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({
        powerPellets: [
          { x: 2, y: 0 }, // 오른쪽
          { x: 0, y: 4 }, // 아래쪽 (더 멀음)
        ],
      }),
      powerActive: false,
    });

    const agent = new AggressiveAgent();
    const action = agent.onGameState(state);

    // 가까운 파워 펠릿 (2, 0)으로 이동
    expect(action.direction).toBe('right');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('hunt_power');
      expect(metadata.confidence).toBeGreaterThan(0.9);
    }
  });

  it('파워 모드에서 frightened 고스트 추적', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 4, y: 2, mode: 'frightened' }), // 오른쪽
        createTestGhost({ id: 'pinky', x: 0, y: 0, mode: 'chase' }), // chase는 무시
      ],
      powerActive: true,
      powerTimeRemaining: 120,
    });

    const agent = new AggressiveAgent();
    const action = agent.onGameState(state);

    // frightened 고스트 추적
    expect(action.direction).toBe('right');
    expect(action.metadata?.strategy).toBe('chase_ghost');
  });

  it('일반 모드에서 펠릿 수집 (GreedyAgent와 유사)', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[3] = true; // (3, 0)에 펠릿
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ pellets, powerPellets: [] }),
      powerActive: false,
    });

    const agent = new AggressiveAgent();
    const action = agent.onGameState(state);

    // 펠릿으로 이동
    expect(action.direction).toBe('right');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('collect');
    }
  });

  it('파워 펠릿이 없으면 일반 펠릿 수집', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[2] = true;
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ pellets, powerPellets: [] }),
      powerActive: false,
    });

    const agent = new AggressiveAgent();
    const action = agent.onGameState(state);

    expect(action.direction).toBe('right');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('collect');
    }
  });

  it('고스트가 없는 파워 모드에서는 펠릿 수집', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[4] = true;
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ pellets, powerPellets: [] }),
      ghosts: [], // 고스트 없음
      powerActive: true,
      powerTimeRemaining: 60,
    });

    const agent = new AggressiveAgent();
    const action = agent.onGameState(state);

    // frightened 고스트가 없으므로 펠릿 수집
    expect(action.direction).toBe('right');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('collect');
    }
  });
});

describe('LLMAgent', () => {
  it('API 키 없으면 balanced 전략 사용', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
    });

    const agent = new LLMAgent(); // API 키 없음
    const action = agent.onGameState(state);

    // balanced 전략 실행 (메타데이터에 balanced 포함)
    expect(action.metadata?.strategy).toContain('balanced');
  });

  it('balanced 전략 기본 동작 테스트', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[4] = true;
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ pellets }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 20, y: 20, mode: 'chase' }), // 멀리 있음 (안전)
      ],
    });

    const agent = new LLMAgent();
    const action = agent.onGameState(state);

    // 안전하므로 탐욕 모드
    expect(action.direction).toBe('right');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('balanced_greedy');
    }
  });

  it('aggressive 전략 시 파워 펠릿 우선', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({
        powerPellets: [{ x: 3, y: 0 }],
      }),
      powerActive: false,
    });

    // 테스트용 서브클래스: aggressive 전략 강제 (동기적으로 즉시 적용)
    class TestAggressiveLLMAgent extends LLMAgent {
      constructor() {
        super();
        // 생성자에서 전략 직접 설정
        (this as unknown as { currentStrategy: 'aggressive' | 'defensive' | 'balanced' }).currentStrategy = 'aggressive';
      }

      protected async analyzeState(): Promise<'aggressive' | 'defensive' | 'balanced'> {
        await Promise.resolve();
        return 'aggressive';
      }
    }

    const agent = new TestAggressiveLLMAgent();
    const action = agent.onGameState(state);

    // aggressive 전략: 파워 펠릿 우선
    expect(action.direction).toBe('right');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('aggressive_power');
    }
  });

  it('defensive 전략 시 위험 회피 우선', () => {
    const pellets: boolean[][] = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => false)
    );
    const row2 = pellets[2];
    if (row2) {
      row2[7] = true; // (7, 2)에 펠릿
    }

    const walls: boolean[][] = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => false)
    );

    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 2, y: 6, mode: 'chase' }), // 아래쪽 (거리 4, 위험 영역)
      ],
      maze: createTestMaze({
        width: 10,
        height: 10,
        walls,
        pellets
      }),
    });

    // 테스트용 서브클래스: defensive 전략 강제 (동기적으로 즉시 적용)
    class TestDefensiveLLMAgent extends LLMAgent {
      constructor() {
        super();
        // 생성자에서 전략 직접 설정
        (this as unknown as { currentStrategy: 'aggressive' | 'defensive' | 'balanced' }).currentStrategy = 'defensive';
      }

      protected async analyzeState(): Promise<'aggressive' | 'defensive' | 'balanced'> {
        await Promise.resolve();
        return 'defensive';
      }
    }

    const agent = new TestDefensiveLLMAgent();
    const action = agent.onGameState(state);

    // defensive 전략: 위험 회피 (아래쪽은 위험하므로 피함)
    expect(action.direction).not.toBe('down');
    const metadata = action.metadata;
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.strategy).toBe('defensive_escape');
    }
  });

  it('analysisInterval 커스텀 설정 확인', () => {
    const config: LLMAgentConfig = {
      analysisInterval: 30, // 기본값 60 대신 30
    };

    const agent = new LLMAgent(config);
    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
    });

    // 첫 틱
    agent.onGameState(state);

    // 30틱 후 (분석 간격 도달)
    const state2 = createTestGameState({
      ...state,
      tick: 30,
    });
    const action = agent.onGameState(state2);

    // 정상 동작 (에러 없이 응답 반환)
    expect(action.direction).toBeDefined();
  });

  it('에이전트 이름 올바르게 설정', () => {
    const agent = new LLMAgent();
    expect(agent.name).toBe('LLMAgent');
  });
});
