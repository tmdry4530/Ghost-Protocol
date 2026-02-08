import { GhostAgent } from '../GhostAgent.js';
import type { GameState, AgentAction, Direction } from '@ghost-protocol/shared';
import { nearestPellet } from '../helpers/nearestPellet.js';
import { pathfind } from '../helpers/pathfind.js';
import { dangerZone } from '../helpers/dangerZone.js';
import { escapePaths } from '../helpers/escapePaths.js';

/** 위험 감지 반경 */
const DANGER_RADIUS = 5;

/**
 * 안전 우선 에이전트
 *
 * 고스트를 먼저 회피한 후 펠릿을 수집합니다.
 * 위험 반경 내에 고스트가 있으면 탈출 경로를 우선합니다.
 */
export class SafetyAgent extends GhostAgent {
  constructor() {
    super('SafetyAgent');
  }

  onGameState(state: GameState): AgentAction {
    const { pacman, ghosts, maze } = state;

    // 위험 영역 체크
    if (dangerZone(pacman, ghosts, DANGER_RADIUS)) {
      // 안전한 탈출 경로 찾기
      const safeDirs = escapePaths(pacman, ghosts, maze);

      if (safeDirs.length > 0) {
        // 안전한 방향 중 펠릿에 가까운 방향 선택
        const target = nearestPellet(pacman, maze);
        if (target) {
          const bestDir = this.pickBestSafeDirection(safeDirs, pacman, target);
          return { direction: bestDir };
        }
        // 펠릿 없으면 첫 번째 안전 방향
        const firstSafeDir = safeDirs[0];
        if (firstSafeDir !== undefined) {
          return { direction: firstSafeDir };
        }
      }
    }

    // 안전하면 가장 가까운 펠릿 추적
    const target = nearestPellet(pacman, maze);
    if (target) {
      const path = pathfind(pacman, target, maze);
      const firstDirection = path[0];
      if (firstDirection !== undefined) {
        return { direction: firstDirection };
      }
    }

    return { direction: pacman.direction };
  }

  /**
   * 안전한 방향 중 목표에 가장 가까운 방향 선택
   */
  private pickBestSafeDirection(
    safeDirs: readonly Direction[],
    pacman: { readonly x: number; readonly y: number },
    target: { readonly x: number; readonly y: number },
  ): Direction {
    // Direction vectors
    const vectors: Record<Direction, { dx: number; dy: number }> = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };

    const firstSafeDir = safeDirs[0];
    if (firstSafeDir === undefined) {
      return 'up' as Direction;
    }

    let bestDir = firstSafeDir;
    let bestDist = Infinity;

    for (const dir of safeDirs) {
      const vec = vectors[dir];
      const newX = pacman.x + vec.dx;
      const newY = pacman.y + vec.dy;
      const dist = Math.abs(newX - target.x) + Math.abs(newY - target.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    }

    return bestDir;
  }
}
