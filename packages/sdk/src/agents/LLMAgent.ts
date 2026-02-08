import { GhostAgent } from '../GhostAgent.js';
import type { GameState, AgentAction, Direction } from '@ghost-protocol/shared';
import { nearestPellet } from '../helpers/nearestPellet.js';
import { pathfind } from '../helpers/pathfind.js';
import { dangerZone } from '../helpers/dangerZone.js';
import { escapePaths } from '../helpers/escapePaths.js';

/** LLM 에이전트 설정 */
export interface LLMAgentConfig {
  /** Claude API 키 (선택) */
  readonly apiKey?: string;
  /** 사용할 모델 (기본값: 'claude-sonnet-4-20250514') */
  readonly model?: string;
  /** LLM 분석 간격 (틱 단위, 기본값: 60) */
  readonly analysisInterval?: number;
}

/** 전략 유형 */
type Strategy = 'aggressive' | 'defensive' | 'balanced';

/** 위험 감지 반경 */
const DANGER_RADIUS = 5;

/**
 * LLM 기반 적응형 에이전트
 *
 * Claude API를 사용하여 게임 상황을 분석하고 전략을 동적으로 조정합니다.
 *
 * API 키가 없으면 'balanced' 전략으로 폴백합니다.
 *
 * 전략 종류:
 * - aggressive: 파워 펠릿 우선, 고스트 사냥 (AggressiveAgent와 유사)
 * - defensive: 위험 회피 우선 (SafetyAgent와 유사)
 * - balanced: 위험 체크 후 탐욕 수집 (혼합)
 */
export class LLMAgent extends GhostAgent {
  private readonly config: Required<LLMAgentConfig>;
  private currentStrategy: Strategy = 'balanced';
  private lastAnalysisTick = 0;
  private pendingAnalysis = false;

  constructor(config: LLMAgentConfig = {}) {
    super('LLMAgent');

    this.config = {
      apiKey: config.apiKey ?? '',
      model: config.model ?? 'claude-sonnet-4-20250514',
      analysisInterval: config.analysisInterval ?? 60,
    };
  }

  onGameState(state: GameState): AgentAction {
    // LLM 분석 트리거 (비동기, 논블로킹)
    if (
      this.config.apiKey &&
      !this.pendingAnalysis &&
      state.tick - this.lastAnalysisTick >= this.config.analysisInterval
    ) {
      this.lastAnalysisTick = state.tick;
      this.pendingAnalysis = true;

      const summary = this.buildStateSummary(state);
      void this.analyzeState(summary)
        .then((newStrategy) => {
          this.currentStrategy = newStrategy;
          this.pendingAnalysis = false;
        })
        .catch(() => {
          // 에러 시 현재 전략 유지
          this.pendingAnalysis = false;
        });
    }

    // 현재 전략에 따라 행동 실행
    return this.executeStrategy(state, this.currentStrategy);
  }

  /**
   * 전략 실행
   */
  private executeStrategy(state: GameState, strategy: Strategy): AgentAction {
    const { pacman, ghosts, maze } = state;

    switch (strategy) {
      case 'aggressive': {
        return this.aggressiveAction(state);
      }

      case 'defensive': {
        return this.defensiveAction(state);
      }

      case 'balanced':
      default: {
        // 위험 체크 후 탐욕 수집
        if (dangerZone(pacman, ghosts, DANGER_RADIUS)) {
          const safeDirs = escapePaths(pacman, ghosts, maze);
          if (safeDirs.length > 0) {
            const target = nearestPellet(pacman, maze);
            if (target) {
              const bestDir = this.pickBestSafeDirection(safeDirs, pacman, target);
              return {
                direction: bestDir,
                metadata: { confidence: 0.75, strategy: 'balanced_escape' },
              };
            }
            const firstSafeDir = safeDirs[0];
            if (firstSafeDir !== undefined) {
              return {
                direction: firstSafeDir,
                metadata: { confidence: 0.7, strategy: 'balanced_escape' },
              };
            }
          }
        }

        // 안전하면 탐욕
        const target = nearestPellet(pacman, maze);
        if (target) {
          const path = pathfind(pacman, target, maze);
          const firstDirection = path[0];
          if (firstDirection !== undefined) {
            return {
              direction: firstDirection,
              metadata: { confidence: 0.8, strategy: 'balanced_greedy' },
            };
          }
        }

        return {
          direction: pacman.direction,
          metadata: { confidence: 0.5, strategy: 'balanced_idle' },
        };
      }
    }
  }

  /**
   * 공격형 행동 (AggressiveAgent 로직)
   */
  private aggressiveAction(state: GameState): AgentAction {
    const { pacman, maze, powerActive, ghosts } = state;

    // 파워 펠릿 우선
    if (!powerActive && maze.powerPellets.length > 0) {
      const firstPowerPellet = maze.powerPellets[0];
      if (firstPowerPellet !== undefined) {
        let nearest = firstPowerPellet;
        let minDist = Math.abs(nearest.x - pacman.x) + Math.abs(nearest.y - pacman.y);

        for (const pp of maze.powerPellets) {
          const dist = Math.abs(pp.x - pacman.x) + Math.abs(pp.y - pacman.y);
          if (dist < minDist) {
            minDist = dist;
            nearest = pp;
          }
        }

        const path = pathfind(pacman, nearest, maze);
        const firstDirection = path[0];
        if (firstDirection !== undefined) {
          return {
            direction: firstDirection,
            metadata: { confidence: 0.95, strategy: 'aggressive_power' },
          };
        }
      }
    }

    // 고스트 사냥
    if (powerActive) {
      const frightened = ghosts.filter((g) => g.mode === 'frightened');
      const firstFrightened = frightened[0];
      if (firstFrightened !== undefined) {
        const path = pathfind(pacman, { x: firstFrightened.x, y: firstFrightened.y }, maze);
        const firstDirection = path[0];
        if (firstDirection !== undefined) {
          return {
            direction: firstDirection,
            metadata: { confidence: 0.9, strategy: 'aggressive_hunt' },
          };
        }
      }
    }

    // 일반 펠릿
    const target = nearestPellet(pacman, maze);
    if (target) {
      const path = pathfind(pacman, target, maze);
      const firstDirection = path[0];
      if (firstDirection !== undefined) {
        return {
          direction: firstDirection,
          metadata: { confidence: 0.7, strategy: 'aggressive_collect' },
        };
      }
    }

    return {
      direction: pacman.direction,
      metadata: { confidence: 0.5, strategy: 'aggressive_idle' },
    };
  }

  /**
   * 방어형 행동 (SafetyAgent 로직)
   */
  private defensiveAction(state: GameState): AgentAction {
    const { pacman, ghosts, maze } = state;

    if (dangerZone(pacman, ghosts, DANGER_RADIUS)) {
      const safeDirs = escapePaths(pacman, ghosts, maze);
      if (safeDirs.length > 0) {
        const target = nearestPellet(pacman, maze);
        if (target !== null) {
          const bestDir = this.pickBestSafeDirection(safeDirs, pacman, target);
          return {
            direction: bestDir,
            metadata: { confidence: 0.85, strategy: 'defensive_escape' },
          };
        }
        const firstSafeDir = safeDirs[0];
        if (firstSafeDir !== undefined) {
          return {
            direction: firstSafeDir,
            metadata: { confidence: 0.8, strategy: 'defensive_escape' },
          };
        }
      }
    }

    const target = nearestPellet(pacman, maze);
    if (target) {
      const path = pathfind(pacman, target, maze);
      const firstDirection = path[0];
      if (firstDirection !== undefined) {
        return {
          direction: firstDirection,
          metadata: { confidence: 0.75, strategy: 'defensive_collect' },
        };
      }
    }

    return {
      direction: pacman.direction,
      metadata: { confidence: 0.5, strategy: 'defensive_idle' },
    };
  }

  /**
   * 안전한 방향 중 목표에 가장 가까운 방향 선택
   */
  private pickBestSafeDirection(
    safeDirs: readonly Direction[],
    pacman: { readonly x: number; readonly y: number; readonly direction: Direction },
    target: { readonly x: number; readonly y: number },
  ): Direction {
    const vectors: Record<Direction, { dx: number; dy: number }> = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };

    const firstSafeDir = safeDirs[0];
    if (firstSafeDir === undefined) {
      return pacman.direction as Direction;
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

  /**
   * LLM 분석 실행 (테스트에서 오버라이드 가능)
   *
   * @param summary 게임 상태 요약 텍스트
   * @returns 선택된 전략
   */
  protected async analyzeState(summary: string): Promise<Strategy> {
    if (!this.config.apiKey) {
      return 'balanced';
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: `${summary}\n\n위 팩맨 게임 상황을 분석하고 가장 적합한 전략을 선택하세요.\n- aggressive: 파워 펠릿 우선, 고스트 사냥\n- defensive: 위험 회피 우선\n- balanced: 균형잡힌 접근\n\n응답은 전략 이름만 한 단어로 답하세요.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        return 'balanced';
      }

      const data = await response.json() as { content: Array<{ text: string }> };
      const text = data.content[0]?.text.toLowerCase().trim() ?? '';

      if (text.includes('aggressive')) return 'aggressive';
      if (text.includes('defensive')) return 'defensive';
      return 'balanced';
    } catch {
      return 'balanced';
    }
  }

  /**
   * 게임 상태 요약 생성
   */
  private buildStateSummary(state: GameState): string {
    const { tick, round, score, lives, pacman, ghosts, powerActive, powerTimeRemaining } = state;

    const ghostModes = ghosts.map((g) => `${g.id}:${g.mode}`).join(', ');
    const dangerousGhosts = ghosts.filter(
      (g) => g.mode !== 'frightened' && g.mode !== 'eaten'
    ).length;

    return [
      `틱: ${String(tick)}, 라운드: ${String(round)}, 점수: ${String(score)}, 생명: ${String(lives)}`,
      `팩맨 위치: (${String(pacman.x)}, ${String(pacman.y)})`,
      `파워 모드: ${powerActive ? `활성 (남은 시간: ${String(powerTimeRemaining)})` : '비활성'}`,
      `고스트: ${ghostModes}`,
      `위험 고스트 수: ${String(dangerousGhosts)}`,
    ].join('\n');
  }
}
