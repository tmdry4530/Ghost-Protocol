import type { GameState, AgentAction, MatchId } from '@ghost-protocol/shared';

/**
 * 매치 결과 정보
 */
export interface MatchResult {
  /** 매치 식별자 */
  readonly matchId: MatchId;
  /** 승리 여부 */
  readonly won: boolean;
  /** 최종 점수 */
  readonly finalScore: number;
  /** 상대 점수 */
  readonly opponentScore: number;
}

/**
 * Ghost Protocol 에이전트 추상 클래스
 *
 * 팩맨 플레이 에이전트를 개발하려면 이 클래스를 확장하고
 * `onGameState` 메서드를 구현하세요.
 *
 * 매 틱(16ms)마다 현재 게임 상태가 `onGameState`로 전달되며,
 * 에이전트는 100ms 이내에 행동(방향)을 반환해야 합니다.
 *
 * @example
 * ```typescript
 * class GreedyAgent extends GhostAgent {
 *   onGameState(state: GameState): AgentAction {
 *     // 가장 가까운 펠릿으로 이동
 *     const target = nearestPellet(state.pacman, state.maze);
 *     if (target) {
 *       const path = pathfind(state.pacman, target, state.maze);
 *       if (path.length > 0) return { direction: path[0] };
 *     }
 *     return { direction: 'right' };
 *   }
 * }
 * ```
 */
export abstract class GhostAgent {
  /** 에이전트 이름 */
  readonly name: string;

  /**
   * 에이전트 생성
   * @param name 에이전트 이름 (온체인 등록 시 사용)
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * 게임 상태 수신 및 행동 결정 (필수 구현)
   *
   * 매 틱마다 호출됩니다. 100ms 이내에 행동을 반환해야 합니다.
   * 타임아웃 시 해당 틱의 행동이 무시됩니다.
   *
   * @param state 현재 게임 상태
   * @returns 에이전트 행동 (이동 방향)
   */
  abstract onGameState(state: GameState): AgentAction;

  /**
   * 매치 시작 알림 (선택 구현)
   * @param matchId 매치 식별자
   */
  onMatchStart?(matchId: MatchId): void;

  /**
   * 매치 종료 알림 (선택 구현)
   * @param result 매치 결과
   */
  onMatchEnd?(result: MatchResult): void;

  /**
   * 라운드 시작 알림 (선택 구현)
   * @param round 라운드 번호
   */
  onRoundStart?(round: number): void;

  /**
   * 에러 발생 알림 (선택 구현)
   * @param error 에러 객체
   */
  onError?(error: Error): void;
}
