import type { Position, GhostState } from '@ghost-protocol/shared';

/**
 * 팩맨과 고스트 간의 맨해튼 거리 계산
 *
 * @param pacman 팩맨 위치
 * @param ghost 고스트 상태
 * @returns 맨해튼 거리 (타일 수)
 */
export function ghostDistance(pacman: Position, ghost: GhostState): number {
  return Math.abs(pacman.x - ghost.x) + Math.abs(pacman.y - ghost.y);
}
