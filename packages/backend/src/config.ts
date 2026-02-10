import { z } from 'zod';

/**
 * 환경 변수 스키마 정의
 * 모든 환경 변수를 zod로 검증하여 타입 안전성 보장
 */
const envSchema = z.object({
  /** 서버 포트 */
  PORT: z.coerce.number().default(3001),

  /** Redis 접속 URL */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  /** CORS 허용 출처 */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Monad RPC URL */
  MONAD_RPC_URL: z.string().default('https://testnet.monad.xyz/v1'),

  /** Monad 체인 ID */
  MONAD_CHAIN_ID: z.coerce.number().default(10143),

  /** 아레나 매니저 개인키 (서버 전용) */
  ARENA_MANAGER_PRIVATE_KEY: z.string().optional(),

  /** 스마트 컨트랙트 주소 */
  GHOST_ARENA_ADDRESS: z.string().optional(),
  WAGER_POOL_ADDRESS: z.string().optional(),
  SURVIVAL_BET_ADDRESS: z.string().optional(),

  /** Claude API 키 (Ghost AI Tier 4+ 전략용) */
  CLAUDE_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  /** IPFS 설정 */
  PINATA_API_KEY: z.string().optional(),
  PINATA_SECRET_KEY: z.string().optional(),

  /** 실행 환경 */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Circle Wallet API 설정 (선택적) */
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_API_BASE: z.string().default('https://api.circle.com'),
  CIRCLE_WALLET_SET_ID: z.string().optional(),
  CIRCLE_ENTITY_SECRET: z.string().optional(),

  /** Moltbook API 설정 (v2) */
  MOLTBOOK_API_BASE: z.string().default('https://www.moltbook.com/api/v1'),
  MOLTBOOK_APP_API_KEY: z.string().optional(),

  /** Envio Indexer GraphQL 엔드포인트 */
  ENVIO_GRAPHQL_URL: z.string().default('http://localhost:8080/v1/graphql'),
});

/** 환경 변수 타입 */
export type Env = z.infer<typeof envSchema>;

/**
 * 검증된 환경 변수 로드
 * 유효하지 않은 환경 변수가 있으면 에러를 throw
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ 환경 변수 검증 실패:', formatted);
    throw new Error('환경 변수 검증에 실패했습니다. .env 파일을 확인하세요.');
  }

  return result.data;
}

/**
 * Monad 네트워크 상세 설정
 *
 * 참조: docs/RESOURCE-GUIDE.md 섹션 4-3
 */
export const MONAD_NETWORK = {
  /** 메인넷 설정 */
  mainnet: {
    chainId: 143,
    rpc: [
      'https://rpc.monad.xyz', // QuickNode, 25 rps
      'https://rpc1.monad.xyz', // Alchemy, 15 rps
      'https://rpc2.monad.xyz', // Goldsky Edge — 아카이브 쿼리용
      'https://rpc3.monad.xyz', // Ankr
    ],
    explorers: [
      'https://monadscan.com',
      'https://monadvision.com',
      'https://monad.socialscan.io',
    ],
    currency: 'MON',
  },
  /** 테스트넷 설정 */
  testnet: {
    chainId: 10143,
    rpc: ['https://testnet-rpc.monad.xyz'],
    faucet: 'https://faucet.monad.xyz',
    agentFaucet: 'https://agents.devnads.com/v1/faucet',
    explorer: 'https://monadvision.com',
  },
  /** 성능 특성 */
  performance: {
    tps: 10000,
    blockTimeMs: 400,
    finalityMs: 800, // 2블록
    verifiedMs: 1200, // 3블록
    gasPerSecond: 500_000_000,
  },
  /** 표준 컨트랙트 주소 */
  canonicalContracts: {
    WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    Multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    Permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    CreateX: '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed',
  },
} as const;
