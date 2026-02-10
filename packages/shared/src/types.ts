/**
 * Ghost Protocol 공유 타입 정의
 * 모든 패키지에서 사용되는 인터페이스와 타입
 */

// ===== 브랜디드 타입 (Branded Types) =====

/** 매치 고유 식별자 */
export type MatchId = string & { readonly __brand: 'MatchId' };

/** 토너먼트 고유 식별자 */
export type TournamentId = string & { readonly __brand: 'TournamentId' };

/** 서바이벌 세션 고유 식별자 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** 에이전트 주소 식별자 */
export type AgentAddress = string & { readonly __brand: 'AgentAddress' };

/** Moltbook 에이전트 고유 식별자 */
export type MoltbookId = string & { readonly __brand: 'MoltbookId' };

// ===== 기본 열거형 타입 =====

/** 이동 방향 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 고스트 식별자 */
export type GhostId = 'blinky' | 'pinky' | 'inky' | 'clyde';

/** 고스트 행동 모드 */
export type GhostMode = 'chase' | 'scatter' | 'frightened' | 'eaten';

/** 매치 상태 */
export type MatchStatus = 'pending' | 'betting' | 'active' | 'completed' | 'cancelled';

/** 토너먼트 상태 */
export type TournamentStatus = 'upcoming' | 'active' | 'completed';

/** 서바이벌 세션 상태 */
export type SurvivalStatus = 'waiting' | 'betting' | 'active' | 'completed';

/** 난이도 등급 (1~5) */
export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

/** 에이전트 역할 */
export type AgentRole = 'pacman' | 'ghost';

/** 지갑 연결 소스 */
export type WalletSource = 'wagmi' | 'circle';

/** 배팅 방향 */
export type BetSide = 'agentA' | 'agentB' | 'pacman' | 'ghost';

/** 미로 타일 종류 */
export type MazeTile = 'wall' | 'path' | 'pellet' | 'powerPellet' | 'ghostHouse' | 'tunnel';

/** 미로 변형 종류 */
export type MazeVariant = 'classic' | 'labyrinth' | 'speedway' | 'fortress' | 'random';

// ===== 게임 엔티티 인터페이스 =====

/** 2D 위치 좌표 */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** 팩맨 상태 */
export interface PacmanState {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly score: number;
  readonly lives: number;
}

/** 고스트 상태 */
export interface GhostState {
  readonly id: GhostId;
  readonly x: number;
  readonly y: number;
  readonly mode: GhostMode;
}

/** 과일 보너스 정보 */
export interface FruitInfo {
  readonly x: number;
  readonly y: number;
  readonly points: number;
}

/** 미로 정보 */
export interface MazeData {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly (readonly boolean[])[];
  readonly pellets: readonly (readonly boolean[])[];
  readonly powerPellets: readonly Position[];
}

// ===== 게임 상태 인터페이스 =====

/** 게임 전체 상태 (매 틱마다 생성) */
export interface GameState {
  readonly tick: number;
  readonly round: number;
  readonly score: number;
  readonly lives: number;
  readonly pacman: PacmanState;
  readonly ghosts: readonly GhostState[];
  readonly maze: MazeData;
  readonly powerActive: boolean;
  readonly powerTimeRemaining: number;
  readonly fruitAvailable: FruitInfo | null;
  readonly dying?: boolean;
}

/** 에이전트 행동 (매 틱마다 반환) */
export interface AgentAction {
  readonly direction: Direction;
  readonly metadata?: {
    readonly confidence: number;
    readonly strategy: string;
    readonly targetTile?: Position;
  };
}

// ===== 매치 및 토너먼트 인터페이스 =====

/** 등록된 에이전트 정보 */
export interface AgentInfo {
  readonly address: AgentAddress;
  readonly owner: string;
  readonly name: string;
  readonly metadataURI: string;
  readonly wins: number;
  readonly losses: number;
  readonly totalScore: number;
  readonly reputation: number;
  readonly active: boolean;
  // v2 신규 필드
  readonly moltbookId?: MoltbookId;
  readonly moltbookKarma?: number;
  readonly moltbookAvatar?: string;
  readonly role: AgentRole;
  readonly isExternal: boolean;
  readonly ownerXHandle?: string;
}

/** 매치 정보 */
export interface MatchInfo {
  readonly id: MatchId;
  readonly tournamentId: TournamentId;
  readonly agentA: AgentAddress;
  readonly agentB: AgentAddress;
  readonly scoreA: number;
  readonly scoreB: number;
  readonly winner: AgentAddress | null;
  readonly gameLogHash: string;
  readonly replayURI: string;
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

// ===== 배팅 인터페이스 =====

/** 아레나 모드 배팅 정보 */
export interface BetInfo {
  readonly matchId: MatchId;
  readonly bettor: string;
  readonly side: BetSide;
  readonly amount: bigint;
  readonly timestamp: number;
}

/** 배팅 풀 상태 */
export interface BettingPool {
  readonly matchId: MatchId;
  readonly totalPool: bigint;
  readonly sideA: bigint;
  readonly sideB: bigint;
  readonly oddsA: number;
  readonly oddsB: number;
  readonly betCount: number;
  readonly locked: boolean;
}

/** 서바이벌 예측 배팅 */
export interface SurvivalPrediction {
  readonly sessionId: SessionId;
  readonly bettor: string;
  readonly predictedRound: number;
  readonly amount: bigint;
}

// ===== WebSocket 이벤트 페이로드 =====

/** 게임 상태 프레임 (60fps 전송) */
export interface GameStateFrame {
  readonly tick: number;
  readonly pacman: PacmanState;
  readonly ghosts: readonly GhostState[];
  readonly pellets: readonly (readonly boolean[])[];
  readonly powerActive: boolean;
  readonly powerTimeRemaining: number;
}

/** 라운드 시작 이벤트 */
export interface RoundStartEvent {
  readonly round: number;
  readonly difficulty: DifficultyTier;
  readonly mazeId: MazeVariant;
  readonly ghostSpeed: number;
  readonly powerDuration: number;
}

/** 라운드 종료 이벤트 */
export interface RoundEndEvent {
  readonly round: number;
  readonly score: number;
  readonly livesRemaining: number;
  readonly nextDifficulty: DifficultyTier | null;
}

/** 매치 결과 이벤트 */
export interface MatchResultEvent {
  readonly matchId: MatchId;
  readonly winner: AgentAddress;
  readonly scoreA: number;
  readonly scoreB: number;
  readonly gameLogHash: string;
}

/** 배팅 업데이트 이벤트 */
export interface BetUpdateEvent {
  readonly matchId: MatchId;
  readonly poolTotal: bigint;
  readonly sideA: bigint;
  readonly sideB: bigint;
  readonly oddsA: number;
  readonly oddsB: number;
  readonly betCount: number;
}

/** 배팅 잠금 이벤트 */
export interface BetLockedEvent {
  readonly matchId: MatchId;
  readonly finalPool: bigint;
  readonly finalOdds: { readonly a: number; readonly b: number };
}

/** 배팅 정산 이벤트 */
export interface BetSettledEvent {
  readonly matchId: MatchId;
  readonly winner: BetSide;
  readonly yourPayout?: bigint;
}

/** 서바이벌 탈락 이벤트 */
export interface SurvivalEliminatedEvent {
  readonly sessionId: SessionId;
  readonly finalRound: number;
  readonly totalScore: number;
  readonly isRecord: boolean;
}

/** 토너먼트 진행 이벤트 */
export interface TournamentAdvanceEvent {
  readonly tournamentId: TournamentId;
  readonly round: number;
  readonly matchups: readonly { readonly agentA: AgentAddress; readonly agentB: AgentAddress }[];
}

/** 플레이어 입력 이벤트 */
export interface PlayerInputEvent {
  readonly sessionId: SessionId;
  readonly direction: Direction;
  readonly tick: number;
}

/** 에이전트 행동 이벤트 */
export interface AgentActionEvent {
  readonly matchId: MatchId;
  readonly agentAddress: AgentAddress;
  readonly direction: Direction;
  readonly tick: number;
  readonly signature: string;
}

// ===== 난이도 설정 인터페이스 =====

/** 난이도 등급별 설정 */
export interface TierConfig {
  readonly tier: DifficultyTier;
  readonly speedMultiplier: number;
  readonly chaseDuration: number;
  readonly scatterDuration: number;
  readonly powerPelletDuration: number;
  readonly coordinationEnabled: boolean;
  readonly patternRecognition: boolean;
  readonly llmEnabled: boolean;
}

// ===== v2 신규 타입 =====

/** Moltbook 프로필 (프론트엔드 표시용) */
export interface MoltbookProfile {
  readonly id: MoltbookId;
  readonly name: string;
  readonly description: string;
  readonly karma: number;
  readonly avatar: string | null;
  readonly followerCount: number;
  readonly ownerXHandle: string;
  readonly ownerXAvatar: string;
}

/** 통합 지갑 상태 */
export interface UnifiedWalletState {
  readonly address: string | null;
  readonly isConnected: boolean;
  readonly source: WalletSource | null;
  readonly balance: string | null;
}

/** 에이전트 등록 요청 */
export interface AgentRegistrationRequest {
  readonly role: AgentRole;
  readonly agentCode?: string;
  readonly builtInAgent?: string;
  readonly walletAddress?: string;
  readonly tournamentId?: TournamentId;
}

/** 에이전트 등록 응답 */
export interface AgentRegistrationResponse {
  readonly agentId: string;
  readonly sessionToken: string;
  readonly walletAddress: string;
  readonly moltbookProfile: MoltbookProfile;
  readonly role: AgentRole;
}

/** 인덱서 베팅 이벤트 */
export interface IndexerBetEvent {
  readonly matchId: MatchId;
  readonly bettor: string;
  readonly agent: AgentAddress;
  readonly amount: string;
  readonly side: BetSide;
  readonly timestamp: number;
}

/** 인덱서 정산 이벤트 */
export interface IndexerSettlementEvent {
  readonly matchId: MatchId;
  readonly bettor: string;
  readonly payout: string;
}
