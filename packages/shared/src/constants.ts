/**
 * Ghost Protocol 게임 상수
 * 게임 엔진 전체에서 사용되는 불변 값
 */
import type { TierConfig, DifficultyTier } from './types.js';

// ===== 미로 상수 =====

/** 미로 가로 타일 수 */
export const MAZE_WIDTH = 28;

/** 미로 세로 타일 수 */
export const MAZE_HEIGHT = 31;

// ===== 게임 루프 상수 =====

/** 초당 틱 수 (프레임 레이트) */
export const TICK_RATE = 60;

/** 틱 간격 (밀리초) */
export const TICK_MS = 16.667;

/** 에이전트 행동 타임아웃 (밀리초) */
export const AGENT_ACTION_TIMEOUT_MS = 100;

// ===== 팩맨 상수 =====

/** 팩맨 기본 이동 속도 (타일/초) */
export const BASE_PACMAN_SPEED = 8;

/** 초기 생명 수 */
export const INITIAL_LIVES = 3;

/** 추가 생명 점수 기준 */
export const EXTRA_LIFE_SCORE = 10_000;

// ===== 점수 상수 =====

/** 일반 펠릿 점수 */
export const REGULAR_PELLET_POINTS = 10;

/** 파워 펠릿 점수 */
export const POWER_PELLET_POINTS = 50;

/** 미로당 일반 펠릿 수 */
export const PELLETS_PER_MAZE = 240;

/** 미로당 파워 펠릿 수 */
export const POWER_PELLETS_PER_MAZE = 4;

/** 고스트 연속 처치 점수 배열 */
export const GHOST_EAT_SCORES: readonly number[] = [200, 400, 800, 1600];

/** 과일 보너스 점수 범위 */
export const FRUIT_POINTS_MIN = 100;
export const FRUIT_POINTS_MAX = 500;

/** 과일 생성 조건 (먹은 펠릿 수) */
export const FRUIT_SPAWN_THRESHOLDS: readonly number[] = [70, 170];

// ===== 고스트 상수 =====

/** 고스트 터널 내 속도 배율 */
export const GHOST_TUNNEL_SPEED_MULTIPLIER = 0.5;

/** 클라이드 추적/후퇴 전환 거리 (타일) */
export const CLYDE_RETREAT_DISTANCE = 8;

/** 핑키 목표 오프셋 (타일) */
export const PINKY_TARGET_OFFSET = 4;

// ===== 아레나 모드 상수 =====

/** 매치당 라운드 수 */
export const ARENA_ROUNDS_PER_MATCH = 3;

/** 라운드 시간 제한 (초) */
export const ARENA_ROUND_TIME_LIMIT = 180;

/** 브래킷 크기 옵션 */
export const BRACKET_SIZES: readonly number[] = [8, 16];

// ===== 배팅 상수 =====

/** 최소 배팅 금액 (wei) */
export const MIN_BET_AMOUNT = 1_000_000_000_000_000n; // 0.001 MON

/** 최대 배팅 금액 (wei) */
export const MAX_BET_AMOUNT = 10_000_000_000_000_000_000n; // 10 MON

/** 배팅 창 시간 (초) */
export const BETTING_WINDOW_MIN = 30;
export const BETTING_WINDOW_MAX = 60;

/** 플랫폼 수수료율 (퍼센트) */
export const PLATFORM_FEE_PERCENT = 5;

/** 재무부 수수료율 (퍼센트) */
export const TREASURY_FEE_PERCENT = 3;

/** 아레나 매니저 수수료율 (퍼센트) */
export const ARENA_MANAGER_FEE_PERCENT = 2;

/** 에이전트 등록 수수료 (wei) */
export const REGISTRATION_FEE = 10_000_000_000_000_000n; // 0.01 MON

/** 서바이벌 입장료 (wei) */
export const SURVIVAL_ENTRY_FEE = 5_000_000_000_000_000n; // 0.005 MON

// ===== 서바이벌 배팅 예측 가중치 =====

/** 정확한 라운드 예측 가중치 */
export const PREDICTION_EXACT_WEIGHT = 3;

/** ±1 라운드 예측 가중치 */
export const PREDICTION_NEAR_WEIGHT = 2;

/** ±2 라운드 예측 가중치 */
export const PREDICTION_FAR_WEIGHT = 1;

/** 서바이벌 보너스: 중앙값 초과 시 풀의 비율 */
export const SURVIVAL_BONUS_PERCENT = 10;

/** 서바이벌 신기록 보너스: 풀의 비율 */
export const RECORD_BONUS_PERCENT = 5;

// ===== 난이도 등급별 설정 =====

/** 각 난이도 등급의 상세 설정 */
export const TIER_CONFIGS: ReadonlyMap<DifficultyTier, TierConfig> = new Map([
  [1, {
    tier: 1,
    speedMultiplier: 0.75,
    chaseDuration: 5,
    scatterDuration: 7,
    powerPelletDuration: 8,
    coordinationEnabled: false,
    patternRecognition: false,
    llmEnabled: false,
  }],
  [2, {
    tier: 2,
    speedMultiplier: 0.85,
    chaseDuration: 7,
    scatterDuration: 5,
    powerPelletDuration: 6,
    coordinationEnabled: false,
    patternRecognition: false,
    llmEnabled: false,
  }],
  [3, {
    tier: 3,
    speedMultiplier: 0.95,
    chaseDuration: 8,
    scatterDuration: 3,
    powerPelletDuration: 4,
    coordinationEnabled: true,
    patternRecognition: true,
    llmEnabled: false,
  }],
  [4, {
    tier: 4,
    speedMultiplier: 1.0,
    chaseDuration: 9,
    scatterDuration: 1,
    powerPelletDuration: 2,
    coordinationEnabled: true,
    patternRecognition: true,
    llmEnabled: true,
  }],
  [5, {
    tier: 5,
    speedMultiplier: 1.05,
    chaseDuration: Infinity,
    scatterDuration: 0,
    powerPelletDuration: 1,
    coordinationEnabled: true,
    patternRecognition: true,
    llmEnabled: true,
  }],
]);

// ===== Monad 체인 설정 =====

/** Monad 테스트넷 체인 ID */
export const MONAD_CHAIN_ID = 10143;

/** Monad 테스트넷 RPC URL */
export const MONAD_TESTNET_RPC = 'https://testnet.monad.xyz/v1';

// ===== WebSocket 이벤트 이름 =====

export const WS_EVENTS = {
  // 서버 → 클라이언트
  GAME_STATE: 'game_state',
  MATCH_START: 'match_start',
  ROUND_START: 'round_start',
  ROUND_END: 'round_end',
  MATCH_RESULT: 'match_result',
  BET_UPDATE: 'bet_update',
  BET_LOCKED: 'bet_locked',
  BET_SETTLED: 'bet_settled',
  SURVIVAL_ELIMINATED: 'survival_eliminated',
  TOURNAMENT_ADVANCE: 'tournament_advance',

  // 클라이언트 → 서버
  PLAYER_INPUT: 'player_input',
  AGENT_ACTION: 'agent_action',

  // 방 참가/퇴장
  JOIN_MATCH: 'join_match',
  JOIN_SURVIVAL: 'join_survival',
  JOIN_TOURNAMENT: 'join_tournament',
  JOIN_BETTING: 'join_betting',
  JOIN_LOBBY: 'join_lobby',
} as const;

// ===== API 경로 =====

export const API_PREFIX = '/api/v1';

// ===== 레이트 리밋 =====

/** 읽기 API 분당 요청 제한 (IP 기준) */
export const RATE_LIMIT_READ = 100;

/** 쓰기 API 분당 요청 제한 (지갑 기준) */
export const RATE_LIMIT_WRITE = 20;

/** WebSocket 동시 방 제한 */
export const WS_MAX_ROOMS = 5;

// ===== v2 Moltbook 상수 =====

/** Moltbook API 기본 URL (⚠️ www 필수) */
export const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

/** Moltbook 인증 헤더명 */
export const MOLTBOOK_AUTH_HEADER = 'x-moltbook-identity';

/** Moltbook 앱 키 헤더명 */
export const MOLTBOOK_APP_KEY_HEADER = 'x-moltbook-app-key';

/** Moltbook 레이트 리밋 설정 */
export const MOLTBOOK_RATE_LIMITS = {
  requestsPerMinute: 100,
  postCooldownMinutes: 30,
  commentCooldownSeconds: 20,
  commentsPerDay: 50,
  newAgent: {
    postCooldownHours: 2,
    commentCooldownSeconds: 60,
    commentsPerDay: 20,
    dmAllowed: false,
  },
} as const;

/** 에이전트 역할별 제한 */
export const ROLE_LIMITS = {
  maxPacmanPerTournament: 4,
  maxGhostPerTournament: 4,
  maxGhostsPerMatch: 4,
  maxPacmanPerMatch: 1,
} as const;

/** Agent Faucet API URL */
export const AGENT_FAUCET_URL = 'https://agents.devnads.com/v1/faucet';

/** Agent Verification API URL */
export const AGENT_VERIFY_URL = 'https://agents.devnads.com/v1/verify';
