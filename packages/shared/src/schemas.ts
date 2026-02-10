/**
 * Ghost Protocol WebSocket 이벤트 스키마 정의 (zod)
 * 모든 클라이언트-서버 메시지의 런타임 검증용
 */

import { z } from 'zod';

// ===== 기본 열거형 스키마 =====

/** 이동 방향 스키마 */
export const DirectionSchema = z.enum(['up', 'down', 'left', 'right']);

/** 고스트 식별자 스키마 */
export const GhostIdSchema = z.enum(['blinky', 'pinky', 'inky', 'clyde']);

/** 고스트 행동 모드 스키마 */
export const GhostModeSchema = z.enum(['chase', 'scatter', 'frightened', 'eaten']);

/** 배팅 방향 스키마 */
export const BetSideSchema = z.enum(['agentA', 'agentB']);

/** 미로 변형 종류 스키마 */
export const MazeVariantSchema = z.enum(['classic', 'labyrinth', 'speedway', 'fortress', 'random']);

/** 난이도 등급 스키마 (1~5) */
export const DifficultyTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// ===== 위치 및 엔티티 스키마 =====

/** 2D 위치 좌표 스키마 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** 팩맨 상태 스키마 */
export const PacmanStateSchema = z.object({
  x: z.number(),
  y: z.number(),
  direction: DirectionSchema,
  score: z.number().int().nonnegative(),
  lives: z.number().int().nonnegative(),
});

/** 고스트 상태 스키마 */
export const GhostStateSchema = z.object({
  id: GhostIdSchema,
  x: z.number(),
  y: z.number(),
  mode: GhostModeSchema,
});

// ===== Client → Server 이벤트 스키마 =====

/** 플레이어 입력 이벤트 스키마 */
export const PlayerInputSchema = z.object({
  sessionId: z.string(),
  direction: DirectionSchema,
  tick: z.number().int().nonnegative(),
});

/** 에이전트 행동 이벤트 스키마 */
export const AgentActionSchema = z.object({
  matchId: z.string(),
  agentAddress: z.string(),
  direction: DirectionSchema,
  tick: z.number().int().nonnegative(),
  signature: z.string(),
});

/** 방 참가 이벤트 스키마 */
export const JoinRoomSchema = z.object({
  roomId: z.string(),
});

// ===== Server → Client 이벤트 스키마 =====

/** 게임 상태 프레임 스키마 (60fps 전송) */
export const GameStateFrameSchema = z.object({
  tick: z.number().int().nonnegative(),
  pacman: PacmanStateSchema,
  ghosts: z.array(GhostStateSchema),
  pellets: z.array(z.array(z.boolean())),
  powerActive: z.boolean(),
  powerTimeRemaining: z.number().nonnegative(),
});

/** 라운드 시작 이벤트 스키마 */
export const RoundStartSchema = z.object({
  round: z.number().int().positive(),
  difficulty: DifficultyTierSchema,
  mazeId: MazeVariantSchema,
  ghostSpeed: z.number().positive(),
  powerDuration: z.number().positive(),
});

/** 라운드 종료 이벤트 스키마 */
export const RoundEndSchema = z.object({
  round: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  livesRemaining: z.number().int().nonnegative(),
  nextDifficulty: DifficultyTierSchema.nullable(),
});

/** 매치 결과 이벤트 스키마 */
export const MatchResultSchema = z.object({
  matchId: z.string(),
  winner: z.string(),
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  gameLogHash: z.string(),
});

/**
 * 배팅 업데이트 이벤트 스키마
 * 주의: bigint 값은 JSON 직렬화 문제로 string으로 전송됨
 */
export const BetUpdateSchema = z.object({
  matchId: z.string(),
  poolTotal: z.string(), // bigint → string
  sideA: z.string(), // bigint → string
  sideB: z.string(), // bigint → string
  oddsA: z.number().nonnegative(),
  oddsB: z.number().nonnegative(),
  betCount: z.number().int().nonnegative(),
});

/**
 * 배팅 잠금 이벤트 스키마
 * 주의: finalPool은 bigint → string 변환
 */
export const BetLockedSchema = z.object({
  matchId: z.string(),
  finalPool: z.string(), // bigint → string
  finalOdds: z.object({
    a: z.number().nonnegative(),
    b: z.number().nonnegative(),
  }),
});

/**
 * 배팅 정산 이벤트 스키마
 * 주의: yourPayout은 bigint → string 변환
 */
export const BetSettledSchema = z.object({
  matchId: z.string(),
  winner: BetSideSchema,
  yourPayout: z.string().optional(), // bigint → string (optional)
});

/** 서바이벌 탈락 이벤트 스키마 */
export const SurvivalEliminatedSchema = z.object({
  sessionId: z.string(),
  finalRound: z.number().int().positive(),
  totalScore: z.number().int().nonnegative(),
  isRecord: z.boolean(),
});

/** 토너먼트 진행 이벤트 스키마 */
export const TournamentAdvanceSchema = z.object({
  tournamentId: z.string(),
  round: z.number().int().positive(),
  matchups: z.array(
    z.object({
      agentA: z.string(),
      agentB: z.string(),
    }),
  ),
});

// ===== v2 에이전트 등록 스키마 =====

/** 에이전트 역할 스키마 */
export const AgentRoleSchema = z.enum(['pacman', 'ghost']);

/** 에이전트 등록 요청 스키마 */
export const AgentRegistrationSchema = z.object({
  role: AgentRoleSchema,
  agentCode: z.string().max(50000).optional(),
  builtInAgent: z.string().optional(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  tournamentId: z.string().optional(),
});

/** Moltbook identity 헤더 스키마 */
export const MoltbookIdentityHeaderSchema = z.string().min(1);

/** 베팅 사이드 스키마 확장 */
export const BetSideExtendedSchema = z.enum(['agentA', 'agentB', 'pacman', 'ghost']);

// ===== 타입 추론 (zod 스키마 → TypeScript 타입) =====
// 주의: types.ts에 이미 동일한 이름의 타입이 정의되어 있으므로 여기서는 export하지 않음
// 필요한 경우 z.infer<typeof XxxSchema>로 직접 추론하여 사용
