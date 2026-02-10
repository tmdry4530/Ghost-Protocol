/**
 * 고스트 AI 컨트롤러
 * 4개의 고스트 AI를 조율하고 난이도에 따라 전략을 조정
 */

import type {
  Direction,
  GhostId,
  GhostMode,
  GhostState,
  PacmanState,
  MazeData,
  Position,
  DifficultyTier,
} from '@ghost-protocol/shared';
import { getDirectionToTarget } from './Pathfinding.js';
import type { GhostPersonalityStrategy } from './GhostPersonality.js';
import { createGhostPersonality, getGhostDirection } from './GhostPersonality.js';
import {
  DifficultyManager,
  createCoordinationStrategy,
} from './DifficultyManager.js';
import type {
  CoordinationStrategy,
  LLMStrategyProvider,
  LLMStrategyRequest,
} from './DifficultyManager.js';

/** 고스트 하우스 입구 위치 */
const GHOST_HOUSE_ENTRANCE: Position = { x: 14, y: 14 };

/** 고스트 AI 총괄 컨트롤러 */
export class GhostAIController {
  private readonly personalities: ReadonlyMap<GhostId, GhostPersonalityStrategy>;
  private readonly difficultyManager: DifficultyManager;
  private readonly coordinationStrategy: CoordinationStrategy;
  private llmProvider: LLMStrategyProvider | null = null;
  private lastLLMTargets: Map<GhostId, Position> = new Map();
  private currentTick = 0;

  /**
   * AI 컨트롤러 생성
   * @param initialRound - 시작 라운드 번호 (난이도 결정에 사용)
   */
  constructor(initialRound: number) {
    // 모든 고스트의 성격 전략 생성
    this.personalities = new Map([
      ['blinky', createGhostPersonality('blinky')],
      ['pinky', createGhostPersonality('pinky')],
      ['inky', createGhostPersonality('inky')],
      ['clyde', createGhostPersonality('clyde')],
    ]);

    // 조정 전략 생성
    this.coordinationStrategy = createCoordinationStrategy();

    // 난이도 매니저 생성 (라운드→티어 변환을 인라인으로 수행)
    const initialTier: DifficultyTier =
      initialRound <= 2 ? 1 : initialRound <= 4 ? 2 : initialRound <= 6 ? 3 : initialRound <= 8 ? 4 : 5;
    this.difficultyManager = new DifficultyManager(initialTier);
  }

  /**
   * LLM 전략 제공자 설정 (선택적)
   * @param provider - LLM 전략 제공자
   */
  setLLMProvider(provider: LLMStrategyProvider): void {
    this.llmProvider = provider;
  }

  /**
   * 라운드 변경 시 난이도 업데이트
   * @param round - 새 라운드 번호
   */
  setRound(round: number): void {
    const newTier = this.getTierForRound(round);
    this.difficultyManager.setTier(newTier);
  }

  /**
   * 라운드 번호로부터 난이도 티어 결정
   * @param round - 라운드 번호
   * @returns 난이도 티어
   */
  private getTierForRound(round: number): DifficultyTier {
    return this.difficultyManager.getTierForRound(round);
  }

  /**
   * 모든 고스트의 다음 이동 방향 계산 (매 틱마다 호출)
   * @param ghosts - 모든 고스트 상태 배열
   * @param pacman - 팩맨 상태
   * @param maze - 미로 데이터
   * @param remainingPellets - 남은 펠릿 개수
   * @param randomFn - 결정론적 RNG 함수
   * @returns 고스트 ID → 이동 방향 맵
   */
  getGhostDirections(
    ghosts: readonly GhostState[],
    pacman: PacmanState,
    maze: MazeData,
    remainingPellets: number,
    randomFn: () => number,
  ): Map<GhostId, Direction | null> {
    // 틱 증가 및 난이도 매니저 업데이트
    this.currentTick++;
    this.difficultyManager.tick();

    // 팩맨 방향 기록 (패턴 인식용)
    this.difficultyManager.recordPacmanDirection(pacman.direction);

    // LLM 호출 타이밍 체크 (비동기 트리거만, 결과는 다음 틱에 사용)
    if (this.difficultyManager.shouldCallLLM(this.currentTick)) {
      void this.triggerLLMStrategy(ghosts, pacman, remainingPellets);
    }

    // 각 고스트의 방향 계산
    const directions = new Map<GhostId, Direction | null>();

    for (const ghost of ghosts) {
      const personality = this.personalities.get(ghost.id);
      if (!personality) {
        directions.set(ghost.id, null);
        continue;
      }

      // 고스트의 실제 모드 결정
      const ghostMode = this.getGhostMode(ghost.mode);

      // eaten 모드: 고스트 하우스로 귀환
      if (ghostMode === 'eaten') {
        const direction = getDirectionToTarget(
          ghost.x,
          ghost.y,
          GHOST_HOUSE_ENTRANCE.x,
          GHOST_HOUSE_ENTRANCE.y,
          maze,
          { canEnterGhostHouse: true },
        );
        directions.set(ghost.id, direction);
        continue;
      }

      // frightened 모드: 랜덤 방향
      if (ghostMode === 'frightened') {
        const direction = getGhostDirection(
          ghost,
          pacman,
          ghosts,
          maze,
          ghostMode,
          personality,
          remainingPellets,
          randomFn,
        );
        directions.set(ghost.id, direction);
        continue;
      }

      // chase 모드에서 조정 전략 또는 LLM 타겟 사용
      if (ghostMode === 'chase') {
        // LLM 타겟이 있으면 우선 사용
        const llmTarget = this.lastLLMTargets.get(ghost.id);
        if (llmTarget !== undefined) {
          const direction = getDirectionToTarget(
            ghost.x,
            ghost.y,
            llmTarget.x,
            llmTarget.y,
            maze,
          );
          directions.set(ghost.id, direction);
          continue;
        }

        // 조정 전략 타겟 사용
        const coordinationTarget = this.getCoordinationTarget(
          ghost.id,
          ghosts,
          pacman,
          maze,
          remainingPellets,
        );
        if (coordinationTarget !== null) {
          const direction = getDirectionToTarget(
            ghost.x,
            ghost.y,
            coordinationTarget.x,
            coordinationTarget.y,
            maze,
          );
          directions.set(ghost.id, direction);
          continue;
        }
      }

      // 기본 성격 기반 방향 계산
      const direction = getGhostDirection(
        ghost,
        pacman,
        ghosts,
        maze,
        ghostMode,
        personality,
        remainingPellets,
        randomFn,
      );
      directions.set(ghost.id, direction);
    }

    return directions;
  }

  /**
   * LLM 전략 비동기 트리거 (fire-and-forget)
   * @param ghosts - 모든 고스트 상태
   * @param pacman - 팩맨 상태
   * @param remainingPellets - 남은 펠릿 개수
   */
  async triggerLLMStrategy(
    ghosts: readonly GhostState[],
    pacman: PacmanState,
    remainingPellets: number,
  ): Promise<void> {
    if (this.llmProvider === null) {
      return;
    }

    try {
      const request: LLMStrategyRequest = {
        pacmanPosition: { x: pacman.x, y: pacman.y },
        pacmanDirection: pacman.direction,
        ghostPositions: new Map(ghosts.map((g) => [g.id, { x: g.x, y: g.y }])),
        recentPacmanMoves: this.difficultyManager.getRecentDirections(),
        remainingPellets,
        currentTick: this.currentTick,
      };

      const response = await this.llmProvider.requestStrategy(request);

      // Cache response targets
      this.lastLLMTargets = new Map(response.ghostTargets);
    } catch (error) {
      // Silently ignore LLM failure (fallback to default AI)
      console.warn('LLM strategy call failed:', error);
    }
  }

  /**
   * 조정 전략에 따른 타겟 위치 계산
   * @param ghostId - 고스트 ID
   * @param ghosts - 모든 고스트 상태
   * @param pacman - 팩맨 상태
   * @param maze - 미로 데이터
   * @param _remainingPellets - 남은 펠릿 개수 (향후 사용)
   * @returns 조정 타겟 위치 또는 null
   */
  private getCoordinationTarget(
    ghostId: GhostId,
    ghosts: readonly GhostState[],
    pacman: PacmanState,
    maze: MazeData,
    _remainingPellets: number,
  ): Position | null {
    if (!this.difficultyManager.isCoordinationEnabled()) {
      return null;
    }

    // 파워업 거부 전략 (Tier 3+)
    if (this.difficultyManager.getPowerUpDenialEnabled()) {
      const powerPellets = maze.powerPellets;
      if (powerPellets.length > 0) {
        const denialTargets = this.coordinationStrategy.getPowerUpDenialTargets(
          powerPellets,
          ghosts,
          maze,
        );
        const target = denialTargets.get(ghostId);
        if (target !== undefined) {
          return target;
        }
      }
    }

    // 포메이션 전략 (Tier 4+)
    if (this.difficultyManager.getFormationsEnabled()) {
      const formationTargets = this.coordinationStrategy.getFormationTargets(
        pacman,
        ghosts,
        maze,
      );
      const target = formationTargets.get(ghostId);
      if (target !== undefined) {
        return target;
      }
    }

    // 핀서 공격 전략 (Tier 3+)
    const pincerTargets = this.coordinationStrategy.getPincerTargets(pacman, ghosts, maze);
    const target = pincerTargets.get(ghostId);
    if (target !== undefined) {
      return target;
    }

    return null;
  }

  /**
   * 고스트의 실제 모드 결정 (chase/scatter 전환 고려)
   * @param ghostCurrentMode - 고스트의 현재 모드
   * @returns 적용할 모드
   */
  getGhostMode(ghostCurrentMode: GhostMode): GhostMode {
    // frightened나 eaten 상태는 그대로 유지
    if (ghostCurrentMode === 'frightened' || ghostCurrentMode === 'eaten') {
      return ghostCurrentMode;
    }

    // 난이도 매니저의 현재 모드 반환
    return this.difficultyManager.getCurrentMode();
  }

  /**
   * 고스트의 속도 배율 계산 (Cruise Elroy 고려)
   * @param ghostId - 고스트 ID
   * @param _remainingPellets - 남은 펠릿 개수 (향후 사용)
   * @returns 속도 배율
   */
  getSpeedMultiplier(ghostId: GhostId, _remainingPellets: number): number {
    if (!this.difficultyManager.getCruiseElroyEnabled()) {
      return 1.0;
    }

    const personality = this.personalities.get(ghostId);
    if (!personality) {
      return 1.0;
    }

    return personality.getCruiseElroyMultiplier(_remainingPellets);
  }

  /**
   * 현재 난이도 티어 반환
   * @returns 현재 난이도 티어
   */
  getCurrentTier(): DifficultyTier {
    return this.difficultyManager.getCurrentTier();
  }

  /**
   * 난이도 매니저 접근자 (테스트용)
   * @returns 난이도 매니저 인스턴스
   */
  getDifficultyManager(): DifficultyManager {
    return this.difficultyManager;
  }

  /**
   * 새 라운드를 위한 리셋
   * @param round - 새 라운드 번호
   */
  reset(round: number): void {
    this.currentTick = 0;
    this.lastLLMTargets.clear();
    this.setRound(round);
  }
}
