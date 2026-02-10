/**
 * Ghost Protocol 챌린지 매치 클라이언트
 * Socket.io 기반으로 외부 에이전트가 챌린지 매치에 참가할 수 있게 한다.
 *
 * 전체 플로우:
 * 1. HTTP POST /api/v1/challenge → 챌린지 생성
 * 2. Socket.io 연결 → auth_challenge 인증
 * 3. game_state 수신 → agent.onGameState() → agent_action 전송
 * 4. match_result 수신 → 종료
 */
import { io, Socket } from 'socket.io-client';
import type { GhostAgent, MatchResult } from './GhostAgent.js';
import type { GameState, DifficultyTier, MatchId } from '@ghost-protocol/shared';
import { WS_EVENTS, AGENT_ACTION_TIMEOUT_MS } from '@ghost-protocol/shared';

/**
 * 챌린지 클라이언트 설정
 */
export interface ChallengeClientConfig {
  /** 서버 URL (HTTP/HTTPS — 예: https://your-server.ngrok-free.dev) */
  readonly serverUrl: string;
  /** 에이전트 인스턴스 */
  readonly agent: GhostAgent;
  /** 난이도 (1~5, 기본값: 3) */
  readonly difficulty?: DifficultyTier;
  /** ngrok 무료 티어 우회 헤더 추가 여부 (기본값: true) */
  readonly ngrokBypass?: boolean;
}

/**
 * 챌린지 생성 응답 타입
 */
interface ChallengeResponse {
  challenge: {
    id: string;
    sessionId: string;
    status: string;
    difficulty: number;
  };
}

export class ChallengeClient {
  private socket: Socket | null = null;
  private readonly config: ChallengeClientConfig;
  private readonly difficulty: DifficultyTier;
  private readonly ngrokBypass: boolean;
  private matchId: string | null = null;
  private sessionToken: string;
  private connected = false;

  constructor(config: ChallengeClientConfig) {
    this.config = config;
    this.difficulty = config.difficulty ?? 3;
    this.ngrokBypass = config.ngrokBypass ?? true;
    // 랜덤 세션 토큰 생성
    this.sessionToken = `token-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 챌린지 매치를 생성하고 게임을 시작한다.
   * 매치가 끝나면 Promise가 resolve된다.
   *
   * @returns 매치 결과 (승패, 점수)
   */
  async play(): Promise<{ winner: string; score: number }> {
    // Step 1: HTTP로 챌린지 생성
    const baseUrl = this.config.serverUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.ngrokBypass) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }

    console.log(`[ChallengeClient] Creating challenge (difficulty: ${String(this.difficulty)})...`);

    const challengeRes = await fetch(`${baseUrl}/api/v1/challenge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionToken: this.sessionToken,
        difficulty: this.difficulty,
        agentId: this.config.agent.name,
      }),
    });

    if (!challengeRes.ok) {
      const errData = await challengeRes.json().catch(() => ({ error: challengeRes.statusText })) as { error?: string };
      throw new Error(`Challenge creation failed: ${errData.error ?? 'Unknown error'}`);
    }

    const { challenge } = (await challengeRes.json()) as ChallengeResponse;
    this.matchId = challenge.id;

    console.log(`[ChallengeClient] Challenge created: ${this.matchId}`);
    console.log(`[ChallengeClient] Status: ${challenge.status}, SessionId: ${challenge.sessionId}`);

    // Step 2: Socket.io 연결 + 인증 + 게임 루프
    return new Promise<{ winner: string; score: number }>((resolve, reject) => {
      const socketUrl = baseUrl;

      this.socket = io(socketUrl, {
        transports: ['websocket'],
        extraHeaders: this.ngrokBypass
          ? { 'ngrok-skip-browser-warning': 'true' }
          : undefined,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log(`[ChallengeClient] Socket.io connected (id: ${this.socket?.id ?? 'unknown'})`);

        // Step 3: 챌린지 인증
        this.socket!.emit(WS_EVENTS.AUTH_CHALLENGE, {
          matchId: this.matchId,
          sessionToken: this.sessionToken,
        });

        console.log('[ChallengeClient] auth_challenge sent, waiting for confirmation...');
      });

      // 인증 성공
      this.socket.on(WS_EVENTS.AUTH_CHALLENGE_OK, (data: unknown) => {
        const info = data as { matchId: string; sessionId: string };
        console.log(`[ChallengeClient] Authenticated! Match: ${info.matchId}, Session: ${info.sessionId}`);
        this.config.agent.onMatchStart?.(this.matchId! as MatchId);
      });

      // 카운트다운
      this.socket.on(WS_EVENTS.MATCH_COUNTDOWN, (data: unknown) => {
        const info = data as { countdown: number };
        console.log(`[ChallengeClient] Countdown: ${String(info.countdown)}`);
      });

      // 매치 시작
      this.socket.on(WS_EVENTS.MATCH_START, (data: unknown) => {
        const info = data as { matchId: string };
        console.log(`[ChallengeClient] Match started: ${info.matchId}`);
      });

      // 라운드 시작
      this.socket.on(WS_EVENTS.ROUND_START, (data: unknown) => {
        const info = data as { round: number };
        this.config.agent.onRoundStart?.(info.round);
      });

      // 게임 상태 수신 → 에이전트 행동 결정 → 전송
      this.socket.on(WS_EVENTS.GAME_STATE, (state: unknown) => {
        const gameState = state as GameState;

        const startTime = performance.now();
        const action = this.config.agent.onGameState(gameState);
        const elapsed = performance.now() - startTime;

        if (elapsed > AGENT_ACTION_TIMEOUT_MS) {
          console.warn(`[ChallengeClient] Agent action timeout: ${elapsed.toFixed(1)}ms (limit: ${String(AGENT_ACTION_TIMEOUT_MS)}ms)`);
          return;
        }

        this.socket?.emit(WS_EVENTS.AGENT_ACTION, {
          direction: action.direction,
        });
      });

      // 매치 결과
      this.socket.on(WS_EVENTS.MATCH_RESULT, (data: unknown) => {
        const result = data as { matchId: string; winner: string; score: number; lives: number; reason?: string };

        // 이 매치의 결과만 처리
        if (result.matchId !== this.matchId) return;

        console.log(`[ChallengeClient] Match result: ${result.winner} wins! Score: ${String(result.score)}`);

        // GhostAgent 콜백 호출
        const agentResult: MatchResult = {
          matchId: this.matchId! as MatchId,
          won: result.winner === 'pacman',
          finalScore: result.score,
          opponentScore: 0,
        };
        this.config.agent.onMatchEnd?.(agentResult);

        this.disconnect();
        resolve({ winner: result.winner, score: result.score });
      });

      // 에러 처리
      this.socket.on('error', (err: unknown) => {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        console.error(`[ChallengeClient] Socket error:`, errorObj.message);
        this.config.agent.onError?.(errorObj);
      });

      this.socket.on('connect_error', (err: Error) => {
        console.error(`[ChallengeClient] Connection error:`, err.message);
        if (!this.connected) {
          this.disconnect();
          reject(new Error(`Socket.io connection failed: ${err.message}`));
        }
      });

      this.socket.on('disconnect', (reason: string) => {
        console.log(`[ChallengeClient] Disconnected: ${reason}`);
        this.connected = false;
      });
    });
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    this.connected = false;
    this.socket?.disconnect();
    this.socket = null;
  }
}
