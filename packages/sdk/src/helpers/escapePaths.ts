import type { Position, Direction, GhostState, MazeData } from '@ghost-protocol/shared';
import { ghostDistance } from './ghostDistance.js';

/** 방향별 이동 벡터 */
const DIRECTION_VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * 안전한 탈출 경로 탐색
 *
 * 각 방향으로 3타일 이내에 비겁먹음 고스트가 없는
 * 안전한 이동 방향을 반환합니다.
 *
 * @param pacman 팩맨 위치
 * @param ghosts 모든 고스트 상태 배열
 * @param maze 미로 데이터
 * @returns 안전한 이동 방향 배열
 */
export function escapePaths(
  pacman: Position,
  ghosts: readonly GhostState[],
  maze: MazeData,
): Direction[] {
  /** 위험 감지 범위 (타일) */
  const safeRadius = 3;
  const safeDirections: Direction[] = [];

  for (const [dir, vec] of Object.entries(DIRECTION_VECTORS) as [Direction, Position][]) {
    const nextX = pacman.x + vec.x;
    const nextY = pacman.y + vec.y;

    // 범위 확인
    if (nextX < 0 || nextX >= maze.width || nextY < 0 || nextY >= maze.height) continue;

    // 벽 확인
    const row = maze.walls[nextY];
    if (row?.[nextX] === true) continue;

    // 해당 방향에 위험한 고스트가 없는지 확인
    const nextPos: Position = { x: nextX, y: nextY };
    const isDangerous = ghosts.some(
      (ghost) =>
        ghost.mode !== 'frightened' &&
        ghost.mode !== 'eaten' &&
        ghostDistance(nextPos, ghost) <= safeRadius,
    );

    if (!isDangerous) {
      safeDirections.push(dir);
    }
  }

  return safeDirections;
}
