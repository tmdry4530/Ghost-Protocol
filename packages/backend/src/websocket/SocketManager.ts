/**
 * Ghost Protocol WebSocket 룸 매니저
 * Socket.io 기반 실시간 통신을 관리하며 게임 이벤트를 적절한 룸에 라우팅한다.
 *
 * 책임:
 * - 클라이언트 연결/해제 처리
 * - 룸(매치/서바이벌/토너먼트/배팅/로비) 참가/퇴장
 * - GameLoopManager 콜백 연결 및 게임 상태 브로드캐스트
 * - 플레이어 입력 수신 및 검증
 * - 외부 호출용 브로드캐스트 API 제공
 */
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Direction, GameStateFrame, RoundStartEvent } from '@ghost-protocol/shared';
import { WS_EVENTS } from '@ghost-protocol/shared';
import type { GameLoopManager } from '../game/GameLoopManager.js';
import type { ApiStateStore } from '../routes/api.js';
import type { ChallengeMatchOrchestrator } from '../orchestrator/ChallengeMatchOrchestrator.js';
import pino from 'pino';

/** 구조화된 로거 */
const logger = pino({ name: 'socket-manager' });

/** 룸 접두사 상수 */
const ROOM_PREFIX = {
  MATCH: 'match:',
  SURVIVAL: 'survival:',
  TOURNAMENT: 'tournament:',
  BETTING: 'betting:',
  LOBBY: 'lobby',
} as const;

/** 유효한 이동 방향 집합 (빠른 조회용) */
const VALID_DIRECTIONS = new Set<string>(['up', 'down', 'left', 'right']);

/**
 * Socket.io 룸 관리 및 이벤트 라우팅 매니저
 * GameLoopManager와 연동하여 게임 상태를 클라이언트에 실시간 전달한다.
 */
export class SocketManager {
  /** Socket.io 서버 인스턴스 */
  private io: SocketIOServer;

  /** 게임 루프 매니저 참조 */
  private gameLoopManager: GameLoopManager;

  /** API 상태 저장소 참조 (로비 참가 시 현재 상태 전송용) */
  private stateStore: ApiStateStore | null = null;

  /** 소켓 ID → 참가 중인 룸 ID 매핑 */
  private socketSessions: Map<string, Set<string>> = new Map();

  /** 챌린지 매치 오케스트레이터 참조 */
  private challengeOrchestrator: ChallengeMatchOrchestrator | null = null;

  /** 에이전트 소켓 ID → 인증된 matchId 매핑 */
  private agentSockets: Map<string, string> = new Map();

  /**
   * SocketManager 생성
   * @param io Socket.io 서버 인스턴스
   * @param gameLoopManager 게임 루프 매니저 인스턴스
   */
  constructor(io: SocketIOServer, gameLoopManager: GameLoopManager) {
    this.io = io;
    this.gameLoopManager = gameLoopManager;
    this.setupGameCallbacks();
    this.setupConnectionHandler();
  }

  /**
   * GameLoopManager 콜백 연결
   * 게임 상태, 게임 오버, 라운드 변경 이벤트를 Socket.io 룸으로 라우팅한다.
   */
  private setupGameCallbacks(): void {
    // 게임 상태 프레임을 해당 룸에 브로드캐스트
    this.gameLoopManager.setOnGameState((sessionId: string, frame: GameStateFrame) => {
      this.io.to(sessionId).emit(WS_EVENTS.GAME_STATE, frame);
    });

    // 게임 오버 시 매치 결과 브로드캐스트
    this.gameLoopManager.setOnGameOver((sessionId: string, state) => {
      this.io.to(sessionId).emit(WS_EVENTS.MATCH_RESULT, {
        matchId: sessionId,
        winner: '',
        scoreA: state.score,
        scoreB: 0,
        gameLogHash: '',
      });
      logger.info(`Game ended: ${sessionId}, final score: ${String(state.score)}`);
    });

    // Round change event
    this.gameLoopManager.setOnRoundChange((sessionId: string, round: number) => {
      const roundEvent: RoundStartEvent = {
        round,
        difficulty: 1,
        mazeId: 'classic',
        ghostSpeed: 0.75,
        powerDuration: 8,
      };
      this.io.to(sessionId).emit(WS_EVENTS.ROUND_START, roundEvent);
      logger.info(`Round started: ${sessionId}, round ${String(round)}`);
    });
  }

  /**
   * 소켓 연결 핸들러 설정
   * 새 클라이언트 연결 시 이벤트 리스너를 등록한다.
   */
  private setupConnectionHandler(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`WebSocket connected: ${socket.id}`);
      this.socketSessions.set(socket.id, new Set());

      // === 방 참가 이벤트 ===

      socket.on(WS_EVENTS.JOIN_MATCH, (data: unknown) => {
        this.handleJoinRoom(socket, 'match', data);
      });

      socket.on(WS_EVENTS.JOIN_SURVIVAL, (data: unknown) => {
        this.handleJoinRoom(socket, 'survival', data);
      });

      socket.on(WS_EVENTS.JOIN_TOURNAMENT, (data: unknown) => {
        this.handleJoinRoom(socket, 'tournament', data);
      });

      socket.on(WS_EVENTS.JOIN_BETTING, (data: unknown) => {
        this.handleJoinRoom(socket, 'betting', data);
      });

      socket.on(WS_EVENTS.JOIN_LOBBY, () => {
        void socket.join(ROOM_PREFIX.LOBBY);
        const sessions = this.socketSessions.get(socket.id);
        sessions?.add(ROOM_PREFIX.LOBBY);
        logger.info(`${socket.id} -> lobby joined`);

        // Send current match/tournament state to new client
        if (this.stateStore) {
          // Send all active matches
          for (const match of this.stateStore.matches.values()) {
            socket.emit('match_update', match);
          }

          // Send all active tournaments
          for (const tournament of this.stateStore.tournaments.values()) {
            socket.emit('tournament_update', tournament);
          }

          logger.info(`${socket.id} -> lobby initial state sent (matches: ${this.stateStore.matches.size.toString()}, tournaments: ${this.stateStore.tournaments.size.toString()})`);
        }
      });

      // === 방 퇴장 ===

      socket.on('leave_room', (data: unknown) => {
        this.handleLeaveRoom(socket, data);
      });

      // === 챌린지 매치 에이전트 인증 ===
      socket.on(WS_EVENTS.AUTH_CHALLENGE, (data: unknown) => {
        this.handleChallengeAuth(socket, data);
      });

      // === 챌린지 매치 에이전트 행동 ===
      socket.on(WS_EVENTS.AGENT_ACTION, (data: unknown) => {
        this.handleChallengeAgentAction(socket, data);
      });

      // === 플레이어 입력 ===

      socket.on(WS_EVENTS.PLAYER_INPUT, (data: unknown) => {
        this.handlePlayerInput(socket, data);
      });

      // === 연결 해제 ===

      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * 방 참가 처리
   * 데이터 검증 후 소켓을 해당 룸에 조인시킨다.
   * @param socket 클라이언트 소켓
   * @param roomType 룸 타입 (match/survival/tournament/betting)
   * @param data 클라이언트가 전송한 원시 데이터
   */
  private handleJoinRoom(socket: Socket, roomType: string, data: unknown): void {
    // Runtime type guard
    if (data === null || data === undefined || typeof data !== 'object') {
      socket.emit('error', { message: 'Invalid room join request' });
      return;
    }

    const dataObj = data as Record<string, unknown>;

    // Accept matchId, sessionId, tournamentId as roomId (frontend compatibility)
    const roomId =
      dataObj['roomId'] ?? dataObj['matchId'] ?? dataObj['sessionId'] ?? dataObj['tournamentId'];
    if (typeof roomId !== 'string' || roomId.length === 0) {
      socket.emit('error', { message: 'Invalid roomId' });
      return;
    }

    const fullRoomId = `${roomType}:${roomId}`;
    void socket.join(fullRoomId);

    const sessions = this.socketSessions.get(socket.id);
    sessions?.add(fullRoomId);

    logger.info(`${socket.id} -> ${fullRoomId} joined`);

    // 새 클라이언트에게 현재 게임 상태 전체 동기화 전송
    const fullState = this.gameLoopManager.getFullSync(fullRoomId);
    if (fullState) {
      socket.emit(WS_EVENTS.GAME_STATE, fullState);
    }
  }

  /**
   * 방 퇴장 처리
   * @param socket 클라이언트 소켓
   * @param data 클라이언트가 전송한 원시 데이터
   */
  private handleLeaveRoom(socket: Socket, data: unknown): void {
    if (
      data === null ||
      data === undefined ||
      typeof data !== 'object' ||
      !('roomId' in data)
    ) {
      return;
    }

    const dataObj = data as Record<string, unknown>;
    const roomId = dataObj['roomId'];
    if (typeof roomId !== 'string') return;

    void socket.leave(roomId);
    this.socketSessions.get(socket.id)?.delete(roomId);
    logger.info(`${socket.id} <- ${roomId} left`);
  }

  /**
   * 플레이어 입력 처리
   * 방향 입력을 검증한 후 GameLoopManager에 전달한다.
   * @param _socket 클라이언트 소켓 (미래 인증 검증용으로 예약)
   * @param data 클라이언트가 전송한 원시 데이터
   */
  private handlePlayerInput(_socket: Socket, data: unknown): void {
    if (data === null || data === undefined || typeof data !== 'object') return;

    const dataObj = data as Record<string, unknown>;
    const sessionId = dataObj['sessionId'];
    const direction = dataObj['direction'];

    if (typeof sessionId !== 'string' || typeof direction !== 'string') return;
    if (!VALID_DIRECTIONS.has(direction)) return;

    // 서바이벌 모드 세션 키 형식으로 입력 전달
    const sessionKey = `survival:${sessionId}`;
    this.gameLoopManager.handleInput(
      sessionKey,
      'player',
      direction as Direction,
    );
  }

  /**
   * 연결 해제 처리
   * 소켓 세션 추적 데이터를 정리한다.
   * @param socket 해제된 소켓
   */
  private handleDisconnect(socket: Socket): void {
    // 챌린지 에이전트 연결 해제 처리
    const matchId = this.agentSockets.get(socket.id);
    if (matchId) {
      this.challengeOrchestrator?.onAgentDisconnected(socket.id);
      this.agentSockets.delete(socket.id);
    }

    this.socketSessions.delete(socket.id);
    logger.info(`WebSocket disconnected: ${socket.id}`);
  }

  /**
   * 배팅 업데이트 브로드캐스트
   * 외부에서 호출하여 해당 매치의 배팅 룸에 업데이트를 전송한다.
   * @param matchId 매치 ID
   * @param data 배팅 업데이트 데이터
   */
  broadcastBetUpdate(matchId: string, data: Record<string, unknown>): void {
    this.io.to(`${ROOM_PREFIX.BETTING}${matchId}`).emit(WS_EVENTS.BET_UPDATE, data);
  }

  /**
   * 토너먼트 진행 브로드캐스트
   * @param tournamentId 토너먼트 ID
   * @param data 토너먼트 진행 데이터
   */
  broadcastTournamentAdvance(tournamentId: string, data: Record<string, unknown>): void {
    this.io
      .to(`${ROOM_PREFIX.TOURNAMENT}${tournamentId}`)
      .emit(WS_EVENTS.TOURNAMENT_ADVANCE, data);
  }

  /**
   * 로비 글로벌 이벤트 브로드캐스트
   * @param event 이벤트 이름
   * @param data 이벤트 데이터
   */
  broadcastToLobby(event: string, data: Record<string, unknown>): void {
    this.io.to(ROOM_PREFIX.LOBBY).emit(event, data);
  }

  /**
   * 로비에 매치 업데이트 브로드캐스트
   * @param matchData 매치 정보
   */
  broadcastMatchUpdate(matchData: Record<string, unknown>): void {
    this.io.to(ROOM_PREFIX.LOBBY).emit('match_update', matchData);
  }

  /**
   * 로비에 토너먼트 업데이트 브로드캐스트
   * @param tournamentData 토너먼트 정보
   */
  broadcastTournamentUpdate(tournamentData: Record<string, unknown>): void {
    this.io.to(ROOM_PREFIX.LOBBY).emit('tournament_update', tournamentData);
  }

  /**
   * 로비에 피드 아이템 브로드캐스트
   * @param feedItem 피드 아이템
   */
  broadcastFeedItem(feedItem: Record<string, unknown>): void {
    this.io.to(ROOM_PREFIX.LOBBY).emit('feed_item', feedItem);
  }

  /**
   * 현재 연결된 클라이언트 수 반환
   * @returns 연결 수
   */
  getConnectedCount(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * 챌린지 매치 오케스트레이터 설정
   * @param orchestrator ChallengeMatchOrchestrator 인스턴스
   */
  setChallengeOrchestrator(orchestrator: ChallengeMatchOrchestrator): void {
    this.challengeOrchestrator = orchestrator;
    logger.info('ChallengeOrchestrator connected');
  }

  /**
   * 챌린지 매치 에이전트 인증 처리
   * sessionToken으로 매치 검증 후 룸 join + orchestrator 알림
   */
  private handleChallengeAuth(socket: Socket, data: unknown): void {
    if (data === null || data === undefined || typeof data !== 'object') {
      socket.emit('error', { message: 'Invalid challenge authentication request' });
      return;
    }

    const dataObj = data as Record<string, unknown>;
    const matchId = dataObj['matchId'];
    const sessionToken = dataObj['sessionToken'];

    if (typeof matchId !== 'string' || typeof sessionToken !== 'string') {
      socket.emit('error', { message: 'matchId and sessionToken are required' });
      return;
    }

    if (!this.challengeOrchestrator) {
      socket.emit('error', { message: 'Challenge system not initialized' });
      return;
    }

    // Query match info and verify token
    const matchInfo = this.challengeOrchestrator.getMatch(matchId);
    if (!matchInfo || matchInfo.sessionToken !== sessionToken) {
      socket.emit('error', { message: 'Invalid match or session token' });
      return;
    }

    // Join match room
    const roomId = matchInfo.sessionId;
    void socket.join(roomId);
    const sessions = this.socketSessions.get(socket.id);
    sessions?.add(roomId);

    // Store agent socket mapping
    this.agentSockets.set(socket.id, matchId);

    // Notify orchestrator of connection
    const connected = this.challengeOrchestrator.onAgentConnected(matchId, socket.id);
    if (connected) {
      socket.emit(WS_EVENTS.AUTH_CHALLENGE_OK, { matchId, sessionId: roomId });
      logger.info(`Challenge agent authenticated: ${socket.id} → ${matchId}`);
    } else {
      socket.emit('error', { message: 'Agent connection failed — match not in waiting state' });
    }
  }

  /**
   * 챌린지 매치 에이전트 행동 처리
   * 방향 입력을 검증하여 orchestrator에 전달
   */
  private handleChallengeAgentAction(socket: Socket, data: unknown): void {
    if (data === null || data === undefined || typeof data !== 'object') return;

    const dataObj = data as Record<string, unknown>;
    const direction = dataObj['direction'];

    if (typeof direction !== 'string' || !VALID_DIRECTIONS.has(direction)) return;

    const matchId = this.agentSockets.get(socket.id);
    if (!matchId) return;

    this.challengeOrchestrator?.handleAgentAction(matchId, direction as Direction);
  }

  /**
   * API 상태 저장소 설정
   * 로비 참가 시 현재 매치/토너먼트 목록을 전송하기 위해 필요
   * @param stateStore API 상태 저장소 인스턴스
   */
  setStateStore(stateStore: ApiStateStore): void {
    this.stateStore = stateStore;
    logger.info('StateStore connected');
  }

  /**
   * 정리 (서버 종료 시)
   * 소켓 세션 추적 데이터를 제거하고 게임 루프를 종료한다.
   */
  shutdown(): void {
    this.socketSessions.clear();
    this.agentSockets.clear();
    this.gameLoopManager.shutdown();
    logger.info('SocketManager shutdown');
  }
}
