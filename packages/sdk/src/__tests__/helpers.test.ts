import { describe, it, expect } from 'vitest';
import type { MazeData, Position, GhostState, GhostMode } from '@ghost-protocol/shared';
import { MAZE_WIDTH, MAZE_HEIGHT } from '@ghost-protocol/shared';
import { pathfind } from '../helpers/pathfind.js';
import { nearestPellet } from '../helpers/nearestPellet.js';
import { ghostDistance } from '../helpers/ghostDistance.js';
import { dangerZone } from '../helpers/dangerZone.js';
import { escapePaths } from '../helpers/escapePaths.js';
import { pelletCluster } from '../helpers/pelletCluster.js';

/** 테스트용 미로 생성 (5x5 간단한 미로) */
function createTestMaze(overrides?: Partial<MazeData>): MazeData {
  // 5x5 그리드 - 모두 열려있음 (벽 없음)
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

/** 테스트용 고스트 생성 */
function createTestGhost(overrides?: Partial<GhostState>): GhostState {
  return {
    id: 'blinky',
    x: 0,
    y: 0,
    mode: 'chase' as GhostMode,
    ...overrides,
  };
}

describe('pathfind', () => {
  it('같은 위치에서 빈 배열 반환', () => {
    const maze = createTestMaze();
    const result = pathfind({ x: 2, y: 2 }, { x: 2, y: 2 }, maze);
    expect(result).toEqual([]);
  });

  it('직선 경로 (벽 없음) - 오른쪽', () => {
    const maze = createTestMaze();
    const result = pathfind({ x: 0, y: 0 }, { x: 2, y: 0 }, maze);
    expect(result).toEqual(['right', 'right']);
  });

  it('직선 경로 (벽 없음) - 아래', () => {
    const maze = createTestMaze();
    const result = pathfind({ x: 0, y: 0 }, { x: 0, y: 2 }, maze);
    expect(result).toEqual(['down', 'down']);
  });

  it('직선 경로 (벽 없음) - 대각선', () => {
    const maze = createTestMaze();
    const result = pathfind({ x: 0, y: 0 }, { x: 2, y: 2 }, maze);
    // 맨해튼 거리로 4칸 이동 (right 2번 + down 2번 또는 순서 다름)
    expect(result.length).toBe(4);
    const rightCount = result.filter(d => d === 'right').length;
    const downCount = result.filter(d => d === 'down').length;
    expect(rightCount).toBe(2);
    expect(downCount).toBe(2);
  });

  it('벽 우회 경로', () => {
    const walls: boolean[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
    // 가운데 세로 벽 설치 (x=2, y=1~3) - 위아래 열어서 우회 가능
    const row1 = walls[1];
    const row2 = walls[2];
    const row3 = walls[3];
    if (row1 && row2 && row3) {
      row1[2] = true;
      row2[2] = true;
      row3[2] = true;
    }

    const maze = createTestMaze({ walls });
    const result = pathfind({ x: 0, y: 2 }, { x: 4, y: 2 }, maze);

    // 벽을 우회해야 하므로 직선 거리(4)보다 길어야 함
    expect(result.length).toBeGreaterThan(4);
    // 모든 방향이 유효한 Direction이어야 함
    result.forEach(dir => {
      expect(['up', 'down', 'left', 'right']).toContain(dir);
    });
  });

  it('경로 없음 (완전히 막힌 경우)', () => {
    const walls: boolean[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
    // 목표 지점을 벽으로 완전히 둘러싸기
    const row1 = walls[1];
    const row2 = walls[2];
    const row3 = walls[3];
    if (row1 && row2 && row3) {
      row1[2] = true; // 위
      row3[2] = true; // 아래
      row2[1] = true; // 왼쪽
      row2[3] = true; // 오른쪽
      row2[2] = true; // 목표 자체
    }

    const maze = createTestMaze({ walls });
    const result = pathfind({ x: 0, y: 0 }, { x: 2, y: 2 }, maze);
    expect(result).toEqual([]);
  });

  it('28x31 풀 미로에서 경로 탐색', () => {
    const walls: boolean[][] = Array.from({ length: MAZE_HEIGHT }, () =>
      Array.from({ length: MAZE_WIDTH }, () => false)
    );
    const pellets: boolean[][] = Array.from({ length: MAZE_HEIGHT }, () =>
      Array.from({ length: MAZE_WIDTH }, () => true)
    );

    const maze: MazeData = {
      width: MAZE_WIDTH,
      height: MAZE_HEIGHT,
      walls,
      pellets,
      powerPellets: [],
    };

    const result = pathfind({ x: 0, y: 0 }, { x: 27, y: 30 }, maze);

    // 경로가 존재해야 함
    expect(result.length).toBeGreaterThan(0);
    // 최단 경로는 맨해튼 거리와 같아야 함 (벽 없음)
    expect(result.length).toBe(27 + 30);
  });

  it('터널 행에서 래핑 경로 탐색 (y=14)', () => {
    const walls: boolean[][] = Array.from({ length: MAZE_HEIGHT }, () =>
      Array.from({ length: MAZE_WIDTH }, () => false)
    );
    const pellets: boolean[][] = Array.from({ length: MAZE_HEIGHT }, () =>
      Array.from({ length: MAZE_WIDTH }, () => true)
    );

    const maze: MazeData = {
      width: MAZE_WIDTH,
      height: MAZE_HEIGHT,
      walls,
      pellets,
      powerPellets: [],
    };

    // 터널을 통한 래핑이 더 짧은 경로
    const result = pathfind({ x: 0, y: 14 }, { x: 27, y: 14 }, maze);

    // 경로가 존재해야 함
    expect(result.length).toBeGreaterThan(0);
    // 터널 래핑으로 1칸 이동 (왼쪽으로 가면 27로 래핑)
    expect(result.length).toBe(1);
    expect(result[0]).toBe('left');
  });
});

describe('nearestPellet', () => {
  it('펠릿이 있을 때 가장 가까운 펠릿 반환', () => {
    const pellets: boolean[][] = [
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, true, false, false], // (2, 2)
      [false, false, false, false, false],
      [false, false, false, false, true],  // (4, 4)
    ];

    const maze = createTestMaze({ pellets });
    const position: Position = { x: 0, y: 0 };
    const result = nearestPellet(position, maze);

    // (0,0)에서 (2,2)까지 거리는 4, (4,4)까지는 8
    expect(result).toEqual({ x: 2, y: 2 });
  });

  it('펠릿이 없을 때 null 반환', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );

    const maze = createTestMaze({ pellets });
    const position: Position = { x: 0, y: 0 };
    const result = nearestPellet(position, maze);

    expect(result).toBeNull();
  });

  it('같은 거리에 여러 펠릿이 있을 때 하나 반환', () => {
    const pellets: boolean[][] = [
      [false, true, false, false, false], // (1, 0) - 거리 1
      [true, false, false, false, false], // (0, 1) - 거리 1
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];

    const maze = createTestMaze({ pellets });
    const position: Position = { x: 0, y: 0 };
    const result = nearestPellet(position, maze);

    // 둘 중 하나여야 함 (거리가 같으므로)
    expect(result).toBeTruthy();
    if (result) {
      const distance = Math.abs(result.x - position.x) + Math.abs(result.y - position.y);
      expect(distance).toBe(1);
    }
  });

  it('현재 위치에 펠릿이 있을 때 (거리 0)', () => {
    const pellets: boolean[][] = [
      [true, false, false, false, false], // (0, 0) - 거리 0
      [false, false, false, false, false],
      [false, false, true, false, false],  // (2, 2) - 거리 4
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];

    const maze = createTestMaze({ pellets });
    const position: Position = { x: 0, y: 0 };
    const result = nearestPellet(position, maze);

    // 현재 위치의 펠릿 반환
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

describe('ghostDistance', () => {
  it('맨해튼 거리 정확성', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghost = createTestGhost({ x: 8, y: 9 });

    const result = ghostDistance(pacman, ghost);
    // |5-8| + |5-9| = 3 + 4 = 7
    expect(result).toBe(7);
  });

  it('같은 위치에서 거리 0', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghost = createTestGhost({ x: 5, y: 5 });

    const result = ghostDistance(pacman, ghost);
    expect(result).toBe(0);
  });

  it('대각선 위치 거리 계산', () => {
    const pacman: Position = { x: 0, y: 0 };
    const ghost = createTestGhost({ x: 3, y: 4 });

    const result = ghostDistance(pacman, ghost);
    // |0-3| + |0-4| = 3 + 4 = 7
    expect(result).toBe(7);
  });

  it('음수 좌표 차이 처리', () => {
    const pacman: Position = { x: 10, y: 10 };
    const ghost = createTestGhost({ x: 2, y: 3 });

    const result = ghostDistance(pacman, ghost);
    // |10-2| + |10-3| = 8 + 7 = 15
    expect(result).toBe(15);
  });
});

describe('dangerZone', () => {
  it('반경 내 위험한 고스트가 있을 때 true', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 7, y: 7, mode: 'chase' }), // 거리 4
    ];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(true);
  });

  it('반경 밖 고스트는 false', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 15, y: 15, mode: 'chase' }), // 거리 20
    ];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(false);
  });

  it('frightened 고스트는 무시', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 6, y: 6, mode: 'frightened' }), // 거리 2
    ];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(false);
  });

  it('eaten 고스트는 무시', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 6, y: 6, mode: 'eaten' }), // 거리 2
    ];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(false);
  });

  it('빈 고스트 배열은 false', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(false);
  });

  it('여러 고스트 중 하나라도 위험하면 true', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 20, y: 20, mode: 'chase' }), // 거리 30 (안전)
      createTestGhost({ id: 'pinky', x: 6, y: 5, mode: 'frightened' }), // 거리 1 (무시)
      createTestGhost({ id: 'inky', x: 7, y: 8, mode: 'scatter' }), // 거리 5 (위험!)
    ];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(true);
  });

  it('정확히 반경 거리에 있을 때 true (경계 조건)', () => {
    const pacman: Position = { x: 5, y: 5 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 8, y: 7, mode: 'chase' }), // 거리 5 (3+2)
    ];

    const result = dangerZone(pacman, ghosts, 5);
    expect(result).toBe(true);
  });
});

describe('escapePaths', () => {
  it('안전한 방향만 반환', () => {
    const pacman: Position = { x: 1, y: 1 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 1, y: 4, mode: 'chase' }), // 아래쪽 (거리 3)
    ];
    const maze = createTestMaze();

    const result = escapePaths(pacman, ghosts, maze);

    // 아래쪽은 위험 (이동 후 거리 2가 되어 safeRadius=3 이내)
    expect(result).not.toContain('down');
    // 위, 왼쪽, 오른쪽은 안전해야 함
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('up');
  });

  it('벽은 제외', () => {
    const walls: boolean[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
    const row1 = walls[1];
    const row2 = walls[2];
    if (row1 && row2) {
      row1[2] = true; // 위쪽 벽
      row2[3] = true; // 오른쪽 벽
    }

    const pacman: Position = { x: 2, y: 2 };
    const ghosts: GhostState[] = [];
    const maze = createTestMaze({ walls });

    const result = escapePaths(pacman, ghosts, maze);

    // 벽이 있는 방향은 포함되지 않아야 함
    expect(result).not.toContain('up');
    expect(result).not.toContain('right');
    // 아래와 왼쪽은 가능
    expect(result).toContain('down');
    expect(result).toContain('left');
  });

  it('모든 방향이 위험할 때 빈 배열', () => {
    const pacman: Position = { x: 2, y: 2 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 2, y: 0, mode: 'chase' }), // 위
      createTestGhost({ id: 'pinky', x: 2, y: 4, mode: 'chase' }),  // 아래
      createTestGhost({ id: 'inky', x: 0, y: 2, mode: 'chase' }),   // 왼쪽
      createTestGhost({ id: 'clyde', x: 4, y: 2, mode: 'chase' }),  // 오른쪽
    ];
    const maze = createTestMaze();

    const result = escapePaths(pacman, ghosts, maze);

    // 모든 방향이 위험하므로 빈 배열
    expect(result).toEqual([]);
  });

  it('frightened 고스트는 안전', () => {
    const pacman: Position = { x: 2, y: 2 };
    const ghosts: GhostState[] = [
      createTestGhost({ id: 'blinky', x: 2, y: 0, mode: 'frightened' }), // 위쪽 (무시)
    ];
    const maze = createTestMaze();

    const result = escapePaths(pacman, ghosts, maze);

    // frightened 고스트는 위험하지 않으므로 모든 방향 안전
    expect(result).toContain('up');
    expect(result).toContain('down');
    expect(result).toContain('left');
    expect(result).toContain('right');
  });

  it('경계 밖은 제외', () => {
    const pacman: Position = { x: 0, y: 0 };
    const ghosts: GhostState[] = [];
    const maze = createTestMaze();

    const result = escapePaths(pacman, ghosts, maze);

    // 왼쪽과 위쪽은 경계 밖
    expect(result).not.toContain('left');
    expect(result).not.toContain('up');
    // 오른쪽과 아래는 가능
    expect(result).toContain('right');
    expect(result).toContain('down');
  });
});

describe('pelletCluster', () => {
  it('인접 펠릿 클러스터 정확히 분리', () => {
    const pellets: boolean[][] = [
      [true, true, false, true, false],  // 클러스터 1: (0,0)(1,0)  클러스터 2: (3,0)
      [true, false, false, true, false], // 클러스터 1: (0,1)       클러스터 2: (3,1)
      [false, false, false, false, false],
      [false, false, true, true, false], // 클러스터 3: (2,3)(3,3)
      [false, false, true, false, false], // 클러스터 3: (2,4)
    ];

    const maze = createTestMaze({ pellets });
    const result = pelletCluster(maze, 1);

    // 3개의 클러스터가 있어야 함
    expect(result.length).toBe(3);

    // 각 클러스터 크기 검증
    const sizes = result.map(cluster => cluster.length).sort();
    expect(sizes).toEqual([2, 3, 3]); // (3,0)(3,1), (0,0)(1,0)(0,1), (2,3)(3,3)(2,4)
  });

  it('minSize 필터 적용', () => {
    const pellets: boolean[][] = [
      [true, true, false, true, false],  // 클러스터 1: 3개
      [true, false, false, false, false],
      [false, false, false, false, false],
      [false, false, true, true, false], // 클러스터 2: 3개
      [false, false, true, false, false],
    ];

    const maze = createTestMaze({ pellets });
    const result = pelletCluster(maze, 3);

    // minSize=3이므로 크기 3 이상만 반환
    expect(result.length).toBe(2);
    result.forEach(cluster => {
      expect(cluster.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('펠릿 없을 때 빈 배열', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => false)
    );

    const maze = createTestMaze({ pellets });
    const result = pelletCluster(maze, 1);

    expect(result).toEqual([]);
  });

  it('모든 펠릿이 하나의 큰 클러스터', () => {
    const pellets: boolean[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => true)
    );

    const maze = createTestMaze({ pellets });
    const result = pelletCluster(maze, 1);

    // 하나의 클러스터
    expect(result.length).toBe(1);
    // 25개 펠릿 모두 포함
    const firstCluster = result[0];
    expect(firstCluster).toBeDefined();
    if (firstCluster) {
      expect(firstCluster.length).toBe(25);
    }
  });

  it('대각선은 인접하지 않음 (4방향만)', () => {
    const pellets: boolean[][] = [
      [true, false, true, false, false],  // (0,0), (2,0)
      [false, true, false, false, false], // (1,1)
      [true, false, true, false, false],  // (0,2), (2,2)
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];

    const maze = createTestMaze({ pellets });
    const result = pelletCluster(maze, 1);

    // 대각선은 연결되지 않으므로 5개의 독립 클러스터
    expect(result.length).toBe(5);
    result.forEach(cluster => {
      expect(cluster.length).toBe(1);
    });
  });

  it('복잡한 L자 형태 클러스터', () => {
    const pellets: boolean[][] = [
      [true, true, true, false, false],  // 가로 3개
      [false, false, true, false, false], // 세로 연결
      [false, false, true, false, false], // 세로 연결
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];

    const maze = createTestMaze({ pellets });
    const result = pelletCluster(maze, 1);

    // 하나의 L자 클러스터
    expect(result.length).toBe(1);
    const firstCluster = result[0];
    expect(firstCluster).toBeDefined();
    if (firstCluster) {
      expect(firstCluster.length).toBe(5);
    }
  });
});
