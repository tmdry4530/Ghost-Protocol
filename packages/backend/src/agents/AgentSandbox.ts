/**
 * 에이전트 샌드박스 모듈
 *
 * isolated-vm을 사용하여 외부 에이전트 코드를 안전하게 격리된 환경에서 실행한다.
 * 파일시스템, 네트워크 접근이 차단되며, 메모리와 실행 시간이 제한된다.
 */

import ivm from 'isolated-vm';
import pino from 'pino';
import type { GameState, AgentAction, Direction } from '@ghost-protocol/shared';
import { AGENT_ACTION_TIMEOUT_MS } from '@ghost-protocol/shared';

/** 로거 인스턴스 */
const logger = pino({ name: 'agent-sandbox' });

/** 유효한 이동 방향 집합 */
const VALID_DIRECTIONS: ReadonlySet<string> = new Set<Direction>([
  'up',
  'down',
  'left',
  'right',
]);

/**
 * 샌드박스 설정 인터페이스
 */
export interface SandboxConfig {
  /** 메모리 제한 (MB 단위, 기본값: 128) */
  readonly memoryLimitMB?: number;
  /** 에이전트 행동 타임아웃 (밀리초, 기본값: AGENT_ACTION_TIMEOUT_MS = 100) */
  readonly timeoutMs?: number;
}

/**
 * 에이전트 코드의 반환값 타입 가드
 * unknown 값이 유효한 AgentAction인지 검증한다.
 */
function isValidAgentAction(value: unknown): value is AgentAction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj['direction'] !== 'string') {
    return false;
  }

  return VALID_DIRECTIONS.has(obj['direction']);
}

/**
 * 에이전트 샌드박스
 *
 * isolated-vm 기반의 격리된 실행 환경을 제공한다.
 * 에이전트 코드는 파일시스템/네트워크에 접근할 수 없으며,
 * 메모리와 실행 시간이 엄격하게 제한된다.
 *
 * @example
 * ```typescript
 * const sandbox = new AgentSandbox({ memoryLimitMB: 128 });
 * await sandbox.loadAgent(agentCode, 'my-agent');
 * const action = await sandbox.executeAction(gameState);
 * sandbox.dispose();
 * ```
 */
export class AgentSandbox {
  /** isolated-vm Isolate 인스턴스 */
  private isolate: ivm.Isolate | null = null;

  /** 격리된 실행 컨텍스트 */
  private context: ivm.Context | null = null;

  /** 에이전트의 onGameState 함수 참조 */
  private onGameStateRef: ivm.Reference | null = null;

  /** 현재 로드된 에이전트 이름 */
  private _agentName: string | null = null;

  /** 메모리 제한 (MB) */
  private readonly memoryLimitMB: number;

  /** 실행 타임아웃 (밀리초) */
  private readonly timeoutMs: number;

  /** 리소스가 해제되었는지 여부 */
  private disposed = false;

  /**
   * 에이전트 샌드박스 생성
   * @param config - 샌드박스 설정 (선택 사항)
   */
  constructor(config?: SandboxConfig) {
    this.memoryLimitMB = config?.memoryLimitMB ?? 128;
    this.timeoutMs = config?.timeoutMs ?? AGENT_ACTION_TIMEOUT_MS;
  }

  /**
   * 현재 로드된 에이전트 이름 반환
   * @returns 에이전트 이름 또는 null (로드 전)
   */
  get agentName(): string | null {
    return this._agentName;
  }

  /**
   * 에이전트 코드를 샌드박스에 로드
   *
   * JavaScript 문자열을 컴파일하여 격리된 환경에서 실행한다.
   * 에이전트 코드는 전역 함수 `onGameState(state)`를 정의해야 한다.
   *
   * @param agentCode - 에이전트 JavaScript 코드 문자열
   * @param agentName - 에이전트 식별 이름
   * @throws 구문 오류 또는 컴파일 실패 시 에러
   */
  async loadAgent(agentCode: string, agentName: string): Promise<void> {
    if (this.disposed) {
      throw new Error('Sandbox already disposed. Create a new instance.');
    }

    // Clean up existing resources if any
    this.releaseInternalResources();

    logger.info({ agentName }, 'Agent code loading started');

    // Create Isolate (with memory limit)
    this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimitMB });

    // Create isolated context
    this.context = await this.isolate.createContext();

    // Compile and run agent code to register global function
    const script = await this.isolate.compileScript(agentCode, {
      filename: `file:///${agentName}.js`,
    });

    await script.run(this.context, { timeout: this.timeoutMs });
    script.release();

    // Acquire onGameState function reference
    const globalRef = this.context.global;
    this.onGameStateRef = await globalRef.get('onGameState', { reference: true });

    // Verify onGameState is a function
    if (this.onGameStateRef.typeof !== 'function') {
      this.onGameStateRef.release();
      this.onGameStateRef = null;
      throw new Error(
        `Agent '${agentName}' does not define global function onGameState.`,
      );
    }

    this._agentName = agentName;
    logger.info({ agentName }, 'Agent code loading completed');
  }

  /**
   * 게임 상태를 전달하고 에이전트 행동을 수신
   *
   * GameState를 JSON 직렬화하여 격리된 환경에 전달하고,
   * 에이전트의 onGameState 함수를 호출하여 결과를 받는다.
   *
   * @param state - 현재 게임 상태
   * @returns 유효한 AgentAction 또는 null (타임아웃/에러 시 턴 몰수)
   */
  async executeAction(state: GameState): Promise<AgentAction | null> {
    if (this.disposed) {
      logger.warn('Execution attempted on disposed sandbox');
      return null;
    }

    if (!this.isolate || !this.context || !this.onGameStateRef) {
      logger.warn('Execution attempted without agent loaded');
      return null;
    }

    // Check if Isolate is disposed
    if (this.isolate.isDisposed) {
      logger.warn({ agentName: this._agentName }, 'Isolate already disposed');
      return null;
    }

    try {
      // Convert GameState to ExternalCopy to cross isolation boundary
      const stateCopy = new ivm.ExternalCopy(state);

      // Call onGameState function (with timeout, receive result as copy)
      const result: unknown = await this.onGameStateRef.apply(
        undefined,
        [stateCopy.copyInto()],
        { result: { copy: true }, timeout: this.timeoutMs },
      );

      stateCopy.release();

      // Validate return value
      if (!isValidAgentAction(result)) {
        logger.warn(
          { agentName: this._agentName, result },
          'Agent returned invalid action — turn forfeited',
        );
        return null;
      }

      return { direction: result.direction };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      // Handle timeout error
      if (message.includes('Script execution timed out')) {
        logger.warn(
          { agentName: this._agentName, timeoutMs: this.timeoutMs },
          'Agent execution timeout — turn forfeited',
        );
        return null;
      }

      // Handle memory exceeded error
      if (
        message.includes('Isolate was disposed during execution') ||
        message.includes('out of memory')
      ) {
        logger.error(
          { agentName: this._agentName },
          'Agent memory limit exceeded — turn forfeited',
        );
        return null;
      }

      // Handle other errors
      logger.error(
        { agentName: this._agentName, error: message },
        'Error during agent execution — turn forfeited',
      );
      return null;
    }
  }

  /**
   * Isolate의 현재 힙 메모리 사용량 반환
   * @returns 사용 중인 힙 메모리 (바이트), Isolate가 없으면 0
   */
  getMemoryUsage(): number {
    if (!this.isolate || this.isolate.isDisposed) {
      return 0;
    }

    try {
      const stats = this.isolate.getHeapStatisticsSync();
      return stats.used_heap_size + stats.externally_allocated_size;
    } catch {
      return 0;
    }
  }

  /**
   * 모든 리소스 해제
   *
   * Isolate, Context, Reference를 명시적으로 해제한다.
   * 해제 후에는 executeAction 호출 시 null을 반환한다.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    logger.info({ agentName: this._agentName }, 'Sandbox resources released');
    this.releaseInternalResources();
    this.disposed = true;
  }

  /**
   * Clean up internal resources (also used during reload)
   */
  private releaseInternalResources(): void {
    if (this.onGameStateRef) {
      try {
        this.onGameStateRef.release();
      } catch {
        // Ignore if already released
      }
      this.onGameStateRef = null;
    }

    if (this.context) {
      try {
        this.context.release();
      } catch {
        // Ignore if already released
      }
      this.context = null;
    }

    if (this.isolate && !this.isolate.isDisposed) {
      try {
        this.isolate.dispose();
      } catch {
        // Ignore if already released
      }
    }
    this.isolate = null;

    this._agentName = null;
  }
}
