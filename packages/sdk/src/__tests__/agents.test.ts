import { describe, it, expect } from 'vitest';
import type { GameState, MazeData, PacmanState, GhostState, Direction } from '@ghost-protocol/shared';
import { GreedyAgent } from '../agents/GreedyAgent.js';
import { SafetyAgent } from '../agents/SafetyAgent.js';

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

describe('GreedyAgent', () => {
  it('펠릿이 있을 때 펠릿 방향으로 이동', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[2] = true; // (2, 0)에 펠릿
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ pellets }),
    });

    const agent = new GreedyAgent();
    const action = agent.onGameState(state);

    // (0,0)에서 (2,0)으로 가려면 오른쪽
    expect(action.direction).toBe('right');
  });

  it('펠릿이 없을 때 현재 방향 유지', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'down' }),
      maze: createTestMaze({ pellets }),
    });

    const agent = new GreedyAgent();
    const action = agent.onGameState(state);

    // 펠릿이 없으므로 현재 방향 유지
    expect(action.direction).toBe('down');
  });

  it('direction 속성이 항상 유효한 Direction', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'left' }),
    });

    const agent = new GreedyAgent();
    const action = agent.onGameState(state);

    const validDirections: Direction[] = ['up', 'down', 'left', 'right'];
    expect(validDirections).toContain(action.direction);
  });

  it('가장 가까운 펠릿 선택', () => {
    const pellets: boolean[][] = [
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, true, false], // (3, 2) - 거리 5
      [false, true, false, false, false], // (1, 3) - 거리 4 (더 가까움)
      [false, false, false, false, false],
    ];

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ pellets }),
    });

    const agent = new GreedyAgent();
    const action = agent.onGameState(state);

    // 더 가까운 (1,3)으로 가기 위한 첫 방향
    // (0,0) → (1,3): right 또는 down이 첫 번째 이동
    expect(['right', 'down']).toContain(action.direction);
  });

  it('벽이 있을 때 우회 경로 선택', () => {
    const walls: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const wallRow0 = walls[0];
    if (wallRow0) {
      wallRow0[1] = true; // 오른쪽 바로 옆 벽
    }

    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const pelletRow0 = pellets[0];
    if (pelletRow0) {
      pelletRow0[2] = true; // (2, 0)에 펠릿
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      maze: createTestMaze({ walls, pellets }),
    });

    const agent = new GreedyAgent();
    const action = agent.onGameState(state);

    // 바로 오른쪽이 벽이므로 우회해야 함
    expect(action.direction).not.toBe('right');
    expect(['up', 'down', 'left']).toContain(action.direction);
  });

  it('name 속성 확인', () => {
    const agent = new GreedyAgent();
    expect(agent.name).toBe('GreedyAgent');
  });
});

describe('SafetyAgent', () => {
  it('고스트 근처에서 탈출 경로 선택', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 2, y: 0, mode: 'chase' }), // 위쪽 (거리 2)
      ],
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // 위쪽은 위험하므로 피해야 함
    expect(action.direction).not.toBe('up');
    expect(['down', 'left', 'right']).toContain(action.direction);
  });

  it('안전할 때 펠릿 추적', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[4] = true; // (4, 0)에 펠릿
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 20, y: 20, mode: 'chase' }), // 멀리 있음
      ],
      maze: createTestMaze({ pellets }),
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // 안전하므로 펠릿 방향으로
    expect(action.direction).toBe('right');
  });

  it('안전한 방향 중 펠릿에 가까운 방향 선택', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row4 = pellets[4];
    if (row4) {
      row4[2] = true; // (2, 4)에 펠릿 (아래쪽)
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 2, y: 0, mode: 'chase' }), // 위쪽 (거리 2, 위험)
      ],
      maze: createTestMaze({ pellets }),
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // 위쪽은 위험. 펠릿이 아래에 있으므로 down 선택해야 함
    expect(action.direction).toBe('down');
  });

  it('frightened 고스트는 무시하고 펠릿 추적', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[4] = true; // (4, 0)에 펠릿
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 1, y: 1, mode: 'frightened' }), // 가까이 있지만 frightened
      ],
      maze: createTestMaze({ pellets }),
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // frightened 고스트는 위험하지 않으므로 펠릿 추적
    expect(action.direction).toBe('right');
  });

  it('모든 방향이 위험할 때도 행동 반환', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 2, y: 0, mode: 'chase' }), // 위
        createTestGhost({ id: 'pinky', x: 2, y: 4, mode: 'chase' }),  // 아래
        createTestGhost({ id: 'inky', x: 0, y: 2, mode: 'chase' }),   // 왼쪽
        createTestGhost({ id: 'clyde', x: 4, y: 2, mode: 'chase' }),  // 오른쪽
      ],
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // 모든 방향이 위험해도 유효한 방향 반환
    const validDirections: Direction[] = ['up', 'down', 'left', 'right'];
    expect(validDirections).toContain(action.direction);
  });

  it('eaten 고스트는 무시', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );
    const row0 = pellets[0];
    if (row0) {
      row0[4] = true; // (4, 0)에 펠릿
    }

    const state = createTestGameState({
      pacman: createTestPacman({ x: 0, y: 0, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 1, y: 1, mode: 'eaten' }), // 가까이 있지만 eaten
      ],
      maze: createTestMaze({ pellets }),
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // eaten 고스트는 위험하지 않으므로 펠릿 추적
    expect(action.direction).toBe('right');
  });

  it('name 속성 확인', () => {
    const agent = new SafetyAgent();
    expect(agent.name).toBe('SafetyAgent');
  });

  it('DANGER_RADIUS=5 반경 테스트', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 2, y: 8, mode: 'chase' }), // 거리 6 (안전)
      ],
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // 거리 6은 DANGER_RADIUS=5를 초과하므로 안전
    // 펠릿 추적 모드로 동작
    const validDirections: Direction[] = ['up', 'down', 'left', 'right'];
    expect(validDirections).toContain(action.direction);
  });

  it('scatter 모드 고스트도 위험으로 처리', () => {
    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'right' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 2, y: 0, mode: 'scatter' }), // 위쪽 (거리 2)
      ],
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // scatter 모드도 위험하므로 위쪽 피해야 함
    expect(action.direction).not.toBe('up');
  });

  it('펠릿이 없을 때 현재 방향 유지', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );

    const state = createTestGameState({
      pacman: createTestPacman({ x: 2, y: 2, direction: 'left' }),
      ghosts: [
        createTestGhost({ id: 'blinky', x: 20, y: 20, mode: 'chase' }), // 멀리 있음
      ],
      maze: createTestMaze({ pellets }),
    });

    const agent = new SafetyAgent();
    const action = agent.onGameState(state);

    // 펠릿이 없고 안전하므로 현재 방향 유지
    expect(action.direction).toBe('left');
  });
});
