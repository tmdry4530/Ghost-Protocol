import { GhostAgent } from '../GhostAgent.js';
import type { GameState, AgentAction } from '@ghost-protocol/shared';
import { nearestPellet } from '../helpers/nearestPellet.js';
import { pathfind } from '../helpers/pathfind.js';

/**
 * 탐욕 에이전트
 *
 * 항상 가장 가까운 펠릿을 향해 이동합니다.
 * 고스트를 무시하고 오직 점수 획득에 집중하는 단순한 전략입니다.
 */
export class GreedyAgent extends GhostAgent {
  constructor() {
    super('GreedyAgent');
  }

  onGameState(state: GameState): AgentAction {
    // 가장 가까운 펠릿 찾기
    const target = nearestPellet(state.pacman, state.maze);

    if (target) {
      // A* 경로 탐색
      const path = pathfind(state.pacman, target, state.maze);
      const firstDirection = path[0];
      if (firstDirection !== undefined) {
        return { direction: firstDirection };
      }
    }

    // 펠릿이 없으면 현재 방향 유지
    return { direction: state.pacman.direction };
  }
}
