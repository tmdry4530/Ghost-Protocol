import { GhostAgent } from '../GhostAgent.js';
import type { GameState, AgentAction, Position, PacmanState, MazeData, GhostState } from '@ghost-protocol/shared';
import { nearestPellet } from '../helpers/nearestPellet.js';
import { pathfind } from '../helpers/pathfind.js';
import { ghostDistance } from '../helpers/ghostDistance.js';

/**
 * 공격형 에이전트
 *
 * 파워 펠릿 우선 추구 → 파워 모드에서 고스트 사냥 → 일반 펠릿 수집 전략
 *
 * 전략 우선순위:
 * 1. 파워 모드가 아니고 파워 펠릿이 있으면 → 가장 가까운 파워 펠릿으로 이동
 * 2. 파워 모드이고 frightened 고스트가 있으면 → 가장 가까운 frightened 고스트 추적
 * 3. 일반 모드 → 가장 가까운 펠릿 수집 (GreedyAgent와 동일)
 */
export class AggressiveAgent extends GhostAgent {
  constructor() {
    super('AggressiveAgent');
  }

  onGameState(state: GameState): AgentAction {
    const { pacman, maze, powerActive } = state;

    // 전략 1: 파워 펠릿 우선 (파워 모드가 아닐 때)
    if (!powerActive) {
      const powerPellet = this.findNearestPowerPellet(pacman, maze);
      if (powerPellet) {
        const path = pathfind(pacman, powerPellet, maze);
        const firstDirection = path[0];
        if (firstDirection !== undefined) {
          return {
            direction: firstDirection,
            metadata: {
              confidence: 0.95,
              strategy: 'hunt_power',
              targetTile: powerPellet,
            },
          };
        }
      }
    }

    // 전략 2: 파워 모드에서 고스트 사냥
    if (powerActive) {
      const frightenedGhost = this.findNearestFrightenedGhost(state);
      if (frightenedGhost) {
        const path = pathfind(pacman, frightenedGhost, maze);
        const firstDirection = path[0];
        if (firstDirection !== undefined) {
          return {
            direction: firstDirection,
            metadata: {
              confidence: 0.9,
              strategy: 'chase_ghost',
              targetTile: frightenedGhost,
            },
          };
        }
      }
    }

    // 전략 3: 일반 펠릿 수집
    const target = nearestPellet(pacman, maze);
    if (target) {
      const path = pathfind(pacman, target, maze);
      const firstDirection = path[0];
      if (firstDirection !== undefined) {
        return {
          direction: firstDirection,
          metadata: {
            confidence: 0.7,
            strategy: 'collect',
            targetTile: target,
          },
        };
      }
    }

    // 펠릿이 없으면 현재 방향 유지
    return {
      direction: pacman.direction,
      metadata: {
        confidence: 0.5,
        strategy: 'collect',
      },
    };
  }

  /**
   * 가장 가까운 파워 펠릿 찾기
   */
  private findNearestPowerPellet(pacman: PacmanState, maze: MazeData): Position | null {
    if (maze.powerPellets.length === 0) return null;

    let nearest: Position | null = null;
    let minDistance = Infinity;

    for (const powerPellet of maze.powerPellets) {
      const distance = Math.abs(powerPellet.x - pacman.x) + Math.abs(powerPellet.y - pacman.y);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = powerPellet;
      }
    }

    return nearest;
  }

  /**
   * 가장 가까운 frightened 고스트 찾기
   */
  private findNearestFrightenedGhost(state: GameState): Position | null {
    const frightenedGhosts = state.ghosts.filter((ghost) => ghost.mode === 'frightened');

    if (frightenedGhosts.length === 0) return null;

    let nearest: GhostState | null = null;
    let minDistance = Infinity;

    for (const ghost of frightenedGhosts) {
      const distance = ghostDistance(state.pacman, ghost);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = ghost;
      }
    }

    return nearest ? { x: nearest.x, y: nearest.y } : null;
  }
}
