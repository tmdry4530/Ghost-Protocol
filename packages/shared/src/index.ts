/** Ghost Protocol 공유 모듈 진입점 */
export * from './types.js';
export * from './constants.js';
export * from './errors.js';
export * from './schemas.js';

// v2 타입 명시적 export (autocomplete 지원)
export type {
  MoltbookId,
  MoltbookProfile,
  UnifiedWalletState,
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  AgentRole,
  WalletSource,
  IndexerBetEvent,
  IndexerSettlementEvent,
} from './types.js';

// v2 스키마 명시적 export
export {
  BetSideExtendedSchema,
  AgentRegistrationSchema,
  AgentRoleSchema,
  MoltbookIdentityHeaderSchema,
} from './schemas.js';

// v2 상수 명시적 export
export {
  MOLTBOOK_API_BASE,
  MOLTBOOK_AUTH_HEADER,
  MOLTBOOK_APP_KEY_HEADER,
  MOLTBOOK_RATE_LIMITS,
  ROLE_LIMITS,
  AGENT_FAUCET_URL,
  AGENT_VERIFY_URL,
} from './constants.js';
