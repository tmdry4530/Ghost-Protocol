/**
 * MCP Bridge — Claude API tool_use 형식의 온체인 데이터 조회 도구
 *
 * T5 LLM 전략 에이전트가 게임 상태와 함께 온체인 통계, 배팅 풀, 상대 전적을 조회하여
 * 맥락을 고려한 의사결정을 할 수 있도록 지원합니다.
 */

import { ethers } from 'ethers';
import type { Contract, Provider } from 'ethers';

// ───────────────────────────────────────────────────────────
// MCP 도구 정의 (Claude API tool_use 형식)
// ───────────────────────────────────────────────────────────

/**
 * MCP 도구 정의 인터페이스
 */
export interface McpTool {
  /** 도구 고유 이름 */
  readonly name: string;
  /** 도구 설명 (한국어) */
  readonly description: string;
  /** 입력 스키마 (JSON Schema 형식) */
  readonly input_schema: {
    readonly type: 'object';
    readonly properties: Record<string, unknown>;
    readonly required: readonly string[];
  };
}

/**
 * 6개의 MCP 도구 정의
 */
export const mcpTools: readonly McpTool[] = [
  {
    name: 'getAgentStats',
    description: '특정 에이전트의 누적 통계를 GhostArena 컨트랙트에서 조회합니다. 승수, 패배수, 총 점수, 평판을 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        agentAddress: {
          type: 'string',
          description: '조회할 에이전트의 주소 (0x...)',
        },
      },
      required: ['agentAddress'],
    },
  },
  {
    name: 'getCurrentOdds',
    description: '특정 매치의 현재 배당률을 WagerPool 컨트랙트에서 조회합니다. AgentA/B 사이드별 총 배팅액과 비율을 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        matchId: {
          type: 'number',
          description: '매치 ID',
        },
      },
      required: ['matchId'],
    },
  },
  {
    name: 'getBettingPool',
    description: '특정 매치의 배팅 풀 크기를 조회합니다. 총 배팅액, 각 사이드별 금액, 잠김 여부를 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        matchId: {
          type: 'number',
          description: '매치 ID',
        },
      },
      required: ['matchId'],
    },
  },
  {
    name: 'getTournamentBracket',
    description: '토너먼트의 브래킷 정보와 라운드별 결과를 조회합니다. 참가자, 현재 라운드, 우승자를 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        tournamentId: {
          type: 'number',
          description: '토너먼트 ID',
        },
      },
      required: ['tournamentId'],
    },
  },
  {
    name: 'getLeaderboard',
    description: '상위 에이전트 리더보드를 조회합니다. 승수 또는 평판 기준으로 정렬된 에이전트 목록을 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '조회할 에이전트 수 (기본값: 10)',
        },
        sortBy: {
          type: 'string',
          enum: ['wins', 'reputation'],
          description: '정렬 기준 (wins 또는 reputation, 기본값: wins)',
        },
      },
      required: [],
    },
  },
  {
    name: 'getOpponentHistory',
    description: '상대 에이전트의 최근 매치 전적을 조회합니다. 최근 N경기의 결과, 점수, 승패를 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        agentAddress: {
          type: 'string',
          description: '상대 에이전트 주소',
        },
        limit: {
          type: 'number',
          description: '조회할 경기 수 (기본값: 5)',
        },
      },
      required: ['agentAddress'],
    },
  },
] as const;

// ───────────────────────────────────────────────────────────
// 도구 실행 함수
// ───────────────────────────────────────────────────────────

/**
 * 에이전트 통계 조회 결과
 */
interface AgentStatsResult {
  readonly address: string;
  readonly wins: number;
  readonly losses: number;
  readonly totalScore: number;
  readonly reputation: number;
  readonly active: boolean;
}

/**
 * 배당률 조회 결과
 */
interface OddsResult {
  readonly matchId: number;
  readonly totalA: string;
  readonly totalB: string;
  readonly ratioA: number;
  readonly ratioB: number;
}

/**
 * 배팅 풀 조회 결과
 */
interface BettingPoolResult {
  readonly matchId: number;
  readonly totalPool: string;
  readonly sideA: string;
  readonly sideB: string;
  readonly locked: boolean;
}

/**
 * 토너먼트 브래킷 조회 결과
 */
interface TournamentBracketResult {
  readonly tournamentId: number;
  readonly participants: readonly string[];
  readonly currentRound: number;
  readonly champion: string | null;
  readonly status: string;
}

/**
 * 리더보드 항목
 */
interface LeaderboardEntry {
  readonly address: string;
  readonly wins: number;
  readonly losses: number;
  readonly reputation: number;
}

/**
 * 리더보드 조회 결과
 */
interface LeaderboardResult {
  readonly entries: readonly LeaderboardEntry[];
  readonly sortBy: 'wins' | 'reputation';
}

/**
 * 매치 기록
 */
interface MatchRecord {
  readonly matchId: number;
  readonly opponent: string;
  readonly score: number;
  readonly opponentScore: number;
  readonly won: boolean;
}

/**
 * 상대 전적 조회 결과
 */
interface OpponentHistoryResult {
  readonly agentAddress: string;
  readonly recentMatches: readonly MatchRecord[];
}

/**
 * MCP 도구 실행 결과 타입
 */
type McpToolResult =
  | AgentStatsResult
  | OddsResult
  | BettingPoolResult
  | TournamentBracketResult
  | LeaderboardResult
  | OpponentHistoryResult;

/**
 * MCP 도구 실행 함수
 *
 * @param toolName - 실행할 도구 이름
 * @param input - 도구 입력 파라미터 (any로 받아서 타입 가드로 검증)
 * @param provider - Ethers Provider 인스턴스
 * @param arena - GhostArena 컨트랙트 인스턴스
 * @param wagerPool - WagerPool 컨트랙트 인스턴스
 * @returns 도구 실행 결과 (JSON 직렬화 가능한 객체)
 */
export async function executeMcpTool(
  toolName: string,
  input: unknown,
  _provider: Provider,
  arena: Contract,
  wagerPool: Contract,
): Promise<McpToolResult> {
  try {
    switch (toolName) {
      case 'getAgentStats':
        return await getAgentStats(input, arena);
      case 'getCurrentOdds':
        return await getCurrentOdds(input, wagerPool);
      case 'getBettingPool':
        return await getBettingPool(input, wagerPool);
      case 'getTournamentBracket':
        return await getTournamentBracket(input, arena);
      case 'getLeaderboard':
        return await getLeaderboard(input, arena);
      case 'getOpponentHistory':
        return await getOpponentHistory(input, arena);
      default:
        throw new Error(`Unknown MCP tool: ${toolName}`);
    }
  } catch (error) {
    // Log error and return default value
    console.warn(`MCP tool execution failed (${toolName}):`, error);
    return getDefaultResult(toolName, input);
  }
}

// ───────────────────────────────────────────────────────────
// 개별 도구 구현
// ───────────────────────────────────────────────────────────

/**
 * 에이전트 통계 조회
 */
async function getAgentStats(input: unknown, arena: Contract): Promise<AgentStatsResult> {
  if (!isValidInput(input, ['agentAddress'])) {
    throw new Error('Invalid input: agentAddress required');
  }

  const { agentAddress } = input as { agentAddress: string };

  try {
    const agents = arena.agents as ((address: string) => Promise<{
      wins?: bigint;
      losses?: bigint;
      totalScore?: bigint;
      reputation?: bigint;
      active?: boolean;
    }>) | undefined;

    if (!agents) {
      throw new Error('agents method unavailable');
    }

    const agent = await agents(agentAddress);

    return {
      address: agentAddress,
      wins: Number(agent.wins || 0),
      losses: Number(agent.losses || 0),
      totalScore: Number(agent.totalScore || 0),
      reputation: Number(agent.reputation || 0),
      active: Boolean(agent.active),
    };
  } catch (error) {
    // Default value if contract method unavailable or fails
    return {
      address: agentAddress,
      wins: 0,
      losses: 0,
      totalScore: 0,
      reputation: 1000,
      active: true,
    };
  }
}

/**
 * 현재 배당률 조회
 */
async function getCurrentOdds(input: unknown, wagerPool: Contract): Promise<OddsResult> {
  if (!isValidInput(input, ['matchId'])) {
    throw new Error('Invalid input: matchId required');
  }

  const { matchId } = input as { matchId: number };

  try {
    const pools = wagerPool.pools as ((matchId: number) => Promise<{
      totalA?: bigint;
      totalB?: bigint;
      status?: number;
    }>) | undefined;

    if (!pools) {
      throw new Error('pools method unavailable');
    }

    const pool = await pools(matchId);
    const totalA = BigInt(pool.totalA || 0);
    const totalB = BigInt(pool.totalB || 0);
    const total = totalA + totalB;

    let ratioA = 1.0;
    let ratioB = 1.0;

    if (total > 0n) {
      // Odds = (total pool / side bet amount) * 0.95 (5% fee deducted)
      ratioA = totalA > 0n ? Number(total) / Number(totalA) * 0.95 : 1.0;
      ratioB = totalB > 0n ? Number(total) / Number(totalB) * 0.95 : 1.0;
    }

    return {
      matchId,
      totalA: ethers.formatEther(totalA),
      totalB: ethers.formatEther(totalB),
      ratioA: Math.max(1.0, ratioA),
      ratioB: Math.max(1.0, ratioB),
    };
  } catch (error) {
    return {
      matchId,
      totalA: '0',
      totalB: '0',
      ratioA: 1.0,
      ratioB: 1.0,
    };
  }
}

/**
 * 배팅 풀 크기 조회
 */
async function getBettingPool(input: unknown, wagerPool: Contract): Promise<BettingPoolResult> {
  if (!isValidInput(input, ['matchId'])) {
    throw new Error('Invalid input: matchId required');
  }

  const { matchId } = input as { matchId: number };

  try {
    const pools = wagerPool.pools as ((matchId: number) => Promise<{
      totalA?: bigint;
      totalB?: bigint;
      status?: number;
    }>) | undefined;

    if (!pools) {
      throw new Error('pools method unavailable');
    }

    const pool = await pools(matchId);
    const totalA = BigInt(pool.totalA || 0);
    const totalB = BigInt(pool.totalB || 0);
    const total = totalA + totalB;

    return {
      matchId,
      totalPool: ethers.formatEther(total),
      sideA: ethers.formatEther(totalA),
      sideB: ethers.formatEther(totalB),
      locked: Boolean(pool.status === 1), // PoolStatus.Locked = 1
    };
  } catch (error) {
    return {
      matchId,
      totalPool: '0',
      sideA: '0',
      sideB: '0',
      locked: false,
    };
  }
}

/**
 * 토너먼트 브래킷 조회
 */
async function getTournamentBracket(
  input: unknown,
  arena: Contract,
): Promise<TournamentBracketResult> {
  if (!isValidInput(input, ['tournamentId'])) {
    throw new Error('Invalid input: tournamentId required');
  }

  const { tournamentId } = input as { tournamentId: number };

  try {
    const tournaments = arena.tournaments as ((tournamentId: number) => Promise<{
      participants?: readonly string[];
      status?: number;
    }>) | undefined;

    const tournamentCurrentRoundFn = arena.tournamentCurrentRound as ((tournamentId: number) => Promise<bigint>) | undefined;

    const tournamentChampionFn = arena.tournamentChampion as ((tournamentId: number) => Promise<string>) | undefined;

    if (!tournaments || !tournamentCurrentRoundFn || !tournamentChampionFn) {
      throw new Error('tournament methods unavailable');
    }

    const tournament = await tournaments(tournamentId);
    const currentRound = await tournamentCurrentRoundFn(tournamentId);
    const champion = await tournamentChampionFn(tournamentId);

    // participants is an array so convert directly
    const participants = tournament.participants || [];

    // Status conversion (0: Upcoming, 1: Active, 2: Completed)
    const statusMap = ['upcoming', 'active', 'completed'];
    const status = statusMap[Number(tournament.status || 0)] || 'upcoming';

    return {
      tournamentId,
      participants: participants as readonly string[],
      currentRound: Number(currentRound || 0),
      champion: champion === ethers.ZeroAddress ? null : champion,
      status,
    };
  } catch (error) {
    return {
      tournamentId,
      participants: [],
      currentRound: 0,
      champion: null,
      status: 'upcoming',
    };
  }
}

/**
 * 리더보드 조회
 *
 * 참고: 실제 구현에서는 이벤트 인덱싱이나 별도 오프체인 DB를 사용해야 합니다.
 * 현재는 단순화를 위해 빈 배열을 반환합니다.
 */
async function getLeaderboard(input: unknown, _arena: Contract): Promise<LeaderboardResult> {
  const defaultSortBy = 'wins';

  const sortBy =
    isValidInput(input, []) &&
    ((input as { sortBy?: string }).sortBy === 'wins' ||
      (input as { sortBy?: string }).sortBy === 'reputation')
      ? (input as { sortBy: 'wins' | 'reputation' }).sortBy
      : defaultSortBy;

  try {
    // 실제 구현: 이벤트 쿼리 또는 오프체인 인덱서 사용
    // 현재는 더미 데이터 반환
    return {
      entries: [],
      sortBy,
    };
  } catch (error) {
    return {
      entries: [],
      sortBy,
    };
  }
}

/**
 * 상대 전적 조회
 *
 * 참고: 실제 구현에서는 이벤트 인덱싱이 필요합니다.
 */
async function getOpponentHistory(input: unknown, _arena: Contract): Promise<OpponentHistoryResult> {
  if (!isValidInput(input, ['agentAddress'])) {
    throw new Error('Invalid input: agentAddress required');
  }

  const { agentAddress } = input as { agentAddress: string };

  try {
    // Actual implementation: MatchCompleted event filtering
    // Currently returns dummy data
    return {
      agentAddress,
      recentMatches: [],
    };
  } catch (error) {
    return {
      agentAddress,
      recentMatches: [],
    };
  }
}

// ───────────────────────────────────────────────────────────
// 유틸리티 함수
// ───────────────────────────────────────────────────────────

/**
 * 입력 검증 타입 가드
 */
function isValidInput(input: unknown, requiredKeys: readonly string[]): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    return false;
  }

  const obj = input as Record<string, unknown>;
  return requiredKeys.every((key) => key in obj);
}

/**
 * 에러 발생 시 기본 결과 반환
 */
function getDefaultResult(toolName: string, input: unknown): McpToolResult {
  switch (toolName) {
    case 'getAgentStats':
      return {
        address: (input as { agentAddress?: string }).agentAddress || '0x0',
        wins: 0,
        losses: 0,
        totalScore: 0,
        reputation: 1000,
        active: true,
      };
    case 'getCurrentOdds':
    case 'getBettingPool':
      return {
        matchId: (input as { matchId?: number }).matchId || 0,
        totalPool: '0',
        sideA: '0',
        sideB: '0',
        locked: false,
      };
    case 'getTournamentBracket':
      return {
        tournamentId: (input as { tournamentId?: number }).tournamentId || 0,
        participants: [],
        currentRound: 0,
        champion: null,
        status: 'upcoming',
      };
    case 'getLeaderboard':
      return {
        entries: [],
        sortBy: 'wins',
      };
    case 'getOpponentHistory':
      return {
        agentAddress: (input as { agentAddress?: string }).agentAddress || '0x0',
        recentMatches: [],
      };
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
