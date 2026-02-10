/**
 * LLM 기반 고스트 전략 제공자
 * Claude API를 사용하여 팩맨 게임에서 고스트의 최적 타겟 위치를 계산
 *
 * 주요 구성 요소:
 * - ClaudeLLMStrategy: LLMStrategyProvider 인터페이스 구현체
 * - TokenBucketRateLimiter: 토큰 버킷 기반 요청 제한기
 * - LLMResponseCache: TTL 기반 응답 캐시
 * - PatternAnalyzer: 팩맨 이동 패턴 분석기 (Tier 5 전용)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Contract, Provider } from 'ethers';
import type { Direction, GhostId, Position } from '@ghost-protocol/shared';
import { MAZE_WIDTH, MAZE_HEIGHT } from '@ghost-protocol/shared';
import type {
  LLMStrategyProvider,
  LLMStrategyRequest,
  LLMStrategyResponse,
} from './DifficultyManager.js';
import { mcpTools, executeMcpTool } from './mcpBridge.js';
import type { McpTool } from './mcpBridge.js';

// ===== 설정 인터페이스 =====

/** LLM 전략 제공자 설정 */
interface LLMStrategyConfig {
  /** Anthropic API 키 */
  readonly apiKey: string;
  /** 사용할 Claude 모델 (기본값: 'claude-haiku-4-5-20251001') */
  readonly model?: string;
  /** 최대 응답 토큰 수 (기본값: 512) */
  readonly maxTokens?: number;
  /** 분당 최대 요청 수 (기본값: 30) */
  readonly maxRequestsPerMinute?: number;
  /** 캐시 TTL (밀리초, 기본값: 2000) */
  readonly cacheTTLMs?: number;
  /** 과거 분석 활성화 여부 — Tier 5 전용 (기본값: false) */
  readonly enableHistoricalAnalysis?: boolean;
  /** 온체인 MCP 도구 활성화 여부 (기본값: false) */
  readonly enableMcpTools?: boolean;
  /** ethers Provider (MCP 도구에 필요) */
  readonly provider?: Provider;
  /** GhostArena 컨트랙트 인스턴스 */
  readonly arenaContract?: Contract;
  /** WagerPool 컨트랙트 인스턴스 */
  readonly wagerPoolContract?: Contract;
}

// ===== 유효한 고스트 ID 목록 =====

/** 모든 고스트 ID 배열 */
const ALL_GHOST_IDS: readonly GhostId[] = ['blinky', 'pinky', 'inky', 'clyde'];

// ===== 토큰 버킷 레이트 리미터 =====

/**
 * 토큰 버킷 알고리즘 기반 요청 제한기
 * 버스트 트래픽을 허용하면서 평균 요청률을 제한
 */
class TokenBucketRateLimiter {
  /** 현재 남은 토큰 수 */
  private tokens: number;
  /** 마지막 토큰 보충 시점 (밀리초 타임스탬프) */
  private lastRefill: number;
  /** 최대 토큰 수 (버킷 용량) */
  private readonly maxTokens: number;
  /** 밀리초당 토큰 보충률 */
  private readonly refillRate: number;

  /**
   * 레이트 리미터 생성
   * @param maxRequestsPerMinute - 분당 최대 요청 수
   */
  constructor(maxRequestsPerMinute: number) {
    this.maxTokens = maxRequestsPerMinute;
    this.tokens = maxRequestsPerMinute;
    this.refillRate = maxRequestsPerMinute / 60_000; // ms당 토큰 수
    this.lastRefill = Date.now();
  }

  /**
   * 토큰 1개 획득 시도
   * @returns 토큰 획득 성공 여부 (true: 요청 허용, false: 요청 거부)
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /** 경과 시간에 따라 토큰을 보충 */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

// ===== LLM 응답 캐시 =====

/** 캐시 항목 (응답 + 만료 시점) */
interface CacheEntry {
  readonly response: LLMStrategyResponse;
  readonly expiry: number;
}

/**
 * TTL 기반 LLM 응답 캐시
 * 동일한 게임 상태에 대한 중복 API 호출을 방지
 */
class LLMResponseCache {
  /** 캐시 저장소 (키 → 응답+만료) */
  private readonly cache: Map<string, CacheEntry> = new Map();
  /** 캐시 항목 수명 (밀리초) */
  private readonly ttlMs: number;
  /** 캐시 정리 주기 카운터 */
  private operationCount = 0;
  /** 캐시 정리 간격 (연산 횟수 기준) */
  private static readonly CLEANUP_INTERVAL = 50;

  /**
   * 캐시 생성
   * @param ttlMs - 캐시 항목 수명 (밀리초)
   */
  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  /**
   * 요청 데이터로부터 캐시 키 생성
   * 위치 데이터를 직렬화하여 해시 키로 사용
   * @param request - LLM 전략 요청 데이터
   * @returns 캐시 키 문자열
   */
  getCacheKey(request: LLMStrategyRequest): string {
    // 위치 정보를 간결한 문자열로 직렬화
    const ghostPosEntries: string[] = [];
    for (const [id, pos] of request.ghostPositions) {
      ghostPosEntries.push(`${id}:${String(pos.x)},${String(pos.y)}`);
    }
    ghostPosEntries.sort(); // 순서 무관 일관성 보장

    return [
      `p:${String(request.pacmanPosition.x)},${String(request.pacmanPosition.y)}`,
      `d:${request.pacmanDirection}`,
      `g:${ghostPosEntries.join('|')}`,
      `r:${String(request.remainingPellets)}`,
    ].join(';');
  }

  /**
   * 캐시에서 응답 조회
   * @param key - 캐시 키
   * @returns 캐시된 응답 또는 null (만료/미존재 시)
   */
  get(key: string): LLMStrategyResponse | null {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * 캐시에 응답 저장
   * @param key - 캐시 키
   * @param response - 저장할 LLM 응답
   */
  set(key: string, response: LLMStrategyResponse): void {
    this.cache.set(key, {
      response,
      expiry: Date.now() + this.ttlMs,
    });

    this.operationCount++;
    if (this.operationCount >= LLMResponseCache.CLEANUP_INTERVAL) {
      this.cleanup();
      this.operationCount = 0;
    }
  }

  /**
   * 만료된 캐시 항목 정리
   * 주기적으로 호출되어 메모리 누수 방지
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// ===== 패턴 분석기 (Tier 5 전용) =====

/** 이동 기록 항목 */
interface MovementRecord {
  readonly tick: number;
  readonly direction: Direction;
  readonly position: Position;
}

/**
 * 팩맨 이동 패턴 분석기
 * 과거 이동 데이터를 기반으로 패턴 인식 및 위치 예측
 * Tier 5 난이도에서만 활성화
 */
class PatternAnalyzer {
  /** 이동 기록 버퍼 */
  private history: MovementRecord[] = [];
  /** 최대 기록 보유량 (5초 분량 = 300틱 @ 60fps) */
  private readonly maxHistory: number = 300;

  /**
   * 이동 데이터 기록
   * @param tick - 현재 게임 틱
   * @param direction - 이동 방향
   * @param position - 현재 위치
   */
  record(tick: number, direction: Direction, position: Position): void {
    this.history.push({ tick, direction, position });

    // 순환 버퍼: 오래된 기록 제거
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  /**
   * 가장 빈번한 이동 방향 반환
   * @returns 최다 빈도 방향 또는 null (기록 없음 시)
   */
  getMostFrequentDirection(): Direction | null {
    if (this.history.length === 0) {
      return null;
    }

    const counts = new Map<Direction, number>();
    for (const record of this.history) {
      counts.set(record.direction, (counts.get(record.direction) ?? 0) + 1);
    }

    let maxCount = 0;
    let result: Direction | null = null;
    for (const [dir, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        result = dir;
      }
    }

    return result;
  }

  /**
   * 10틱당 방향 전환 빈도 계산
   * @returns 10틱당 평균 방향 전환 횟수
   */
  getDirectionChangeRate(): number {
    if (this.history.length < 2) {
      return 0;
    }

    let changes = 0;
    for (let i = 1; i < this.history.length; i++) {
      const prev = this.history[i - 1];
      const curr = this.history[i];
      if (prev !== undefined && curr !== undefined && prev.direction !== curr.direction) {
        changes++;
      }
    }

    const totalTicks = this.history.length;
    // 10틱당 전환률로 정규화
    return totalTicks > 0 ? (changes / totalTicks) * 10 : 0;
  }

  /**
   * 현재 위치와 방향을 기반으로 미래 위치 예측
   * 미로 경계를 고려하여 클램프 처리
   * @param currentPos - 현재 위치
   * @param currentDir - 현재 방향
   * @param ticksAhead - 예측할 틱 수
   * @returns 예측 위치
   */
  predictPosition(currentPos: Position, currentDir: Direction, ticksAhead: number): Position {
    const offset = this.getDirectionVector(currentDir);
    const predictedX = currentPos.x + offset.x * ticksAhead;
    const predictedY = currentPos.y + offset.y * ticksAhead;

    // 미로 경계 내로 클램프
    return {
      x: Math.max(0, Math.min(MAZE_WIDTH - 1, Math.round(predictedX))),
      y: Math.max(0, Math.min(MAZE_HEIGHT - 1, Math.round(predictedY))),
    };
  }

  /**
   * 사람이 읽을 수 있는 패턴 분석 요약 생성
   * LLM 프롬프트에 삽입되어 전략 정보를 제공
   * @returns 분석 요약 문자열
   */
  getSummary(): string {
    const mostFrequent = this.getMostFrequentDirection();
    const changeRate = this.getDirectionChangeRate();
    const dataPoints = this.history.length;

    const lines: string[] = [
      `분석 데이터: ${String(dataPoints)}틱`,
      `최다 빈도 방향: ${mostFrequent ?? '데이터 부족'}`,
      `10틱당 방향 전환율: ${changeRate.toFixed(2)}`,
    ];

    // 최근 이동 추세 (마지막 30틱)
    if (this.history.length >= 30) {
      const recent = this.history.slice(-30);
      const recentCounts = new Map<Direction, number>();
      for (const r of recent) {
        recentCounts.set(r.direction, (recentCounts.get(r.direction) ?? 0) + 1);
      }

      const trendParts: string[] = [];
      for (const [dir, count] of recentCounts) {
        trendParts.push(`${dir}=${String(count)}`);
      }
      lines.push(`최근 30틱 방향 분포: ${trendParts.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * 방향에 대한 단위 벡터 반환
   * @param direction - 이동 방향
   * @returns x, y 단위 벡터
   */
  private getDirectionVector(direction: Direction): { x: number; y: number } {
    switch (direction) {
      case 'up':
        return { x: 0, y: -1 };
      case 'down':
        return { x: 0, y: 1 };
      case 'left':
        return { x: -1, y: 0 };
      case 'right':
        return { x: 1, y: 0 };
    }
  }
}

// ===== 응답 검증 타입 가드 =====

/**
 * LLM 응답의 타겟 포지션 객체 검증
 * @param value - 검증 대상 값
 * @returns Position 형태인지 여부
 */
function isValidPosition(value: unknown): value is { x: number; y: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj['x'] === 'number' &&
    typeof obj['y'] === 'number' &&
    Number.isFinite(obj['x']) &&
    Number.isFinite(obj['y'])
  );
}

/**
 * LLM 원시 응답 JSON 구조 검증
 * @param parsed - 파싱된 JSON 객체
 * @returns 유효한 응답 구조인지 여부
 */
function isValidRawResponse(
  parsed: unknown,
): parsed is {
  targets: Record<string, { x: number; y: number }>;
  strategy: string;
  confidence: number;
} {
  if (typeof parsed !== 'object' || parsed === null) {
    return false;
  }

  const obj = parsed as Record<string, unknown>;

  // targets 필드 검증
  if (typeof obj['targets'] !== 'object' || obj['targets'] === null) {
    return false;
  }

  // strategy 필드 검증
  if (typeof obj['strategy'] !== 'string') {
    return false;
  }

  // confidence 필드 검증
  if (typeof obj['confidence'] !== 'number' || !Number.isFinite(obj['confidence'])) {
    return false;
  }

  return true;
}

// ===== 프롬프트 빌더 =====

/** 시스템 프롬프트 — 팩맨 미로 좌표 체계 설명 */
const SYSTEM_PROMPT = `당신은 팩맨 게임의 고스트 AI 전략가입니다.
미로는 ${String(MAZE_WIDTH)}x${String(MAZE_HEIGHT)} 그리드로 구성되어 있습니다.
좌표 체계: x는 좌(0)에서 우(${String(MAZE_WIDTH - 1)}), y는 상(0)에서 하(${String(MAZE_HEIGHT - 1)}).
4개의 고스트(blinky, pinky, inky, clyde)의 타겟 위치를 최적화하여 팩맨을 포위해야 합니다.

규칙:
- 모든 타겟 좌표는 미로 경계 내여야 합니다 (x: 0~${String(MAZE_WIDTH - 1)}, y: 0~${String(MAZE_HEIGHT - 1)}).
- 고스트들은 협력하여 팩맨의 퇴로를 차단해야 합니다.
- 팩맨의 이동 패턴을 분석하여 예측 기반 포위 전략을 수립하세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "targets": {
    "blinky": {"x": <number>, "y": <number>},
    "pinky": {"x": <number>, "y": <number>},
    "inky": {"x": <number>, "y": <number>},
    "clyde": {"x": <number>, "y": <number>}
  },
  "strategy": "<전략 설명 (한국어)>",
  "confidence": <0.0~1.0 사이의 신뢰도>
}`;

/**
 * Tier 4 전술 프롬프트 생성
 * @param request - LLM 전략 요청 데이터
 * @returns 사용자 프롬프트 문자열
 */
function buildTier4Prompt(request: LLMStrategyRequest): string {
  const ghostLines: string[] = [];
  for (const [id, pos] of request.ghostPositions) {
    ghostLines.push(`  ${id}: (${String(pos.x)}, ${String(pos.y)})`);
  }

  const recentMoves =
    request.recentPacmanMoves.length > 0
      ? request.recentPacmanMoves.join(', ')
      : '데이터 없음';

  return `현재 게임 상태 (틱: ${String(request.currentTick)}):

팩맨:
  위치: (${String(request.pacmanPosition.x)}, ${String(request.pacmanPosition.y)})
  방향: ${request.pacmanDirection}
  최근 이동 패턴 (최대 10개): [${recentMoves}]

고스트 위치:
${ghostLines.join('\n')}

남은 펠릿: ${String(request.remainingPellets)}

최적의 고스트 타겟 위치를 JSON으로 응답하세요.`;
}

/**
 * Tier 5 강화 프롬프트 생성 (과거 분석 포함)
 * @param request - LLM 전략 요청 데이터
 * @param analysisSummary - 패턴 분석 요약
 * @param predictedPosition - 예측 팩맨 위치
 * @returns 사용자 프롬프트 문자열
 */
function buildTier5Prompt(
  request: LLMStrategyRequest,
  analysisSummary: string,
  predictedPosition: Position,
): string {
  const basePrompt = buildTier4Prompt(request);

  return `${basePrompt}

=== 고급 분석 데이터 (Tier 5) ===

이동 패턴 분석:
${analysisSummary}

예측 팩맨 위치 (3틱 후): (${String(predictedPosition.x)}, ${String(predictedPosition.y)})

위 분석 데이터를 활용하여 더 정밀한 포위 전략을 수립하세요.
strategy 필드에 상세한 전략 설명을 포함하세요.`;
}

// ===== 메인 클래스 =====

/**
 * Claude API 기반 LLM 전략 제공자
 *
 * 팩맨 게임에서 고스트의 최적 타겟 위치를 Claude API를 통해 계산.
 * 레이트 리미팅, 응답 캐싱, 방어적 JSON 파싱을 포함.
 *
 * @example
 * ```typescript
 * const strategy = new ClaudeLLMStrategy({
 *   apiKey: process.env.CLAUDE_API_KEY ?? '',
 *   model: 'claude-haiku-4-5-20251001',
 *   enableHistoricalAnalysis: false,
 * });
 *
 * const response = await strategy.requestStrategy(request);
 * // response.ghostTargets: Map<GhostId, Position>
 * ```
 */
class ClaudeLLMStrategy implements LLMStrategyProvider {
  /** Anthropic API 클라이언트 */
  private readonly client: Anthropic;
  /** 사용할 Claude 모델명 */
  private readonly model: string;
  /** 최대 응답 토큰 수 */
  private readonly maxTokens: number;
  /** 요청 제한기 */
  private readonly rateLimiter: TokenBucketRateLimiter;
  /** 응답 캐시 */
  private readonly cache: LLMResponseCache;
  /** 패턴 분석기 (Tier 5 전용, null이면 비활성) */
  private readonly patternAnalyzer: PatternAnalyzer | null;
  /** MCP 도구 활성화 여부 */
  private readonly enableMcpTools: boolean;
  /** ethers Provider */
  private readonly provider: Provider | null;
  /** GhostArena 컨트랙트 */
  private readonly arenaContract: Contract | null;
  /** WagerPool 컨트랙트 */
  private readonly wagerPoolContract: Contract | null;
  /** 마지막으로 성공한 캐시된 응답 (폴백용) */
  private lastSuccessfulResponse: LLMStrategyResponse | null = null;

  /**
   * ClaudeLLMStrategy 생성
   * @param config - LLM 전략 설정
   */
  constructor(config: LLMStrategyConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-haiku-4-5-20251001';
    this.maxTokens = config.maxTokens ?? 512;
    this.rateLimiter = new TokenBucketRateLimiter(config.maxRequestsPerMinute ?? 30);
    this.cache = new LLMResponseCache(config.cacheTTLMs ?? 2000);
    this.patternAnalyzer =
      config.enableHistoricalAnalysis === true ? new PatternAnalyzer() : null;
    this.enableMcpTools = config.enableMcpTools === true;
    this.provider = config.provider ?? null;
    this.arenaContract = config.arenaContract ?? null;
    this.wagerPoolContract = config.wagerPoolContract ?? null;
  }

  /**
   * 고스트 전략 요청
   *
   * 캐시 확인 -> 레이트 리밋 확인 -> API 호출 -> 응답 파싱/검증 순서로 처리.
   * 모든 실패 상황에서 예외를 던지지 않고 null 동등값(빈 타겟) 또는 캐시된 응답으로 폴백.
   *
   * @param request - 현재 게임 상태 기반 전략 요청 데이터
   * @returns 고스트 타겟 위치, 전략 설명, 신뢰도를 포함한 응답
   */
  async requestStrategy(request: LLMStrategyRequest): Promise<LLMStrategyResponse> {
    // 패턴 분석기에 현재 데이터 기록
    if (this.patternAnalyzer !== null) {
      this.patternAnalyzer.record(
        request.currentTick,
        request.pacmanDirection,
        request.pacmanPosition,
      );
    }

    // 1단계: 캐시 확인
    const cacheKey = this.cache.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // 2단계: 레이트 리밋 확인
    if (!this.rateLimiter.tryAcquire()) {
      console.warn('LLM 전략 요청이 레이트 리밋에 도달했습니다');
      return this.getFallbackResponse();
    }

    // 3단계: 프롬프트 생성
    let userPrompt = this.buildPrompt(request);

    // 3-1단계: Tier 5 온체인 컨텍스트 주입 (MCP Bridge)
    if (this.patternAnalyzer !== null && this.enableMcpTools) {
      const onchainContext = await this.fetchOnchainContext();
      if (onchainContext.length > 0) {
        userPrompt = `${userPrompt}\n\n=== 온체인 컨텍스트 (MCP Bridge) ===\n${onchainContext}\n\n위 온체인 데이터를 전략에 반영하세요. 상대 승률이 높으면 공격적으로,\n내가 언더독이면 보수적으로 플레이하여 관중의 서사에 부응하세요.`;
      }
    }

    // 4단계: API 호출
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // 5단계: 응답 텍스트 추출
      const responseText = this.extractTextFromResponse(message);
      if (responseText === null) {
        console.warn('LLM 응답에서 텍스트를 추출할 수 없습니다');
        return this.getFallbackResponse();
      }

      // 6단계: JSON 파싱 및 검증
      const parsed = this.parseAndValidateResponse(responseText);
      if (parsed === null) {
        console.warn('LLM 응답 JSON 파싱/검증에 실패했습니다');
        return this.getFallbackResponse();
      }

      // 7단계: 캐시 저장 및 반환
      this.cache.set(cacheKey, parsed);
      this.lastSuccessfulResponse = parsed;
      return parsed;
    } catch (error: unknown) {
      // API 오류 처리 — 예외를 던지지 않고 폴백
      if (error instanceof Anthropic.APIError) {
        console.warn(`Claude API 오류 (상태: ${String(error.status)}): ${error.message}`);
      } else if (error instanceof Error) {
        console.warn(`LLM 전략 요청 실패: ${error.message}`);
      } else {
        console.warn('LLM 전략 요청 중 알 수 없는 오류 발생');
      }

      return this.getFallbackResponse();
    }
  }

  /**
   * 요청 데이터를 기반으로 적절한 프롬프트 생성
   * 패턴 분석기가 활성화된 경우 Tier 5 프롬프트 사용
   * @param request - LLM 전략 요청 데이터
   * @returns 사용자 프롬프트 문자열
   */
  private buildPrompt(request: LLMStrategyRequest): string {
    if (this.patternAnalyzer !== null) {
      const summary = this.patternAnalyzer.getSummary();
      const predicted = this.patternAnalyzer.predictPosition(
        request.pacmanPosition,
        request.pacmanDirection,
        3, // 3틱 후 예측
      );
      return buildTier5Prompt(request, summary, predicted);
    }

    return buildTier4Prompt(request);
  }

  /**
   * 온체인 컨텍스트를 MCP Bridge를 통해 조회
   *
   * Claude API에 MCP 도구를 제공하여 어떤 온체인 데이터를 조회할지 결정하게 한 후,
   * tool_use 응답 블록에 대해 executeMcpTool()을 호출하여 결과를 수집합니다.
   * 실패 시 빈 문자열을 반환하여 graceful degradation을 보장합니다.
   *
   * @returns 온체인 컨텍스트 문자열 (실패 시 빈 문자열)
   */
  private async fetchOnchainContext(): Promise<string> {
    // 컨트랙트 인스턴스가 없으면 조회 불가
    if (this.provider === null || this.arenaContract === null || this.wagerPoolContract === null) {
      return '';
    }

    try {
      // McpTool → Anthropic Tool 형식으로 변환
      const tools: Anthropic.Tool[] = mcpTools.map((tool: McpTool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object' as const,
          properties: tool.input_schema.properties as Record<string, unknown> | undefined,
          required: tool.input_schema.required.length > 0
            ? [...tool.input_schema.required]
            : undefined,
        },
      }));

      // Claude에게 어떤 온체인 도구를 호출할지 결정하도록 요청
      const toolSelectionMessage = await this.client.messages.create({
        model: this.model,
        max_tokens: 256,
        system: '당신은 팩맨 게임 AI의 온체인 데이터 분석 보조입니다. 제공된 도구를 사용하여 전략 수립에 유용한 온체인 데이터를 조회하세요.',
        messages: [
          {
            role: 'user',
            content: '현재 매치에 필요한 온체인 데이터를 조회해주세요. 상대 에이전트 통계, 현재 배당률, 배팅 풀 크기 등을 확인하세요.',
          },
        ],
        tools,
        tool_choice: { type: 'auto' },
      });

      // tool_use 블록들을 수집하여 실행
      const contextParts: string[] = [];

      for (const block of toolSelectionMessage.content) {
        if (block.type === 'tool_use') {
          try {
            const result = await executeMcpTool(
              block.name,
              block.input,
              this.provider,
              this.arenaContract,
              this.wagerPoolContract,
            );
            contextParts.push(
              `[${block.name}] ${JSON.stringify(result)}`,
            );
          } catch (toolError: unknown) {
            // 개별 도구 실패는 무시하고 계속 진행
            const errorMsg = toolError instanceof Error ? toolError.message : '알 수 없는 오류';
            console.warn(`MCP 도구 '${block.name}' 실행 실패: ${errorMsg}`);
          }
        }
      }

      return contextParts.join('\n');
    } catch (error: unknown) {
      // 전체 MCP 조회 실패 시 빈 문자열 반환 (graceful degradation)
      const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn(`온체인 컨텍스트 조회 실패: ${errorMsg}`);
      return '';
    }
  }

  /**
   * Claude API 응답에서 텍스트 콘텐츠 추출
   * @param message - Claude API 메시지 응답
   * @returns 추출된 텍스트 또는 null
   */
  private extractTextFromResponse(message: Anthropic.Message): string | null {
    for (const block of message.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return null;
  }

  /**
   * 응답 텍스트를 파싱하고 유효성 검증
   * JSON 블록 추출, 구조 검증, 좌표 범위 클램핑을 수행
   * @param text - LLM 응답 텍스트
   * @returns 검증된 LLMStrategyResponse 또는 null
   */
  private parseAndValidateResponse(text: string): LLMStrategyResponse | null {
    // JSON 블록 추출 (코드 블록 또는 순수 JSON)
    const jsonStr = this.extractJsonFromText(text);
    if (jsonStr === null) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return null;
    }

    // 구조 검증
    if (!isValidRawResponse(parsed)) {
      return null;
    }

    // 타겟 좌표 추출 및 검증
    const ghostTargets = new Map<GhostId, Position>();
    const targets = parsed.targets as Record<string, unknown>;

    for (const ghostId of ALL_GHOST_IDS) {
      const targetData = targets[ghostId];
      if (isValidPosition(targetData)) {
        // 좌표를 미로 경계 내로 클램프
        ghostTargets.set(ghostId, {
          x: Math.max(0, Math.min(MAZE_WIDTH - 1, Math.round(targetData.x))),
          y: Math.max(0, Math.min(MAZE_HEIGHT - 1, Math.round(targetData.y))),
        });
      }
    }

    // 최소 1개의 유효한 타겟이 있어야 성공으로 처리
    if (ghostTargets.size === 0) {
      return null;
    }

    // 신뢰도를 0~1 범위로 클램프
    const confidence = Math.max(0, Math.min(1, parsed.confidence));

    return {
      ghostTargets,
      strategy: parsed.strategy,
      confidence,
    };
  }

  /**
   * 텍스트에서 JSON 문자열 추출
   * 코드 블록(```json ... ```) 또는 중괄호 블록({...})에서 추출
   * @param text - 원본 텍스트
   * @returns 추출된 JSON 문자열 또는 null
   */
  private extractJsonFromText(text: string): string | null {
    // 1. 코드 블록에서 추출 시도
    const codeBlockMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(text);
    if (codeBlockMatch !== null && codeBlockMatch[1] !== undefined) {
      return codeBlockMatch[1].trim();
    }

    // 2. 중괄호 블록에서 추출 시도
    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      return text.slice(braceStart, braceEnd + 1);
    }

    return null;
  }

  /**
   * 폴백 응답 반환
   * 마지막 성공 응답이 있으면 재사용, 없으면 빈 기본 응답 반환
   * @returns 폴백 LLMStrategyResponse
   */
  private getFallbackResponse(): LLMStrategyResponse {
    if (this.lastSuccessfulResponse !== null) {
      return this.lastSuccessfulResponse;
    }

    // 기본 빈 응답 — 호출자(GhostAIController)가 기본 AI로 폴백
    return {
      ghostTargets: new Map<GhostId, Position>(),
      strategy: '폴백: LLM 응답 불가, 기본 AI 사용',
      confidence: 0,
    };
  }
}

// ===== 내보내기 =====

export { ClaudeLLMStrategy };
export type { LLMStrategyConfig };
