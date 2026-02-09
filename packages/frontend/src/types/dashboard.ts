/**
 * 대시보드 타입 정의
 * @ghost-protocol/shared 타입의 로컬 확장 및 mock 데이터용 타입
 */

/** 매치 ID (브랜드 타입) */
export type MatchId = string & { readonly __brand: 'MatchId' };

/** 토너먼트 ID (브랜드 타입) */
export type TournamentId = string & { readonly __brand: 'TournamentId' };

/** 세션 ID (브랜드 타입) */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** 에이전트 주소 (브랜드 타입) */
export type AgentAddress = string & { readonly __brand: 'AgentAddress' };

/** 매치 상태 */
export type MatchStatus = 'pending' | 'betting' | 'active' | 'completed' | 'cancelled';

/** 토너먼트 상태 */
export type TournamentStatus = 'upcoming' | 'active' | 'completed';

/** 서바이벌 세션 상태 */
export type SurvivalStatus = 'waiting' | 'betting' | 'active' | 'completed';

/** 난이도 티어 */
export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

/** 에이전트 정보 */
export interface AgentInfo {
  readonly address: AgentAddress;
  readonly owner: string;
  readonly name: string;
  readonly wins: number;
  readonly losses: number;
  readonly reputation: number;
  readonly active: boolean;
}

/** 매치 정보 */
export interface MatchInfo {
  readonly id: MatchId;
  readonly tournamentId: TournamentId;
  readonly agentA: AgentAddress;
  readonly agentB: AgentAddress;
  readonly agentAName: string;
  readonly agentBName: string;
  readonly scoreA: number;
  readonly scoreB: number;
  readonly winner: AgentAddress | null;
  readonly status: MatchStatus;
}

/** 토너먼트 정보 */
export interface TournamentInfo {
  readonly id: TournamentId;
  readonly participants: readonly AgentAddress[];
  readonly bracketSize: 8 | 16;
  readonly prizePool: bigint;
  readonly status: TournamentStatus;
  readonly createdAt: number;
}

/** 서바이벌 세션 정보 */
export interface SurvivalSessionInfo {
  readonly id: SessionId;
  readonly playerAddress: string;
  readonly difficulty: DifficultyTier;
  readonly score: number;
  readonly status: SurvivalStatus;
  readonly createdAt: number;
}

/** 피드 아이템 타입 */
export type FeedItemType =
  | 'tournament_created'
  | 'tournament_completed'
  | 'tournament_win'
  | 'match_started'
  | 'match_completed'
  | 'record_break'
  | 'big_bet'
  | 'new_agent'
  | 'survival_complete';

/** 피드 아이템 */
export interface FeedItem {
  readonly id: string;
  readonly type: FeedItemType;
  readonly message: string;
  /** @deprecated description 대신 message 사용 권장 */
  readonly description?: string;
  readonly timestamp: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** 에이전트 랭킹 */
export interface AgentRanking {
  readonly rank: number;
  readonly agent: AgentInfo;
  readonly elo: number;
  readonly winRate: number;
}
