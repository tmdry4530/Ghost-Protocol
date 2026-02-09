/**
 * Ghost Protocol 서버 사이드 게임 루프 매니저
 * 매치/서바이벌 세션별 60fps 게임 루프 인스턴스를 관리한다.
 *
 * 책임:
 * - 게임 세션 생성/시작/중지/삭제
 * - setInterval 기반 고정 시간 간격 틱 실행
 * - 플레이어/에이전트 입력 주입
 * - 콜백을 통한 게임 상태 프레임 전달
 * - 리플레이 녹화 연동
 */
import type {
  Direction,
  GameState,
  GameStateFrame,
  MazeVariant,
  DifficultyTier,
} from '@ghost-protocol/shared';
import { TICK_RATE } from '@ghost-protocol/shared';
import { GameStateManager } from '../engine/GameStateManager.js';
import type { GameStateManagerConfig } from '../engine/GameStateManager.js';
import { RenderBridge } from '../engine/RenderBridge.js';
import { ReplayRecorder } from '../engine/ReplayRecorder.js';
import pino from 'pino';

/** 구조화된 로거 */
const logger = pino({ name: 'game-loop-manager' });

/** 게임 세션 타입 */
type SessionType = 'match' | 'survival';

/** 게임 세션 설정 */
interface GameSessionConfig {
  readonly sessionId: string;
  readonly sessionType: SessionType;
  readonly variant: MazeVariant;
  readonly seed: number;
  readonly difficulty: DifficultyTier;
  readonly agents: readonly string[];
}

/** 게임 세션 내부 상태 */
interface GameSession {
  readonly config: GameSessionConfig;
  readonly engine: GameStateManager;
  readonly renderBridge: RenderBridge;
  readonly replayRecorder: ReplayRecorder;
  intervalId: ReturnType<typeof setInterval> | null;
  playerInputs: Map<string, Direction>;
  tickCount: number;
  running: boolean;
}

/** 게임 상태 프레임 콜백 타입 */
type GameStateCallback = (sessionId: string, frame: GameStateFrame) => void;

/** 게임 오버 콜백 타입 */
type GameOverCallback = (sessionId: string, state: GameState) => void;

/** 라운드 변경 콜백 타입 */
type RoundChangeCallback = (sessionId: string, round: number) => void;

/**
 * 서버 사이드 게임 루프 매니저
 * 여러 게임 세션을 동시에 관리하며 각 세션마다 독립적인 60fps 루프를 실행한다.
 */
export class GameLoopManager {
  /** 활성 게임 세션 맵 (sessionId → GameSession) */
  private sessions: Map<string, GameSession> = new Map();

  /** 게임 상태 프레임 콜백 */
  private onGameState: GameStateCallback | null = null;

  /** 게임 오버 콜백 */
  private onGameOver: GameOverCallback | null = null;

  /** 라운드 변경 콜백 */
  private onRoundChange: RoundChangeCallback | null = null;

  /**
   * 게임 상태 프레임 콜백 설정
   * @param callback 매 틱마다 호출될 함수
   */
  setOnGameState(callback: GameStateCallback): void {
    this.onGameState = callback;
  }

  /**
   * 게임 오버 콜백 설정
   * @param callback 게임 종료 시 호출될 함수
   */
  setOnGameOver(callback: GameOverCallback): void {
    this.onGameOver = callback;
  }

  /**
   * 라운드 변경 콜백 설정
   * @param callback 라운드 변경 시 호출될 함수
   */
  setOnRoundChange(callback: RoundChangeCallback): void {
    this.onRoundChange = callback;
  }

  /** 현재 등록된 게임 오버 콜백 반환 */
  getOnGameOver(): GameOverCallback | null {
    return this.onGameOver;
  }

  /** 현재 등록된 게임 상태 콜백 반환 */
  getOnGameState(): GameStateCallback | null {
    return this.onGameState;
  }

  /**
   * 새 게임 세션 생성
   * @param config 세션 설정 (ID, 타입, 미로, 시드, 난이도, 에이전트 목록)
   * @throws 이미 존재하는 세션 ID인 경우
   */
  createSession(config: GameSessionConfig): void {
    if (this.sessions.has(config.sessionId)) {
      throw new Error(`세션이 이미 존재합니다: ${config.sessionId}`);
    }

    const engineConfig: GameStateManagerConfig = {
      variant: config.variant,
      seed: config.seed,
      difficulty: config.difficulty,
    };

    const engine = new GameStateManager(engineConfig);
    const renderBridge = new RenderBridge();
    const replayRecorder = new ReplayRecorder();

    const session: GameSession = {
      config,
      engine,
      renderBridge,
      replayRecorder,
      intervalId: null,
      playerInputs: new Map(),
      tickCount: 0,
      running: false,
    };

    this.sessions.set(config.sessionId, session);
    logger.info(`게임 세션 생성: ${config.sessionId} (${config.sessionType})`);
  }

  /**
   * 게임 루프 시작
   * setInterval 기반으로 TICK_RATE(60fps) 간격의 게임 루프를 실행한다.
   * @param sessionId 시작할 세션 ID
   * @throws 세션이 존재하지 않는 경우
   */
  startSession(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session.running) return;

    session.running = true;
    session.replayRecorder.startRecording(
      sessionId,
      [...session.config.agents],
      session.config.variant,
      session.config.seed,
    );

    const intervalMs = 1000 / TICK_RATE;
    let previousRound = 1;

    session.intervalId = setInterval(() => {
      if (!session.running) return;

      // 첫 번째 에이전트/플레이어의 입력 가져오기
      const firstAgent = session.config.agents[0];
      const input = firstAgent !== undefined
        ? session.playerInputs.get(firstAgent)
        : undefined;

      // 엔진 틱 실행
      const state = session.engine.tick(input ?? undefined);
      session.tickCount++;

      // 소비된 입력 클리어
      if (firstAgent !== undefined) {
        session.playerInputs.delete(firstAgent);
      }

      // 리플레이 틱 기록
      const inputs = input !== undefined && firstAgent !== undefined
        ? [{ agentIndex: 0, direction: input }]
        : [];
      session.replayRecorder.recordTick(
        session.tickCount,
        inputs,
        session.engine.getStateHash(),
      );

      // 라운드 변경 감지
      if (state.round !== previousRound) {
        previousRound = state.round;
        this.onRoundChange?.(sessionId, state.round);
      }

      // 게임 상태를 프레임으로 변환하여 콜백 호출
      const frame = session.renderBridge.toFrame(state);
      this.onGameState?.(sessionId, frame);

      // 게임 오버 확인
      if (session.engine.isGameOver()) {
        this.stopSession(sessionId);
        this.onGameOver?.(sessionId, state);
      }
    }, intervalMs);

    logger.info(`게임 루프 시작: ${sessionId}`);
  }

  /**
   * 게임 루프 중지
   * @param sessionId 중지할 세션 ID
   */
  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.running = false;
    if (session.intervalId !== null) {
      clearInterval(session.intervalId);
      session.intervalId = null;
    }

    if (session.replayRecorder.isRecording()) {
      const state = session.engine.getState();
      session.replayRecorder.stopRecording([state.score]);
    }

    logger.info(`게임 루프 중지: ${sessionId}`);
  }

  /**
   * 세션 완전 삭제 (루프 중지 포함)
   * @param sessionId 삭제할 세션 ID
   */
  removeSession(sessionId: string): void {
    this.stopSession(sessionId);
    this.sessions.delete(sessionId);
    logger.info(`게임 세션 삭제: ${sessionId}`);
  }

  /**
   * 플레이어/에이전트 입력 주입
   * 다음 틱에서 해당 입력이 적용된다.
   * @param sessionId 대상 세션 ID
   * @param agentOrPlayer 에이전트 주소 또는 'player'
   * @param direction 이동 방향
   */
  handleInput(sessionId: string, agentOrPlayer: string, direction: Direction): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.running) return;
    session.playerInputs.set(agentOrPlayer, direction);
  }

  /**
   * 현재 게임 상태 조회
   * @param sessionId 조회할 세션 ID
   * @returns 게임 상태 또는 세션이 없으면 null
   */
  getSessionState(sessionId: string): GameState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.getState();
  }

  /**
   * 전체 동기화 데이터 반환 (새 클라이언트 접속 시)
   * @param sessionId 대상 세션 ID
   * @returns 전체 GameState 또는 null
   */
  getFullSync(sessionId: string): GameState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.renderBridge.toFullSync(session.engine.getState());
  }

  /**
   * 리플레이 압축 데이터 반환
   * @param sessionId 대상 세션 ID
   * @returns gzip 압축된 리플레이 Buffer 또는 null
   */
  getReplayData(sessionId: string): Buffer | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    try {
      return session.replayRecorder.getCompressedData();
    } catch {
      return null;
    }
  }

  /**
   * 현재 실행 중인 세션 ID 목록 반환
   * @returns 활성 세션 ID 배열
   */
  getActiveSessions(): string[] {
    return [...this.sessions.entries()]
      .filter(([, s]) => s.running)
      .map(([id]) => id);
  }

  /**
   * 모든 세션 정리 (서버 종료 시)
   */
  shutdown(): void {
    for (const [sessionId] of this.sessions) {
      this.removeSession(sessionId);
    }
    logger.info('모든 게임 세션 종료');
  }

  /**
   * 세션 ID로 세션 조회 (내부용)
   * @param sessionId 조회할 세션 ID
   * @returns 게임 세션 객체
   * @throws 세션을 찾을 수 없는 경우
   */
  private getSession(sessionId: string): GameSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    }
    return session;
  }
}
