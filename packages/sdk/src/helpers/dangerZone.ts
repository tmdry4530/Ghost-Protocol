import type { Position, GhostState } from '@ghost-protocol/shared';
import { ghostDistance } from './ghostDistance.js';

/**
 * 위험 영역 감지
 *
 * 지정된 반경 내에 비겁먹음(non-frightened) 상태의
 * 고스트가 있는지 확인합니다.
 *
 * @param pacman 팩맨 위치
 * @param ghosts 모든 고스트 상태 배열
 * @param radius 감지 반경 (타일 수)
 * @returns 위험 영역 내 고스트 존재 여부
 */
export function dangerZone(
  pacman: Position,
  ghosts: readonly GhostState[],
  radius: number,
): boolean {
  return ghosts.some(
    (ghost) =>
      ghost.mode !== 'frightened' &&
      ghost.mode !== 'eaten' &&
      ghostDistance(pacman, ghost) <= radius,
  );
}
