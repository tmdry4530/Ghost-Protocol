/**
 * @ghost-protocol/sdk
 * Ghost Protocol 에이전트 개발 키트
 *
 * 팩맨 AI 에이전트를 개발하기 위한 표준 인터페이스와 유틸리티를 제공합니다.
 *
 * @example
 * ```typescript
 * import { GhostAgent, GameState, AgentAction } from '@ghost-protocol/sdk';
 *
 * class MyAgent extends GhostAgent {
 *   onGameState(state: GameState): AgentAction {
 *     return { direction: 'right' };
 *   }
 * }
 * ```
 */

export { GhostAgent } from './GhostAgent.js';
export { AgentClient } from './AgentClient.js';
export { ChallengeClient } from './ChallengeClient.js';
export { pathfind } from './helpers/pathfind.js';
export { nearestPellet } from './helpers/nearestPellet.js';
export { ghostDistance } from './helpers/ghostDistance.js';
export { dangerZone } from './helpers/dangerZone.js';
export { escapePaths } from './helpers/escapePaths.js';
export { pelletCluster } from './helpers/pelletCluster.js';

// 샘플 에이전트
export { GreedyAgent } from './agents/GreedyAgent.js';
export { SafetyAgent } from './agents/SafetyAgent.js';
export { AggressiveAgent } from './agents/AggressiveAgent.js';
export { LLMAgent } from './agents/LLMAgent.js';

// 공유 타입 재수출
export type {
  GameState,
  AgentAction,
  Direction,
  GhostId,
  GhostMode,
  Position,
  PacmanState,
  GhostState,
  MazeData,
  FruitInfo,
  MatchId,
  AgentAddress,
} from '@ghost-protocol/shared';

// SDK 전용 타입
export type { MatchResult } from './GhostAgent.js';
export type { ChallengeClientConfig } from './ChallengeClient.js';
export type { LLMAgentConfig } from './agents/LLMAgent.js';
