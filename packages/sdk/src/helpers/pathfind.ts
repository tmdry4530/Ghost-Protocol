import type { Position, MazeData, Direction } from '@ghost-protocol/shared';
import { MAZE_WIDTH, MAZE_HEIGHT } from '@ghost-protocol/shared';

/**
 * A* 경로 탐색 알고리즘
 *
 * 미로 그리드에서 시작점에서 목표점까지의 최단 경로를 찾습니다.
 * 터널 래핑을 지원하며 맨해튼 휴리스틱을 사용합니다.
 *
 * @param from 시작 위치
 * @param to 목표 위치
 * @param maze 미로 데이터
 * @returns 이동 방향 배열 (최단 경로). 경로가 없으면 빈 배열.
 */
export function pathfind(from: Position, to: Position, maze: MazeData): Direction[] {
  // 같은 위치인 경우 빈 배열 반환
  if (from.x === to.x && from.y === to.y) return [];

  // A* 노드 타입
  interface AStarNode {
    readonly pos: Position;
    readonly g: number; // 시작점부터의 실제 비용
    readonly h: number; // 목표점까지의 추정 비용 (휴리스틱)
    readonly f: number; // g + h
    readonly parent: AStarNode | null;
  }

  // 맨해튼 거리 휴리스틱 (터널 래핑 고려)
  const heuristic = (pos: Position, goal: Position): number => {
    const dx = Math.abs(pos.x - goal.x);
    const dy = Math.abs(pos.y - goal.y);

    // y === 14는 터널 행이므로 x축 래핑 고려
    const wrappedDx = pos.y === 14 && goal.y === 14
      ? Math.min(dx, MAZE_WIDTH - dx)
      : dx;

    return wrappedDx + dy;
  };

  // 노드 생성 헬퍼
  const createNode = (pos: Position, g: number, parent: AStarNode | null): AStarNode => {
    const h = heuristic(pos, to);
    return { pos, g, h, f: g + h, parent };
  };

  // 위치를 문자열 키로 변환 (맵 키로 사용)
  const posKey = (pos: Position): string => `${String(pos.x)},${String(pos.y)}`;

  // 우선순위 큐 (최소 힙) - f 값이 작은 노드가 우선
  class MinHeap {
    private heap: AStarNode[] = [];

    push(node: AStarNode): void {
      this.heap.push(node);
      this.bubbleUp(this.heap.length - 1);
    }

    pop(): AStarNode | undefined {
      if (this.heap.length === 0) return undefined;
      if (this.heap.length === 1) return this.heap.pop();

      const min = this.heap[0];
      const lastNode = this.heap.pop();
      if (lastNode !== undefined && this.heap.length > 0) {
        this.heap[0] = lastNode;
        this.bubbleDown(0);
      }
      return min;
    }

    isEmpty(): boolean {
      return this.heap.length === 0;
    }

    private bubbleUp(index: number): void {
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        const current = this.heap[index];
        const parent = this.heap[parentIndex];
        if (current === undefined || parent === undefined) break;
        if (current.f >= parent.f) break;
        this.heap[index] = parent;
        this.heap[parentIndex] = current;
        index = parentIndex;
      }
    }

    private bubbleDown(index: number): void {
      const heapLength = this.heap.length;
      while (index < heapLength) {
        const leftChild = 2 * index + 1;
        const rightChild = 2 * index + 2;
        let smallest = index;

        const currentSmallest = this.heap[smallest];
        const leftNode = this.heap[leftChild];
        const rightNode = this.heap[rightChild];

        if (leftNode !== undefined && currentSmallest !== undefined && leftNode.f < currentSmallest.f) {
          smallest = leftChild;
        }
        const newSmallest = this.heap[smallest];
        if (rightNode !== undefined && newSmallest !== undefined && rightNode.f < newSmallest.f) {
          smallest = rightChild;
        }
        if (smallest === index) break;

        const indexNode = this.heap[index];
        const smallestNode = this.heap[smallest];
        if (indexNode === undefined || smallestNode === undefined) break;
        this.heap[index] = smallestNode;
        this.heap[smallest] = indexNode;
        index = smallest;
      }
    }
  }

  // 벽 체크 헬퍼
  const isWall = (pos: Position): boolean => {
    if (pos.y < 0 || pos.y >= MAZE_HEIGHT) return true;
    // x는 터널에서 래핑되므로 범위 체크 생략
    const wrappedX = ((pos.x % MAZE_WIDTH) + MAZE_WIDTH) % MAZE_WIDTH;
    return maze.walls[pos.y]?.[wrappedX] ?? true;
  };

  // 이웃 노드 생성 (4방향)
  const getNeighbors = (node: AStarNode): AStarNode[] => {
    const neighbors: AStarNode[] = [];
    const { pos, g } = node;

    const directions: ReadonlyArray<{ readonly dir: Direction; readonly dx: number; readonly dy: number }> = [
      { dir: 'up', dx: 0, dy: -1 },
      { dir: 'down', dx: 0, dy: 1 },
      { dir: 'left', dx: -1, dy: 0 },
      { dir: 'right', dx: 1, dy: 0 },
    ];

    for (const { dx, dy } of directions) {
      let newX = pos.x + dx;
      const newY = pos.y + dy;

      // y === 14 터널 행에서 x 래핑 처리
      if (newY === 14) {
        newX = ((newX % MAZE_WIDTH) + MAZE_WIDTH) % MAZE_WIDTH;
      }

      const newPos: Position = { x: newX, y: newY };

      // 경계 체크 (터널 제외)
      if (newY !== 14 && (newX < 0 || newX >= MAZE_WIDTH)) continue;

      // 벽 체크
      if (isWall(newPos)) continue;

      // 이동 비용은 1 (균일 그리드)
      neighbors.push(createNode(newPos, g + 1, node));
    }

    return neighbors;
  };

  // A* 메인 루프
  const openSet = new MinHeap();
  const closedSet = new Set<string>();
  const gScores = new Map<string, number>();

  const startNode = createNode(from, 0, null);
  openSet.push(startNode);
  gScores.set(posKey(from), 0);

  while (!openSet.isEmpty()) {
    const current = openSet.pop();
    if (current === undefined) break;
    const currentKey = posKey(current.pos);

    // 목표 도달
    if (current.pos.x === to.x && current.pos.y === to.y) {
      return reconstructPath(current);
    }

    // 이미 처리된 노드는 스킵
    if (closedSet.has(currentKey)) continue;
    closedSet.add(currentKey);

    // 이웃 탐색
    for (const neighbor of getNeighbors(current)) {
      const neighborKey = posKey(neighbor.pos);

      // 이미 처리된 노드는 스킵
      if (closedSet.has(neighborKey)) continue;

      // 더 나은 경로를 찾은 경우에만 업데이트
      const existingG = gScores.get(neighborKey);
      if (existingG === undefined || neighbor.g < existingG) {
        gScores.set(neighborKey, neighbor.g);
        openSet.push(neighbor);
      }
    }
  }

  // 경로를 찾지 못한 경우 빈 배열 반환
  return [];
}

/**
 * 부모 노드를 역추적하여 방향 배열 생성
 */
function reconstructPath(goalNode: {
  readonly pos: Position;
  readonly parent: { readonly pos: Position; readonly parent: unknown } | null;
}): Direction[] {
  const path: Direction[] = [];
  let current: { readonly pos: Position; readonly parent: unknown } = goalNode;

  while (current.parent !== null && current.parent !== undefined) {
    const parent = current.parent as { readonly pos: Position; readonly parent: unknown };

    const dx = current.pos.x - parent.pos.x;
    const dy = current.pos.y - parent.pos.y;

    // 터널 래핑으로 인한 큰 차이 처리
    let direction: Direction;
    if (Math.abs(dx) > 1) {
      // 터널 래핑 발생 (예: -27 또는 +27)
      direction = dx > 0 ? 'left' : 'right';
    } else if (dx === 1) {
      direction = 'right';
    } else if (dx === -1) {
      direction = 'left';
    } else if (dy === 1) {
      direction = 'down';
    } else if (dy === -1) {
      direction = 'up';
    } else {
      // 이론적으로 도달 불가
      direction = 'up';
    }

    path.unshift(direction);
    current = parent;
  }

  return path;
}
