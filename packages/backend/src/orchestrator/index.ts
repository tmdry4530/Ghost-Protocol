/**
 * 오케스트레이터 배럴 익스포트
 * 토너먼트 관리, 매치 스케줄링, 배팅 오케스트레이션, 결과 검증 모듈
 */

export { ArenaManager } from './ArenaManager.js';
export type { ArenaManagerConfig } from './ArenaManager.js';

export { MatchScheduler } from './MatchScheduler.js';
export type {
  MatchSchedulerConfig,
  MatchJobData,
  MatchJobResult,
  MatchCompleteCallback,
} from './MatchScheduler.js';

export { InMemoryMatchScheduler } from './InMemoryMatchScheduler.js';
export type {
  MatchJobData as InMemoryMatchJobData,
  MatchJobResult as InMemoryMatchJobResult,
  MatchCompleteCallback as InMemoryMatchCompleteCallback,
} from './InMemoryMatchScheduler.js';

export { BettingOrchestrator } from './BettingOrchestrator.js';
export type { BettingOrchestratorConfig } from './BettingOrchestrator.js';

export { ResultVerifier } from './ResultVerifier.js';
export type { ResultVerifierConfig, MatchResultData } from './ResultVerifier.js';
