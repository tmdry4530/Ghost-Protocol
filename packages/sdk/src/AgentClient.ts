import WebSocket from 'ws';
import { Wallet } from 'ethers';
import type { GhostAgent, MatchResult } from './GhostAgent.js';
import type { GameState, AgentAddress, MatchId } from '@ghost-protocol/shared';
import { WS_EVENTS, AGENT_ACTION_TIMEOUT_MS } from '@ghost-protocol/shared';

/**
 * 에이전트 클라이언트 설정
 */
export interface AgentClientConfig {
  /** WebSocket 서버 URL */
  readonly serverUrl: string;
  /** 에이전트 인스턴스 */
  readonly agent: GhostAgent;
  /** 에이전트 주소 */
  readonly agentAddress: AgentAddress;
  /** 재연결 자동 시도 여부 */
  readonly autoReconnect?: boolean;
  /** 최대 재연결 시도 횟수 */
  readonly maxReconnectAttempts?: number;
  /** EIP-712 인증용 개인키 (선택) */
  readonly privateKey?: string;
  /** Moltbook API key (선택 - moltbook_xxx 형식) */
  readonly moltbookApiKey?: string;
  /** 희망 역할 (선택 - pacman 또는 ghost) */
  readonly role?: 'pacman' | 'ghost';
}

/**
 * Ghost Protocol 에이전트 WebSocket 클라이언트
 *
 * 에이전트를 게임 서버에 연결하고 게임 상태를 수신하여
 * 에이전트의 행동을 서버로 전송합니다.
 *
 * @example
 * ```typescript
 * const client = new AgentClient({
 *   serverUrl: 'ws://localhost:3001',
 *   agent: new MyAgent('나의 에이전트'),
 *   agentAddress: '0x...' as AgentAddress,
 * });
 * await client.connect();
 * ```
 */
export class AgentClient {
  private ws: WebSocket | null = null;
  private readonly config: Required<AgentClientConfig>;
  private reconnectAttempts = 0;
  private connected = false;
  private identityToken: string | null = null;
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AgentClientConfig) {
    this.config = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      role: 'pacman',
      ...config,
    } as Required<AgentClientConfig>;
  }

  /**
   * 서버에 연결
   * WebSocket 연결을 수립하고 이벤트 리스너를 등록합니다.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          // Moltbook 인증 흐름 (선택적)
          if (this.config.moltbookApiKey) {
            await this.refreshMoltbookToken();
            // 토큰 자동 갱신 설정 (50분마다, 1시간 만료 전)
            this.tokenRefreshTimer = setInterval(
              () => void this.refreshMoltbookToken().catch((err) => {
                this.config.agent.onError?.(err as Error);
              }),
              50 * 60 * 1000,
            );
          }

          this.ws = new WebSocket(this.config.serverUrl);

          this.ws.on('open', () => {
            void (async () => {
              this.connected = true;
              this.reconnectAttempts = 0;

              // EIP-712 인증 처리 (선택적)
              if (this.config.privateKey) {
                try {
                  await this.authenticateWithEIP712();
                } catch (error) {
                  this.config.agent.onError?.(error as Error);
                  reject(error instanceof Error ? error : new Error(String(error)));
                  return;
                }
              }

              resolve();
            })();
          });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.handleDisconnect();
      });

          this.ws.on('error', (error: Error) => {
            if (!this.connected) {
              reject(error);
            }
            this.config.agent.onError?.(error);
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  /**
   * 서버 연결 해제
   */
  disconnect(): void {
    this.connected = false;
    this.ws?.close();
    this.ws = null;

    // 토큰 갱신 타이머 정리
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  /**
   * 수신 메시지 처리
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      let dataString: string;
      if (typeof data === 'string') {
        dataString = data;
      } else if (Buffer.isBuffer(data)) {
        dataString = data.toString('utf-8');
      } else if (Array.isArray(data)) {
        dataString = Buffer.concat(data).toString('utf-8');
      } else if (data instanceof ArrayBuffer) {
        dataString = Buffer.from(data).toString('utf-8');
      } else {
        // 기타 타입 - 문자열로 강제 변환
        dataString = '';
      }
      const message = JSON.parse(dataString) as {
        event: string;
        payload: unknown;
      };

      if (message.event === WS_EVENTS.GAME_STATE) {
        const state = message.payload as GameState;

        // 100ms 타임아웃 체크
        const startTime = performance.now();
        const action = this.config.agent.onGameState(state);
        const elapsed = performance.now() - startTime;

        if (elapsed > AGENT_ACTION_TIMEOUT_MS) {
          console.warn(
            `에이전트 액션 타임아웃: ${elapsed.toFixed(1)}ms (제한: ${String(AGENT_ACTION_TIMEOUT_MS)}ms)`
          );
          return; // 해당 틱 건너뜀
        }

        // 행동을 서버로 전송
        this.send(WS_EVENTS.AGENT_ACTION, {
          agentAddress: this.config.agentAddress,
          direction: action.direction,
          tick: state.tick,
          metadata: action.metadata,
        });
      } else if (message.event === WS_EVENTS.MATCH_START) {
        const { matchId } = message.payload as { matchId: MatchId };
        this.config.agent.onMatchStart?.(matchId);
      } else if (message.event === WS_EVENTS.MATCH_RESULT) {
        const result = message.payload as MatchResult;
        this.config.agent.onMatchEnd?.(result);
      } else if (message.event === WS_EVENTS.ROUND_START) {
        const { round } = message.payload as { round: number };
        this.config.agent.onRoundStart?.(round);
      }
    } catch {
      // JSON 파싱 실패 시 무시
    }
  }

  /**
   * 서버로 이벤트 전송
   */
  private send(event: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }));
    }
  }

  /**
   * 연결 해제 시 재연결 처리
   */
  private handleDisconnect(): void {
    if (
      this.config.autoReconnect &&
      this.reconnectAttempts < this.config.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;
      /** 지수 백오프: 1s, 2s, 4s, 8s, 최대 30s */
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30_000);
      setTimeout(() => {
        void this.connect();
      }, delay);
    }
  }

  /**
   * EIP-712 타입 데이터 서명 후 인증
   */
  private async authenticateWithEIP712(): Promise<void> {
    if (!this.config.privateKey) {
      return;
    }

    const wallet = new Wallet(this.config.privateKey);
    const timestamp = Date.now();

    // EIP-712 타입 데이터 정의
    const domain = {
      name: 'Ghost Protocol',
      version: '1',
    };

    const types = {
      Auth: [
        { name: 'agent', type: 'address' },
        { name: 'timestamp', type: 'uint256' },
      ],
    };

    const value = {
      agent: this.config.agentAddress,
      timestamp,
    };

    // 서명 생성
    const signature = await wallet.signTypedData(domain, types, value);

    // 인증 메시지 전송
    this.send('auth', {
      agentAddress: this.config.agentAddress,
      signature,
      timestamp,
    });
  }

  /**
   * Moltbook identity token 갱신
   * @private
   */
  private async refreshMoltbookToken(): Promise<void> {
    if (!this.config.moltbookApiKey) {
      return;
    }

    // ⚠️ 반드시 www.moltbook.com 사용 (www 없으면 Authorization 헤더가 strip됨)
    const response = await fetch(
      'https://www.moltbook.com/api/v1/agents/me/identity-token',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.moltbookApiKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Moltbook identity token 발급 실패: ${(errorData as { error?: string }).error ?? response.statusText}`
      );
    }

    const data = await response.json() as { identity_token: string };
    this.identityToken = data.identity_token;
  }

  /**
   * Moltbook 인증으로 서버에 에이전트 등록
   * @returns 세션 토큰
   */
  async registerWithMoltbook(): Promise<string> {
    if (!this.identityToken) {
      throw new Error('Moltbook identity token이 없습니다. connect()를 먼저 호출하세요.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Moltbook-Identity': this.identityToken,
    };

    const response = await fetch(
      `${this.config.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/v1/arena/register`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: this.config.role,
          agentName: this.config.agent.constructor.name,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `참가 등록 실패: ${(errorData as { error?: string }).error ?? response.statusText}`
      );
    }

    const data = await response.json() as { data: { sessionToken: string } };
    return data.data.sessionToken;
  }
}
