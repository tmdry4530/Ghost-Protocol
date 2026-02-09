/**
 * 게임 전용 WebSocket 훅
 * 서버에서 game_state를 수신하고 player_input을 전송
 */
import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import { useGameStore } from '../stores/gameStore';
import { WS_EVENTS } from '@ghost-protocol/shared';
import type {
  GameState,
  GameStateFrame,
  Direction,
  RoundStartEvent,
  RoundEndEvent,
} from '@ghost-protocol/shared';

/** 게임 소켓 훅 옵션 */
interface UseGameSocketOptions {
  /** 매치 ID (아레나 모드) */
  matchId?: string;
  /** 세션 ID (서바이벌 모드) */
  sessionId?: string;
}

/** 게임 소켓 훅 반환값 */
interface UseGameSocketReturn {
  /** WebSocket 연결 상태 */
  connected: boolean;
  /** 플레이어 입력 전송 */
  sendInput: (direction: Direction) => void;
  /** 방 참가 */
  joinRoom: (roomType: string, roomId: string) => void;
  /** 방 퇴장 */
  leaveRoom: (roomType: string, roomId: string) => void;
}

/**
 * GameStateFrame을 GameState로 변환
 * 서버가 full GameState를 보낼 수도 있으므로 타입 가드 사용
 */
function frameToGameState(frame: GameStateFrame): GameState {
  // GameStateFrame이 이미 전체 GameState인지 확인
  if ('round' in frame && 'score' in frame && 'maze' in frame) {
    return frame as unknown as GameState;
  }

  // GameStateFrame만 있는 경우 기본값으로 GameState 구성
  return {
    tick: frame.tick,
    round: 1,
    score: frame.pacman.score,
    lives: frame.pacman.lives,
    pacman: frame.pacman,
    ghosts: frame.ghosts,
    maze: {
      width: 28,
      height: 31,
      walls: [],
      pellets: frame.pellets,
      powerPellets: [],
    },
    powerActive: frame.powerActive,
    powerTimeRemaining: frame.powerTimeRemaining,
    fruitAvailable: null,
    dying: false,
  };
}

export function useGameSocket(options: UseGameSocketOptions = {}): UseGameSocketReturn {
  const { connected, socket } = useSocket();
  const { setGameState } = useGameStore();
  const tickRef = useRef(0);

  // 게임 상태 수신
  useEffect(() => {
    if (!socket) return;

    const onGameState = (frame: GameStateFrame) => {
      tickRef.current = frame.tick;
      const gameState = frameToGameState(frame);
      setGameState(gameState);
    };

    const onRoundStart = (event: RoundStartEvent) => {
      // 라운드 시작 이벤트 처리 (로깅, UI 업데이트 등)
      console.warn('[Ghost Protocol] 라운드 시작:', event.round);
    };

    const onRoundEnd = (event: RoundEndEvent) => {
      console.warn('[Ghost Protocol] 라운드 종료:', event.round, '점수:', event.score);
    };

    socket.on(WS_EVENTS.GAME_STATE, onGameState);
    socket.on(WS_EVENTS.ROUND_START, onRoundStart);
    socket.on(WS_EVENTS.ROUND_END, onRoundEnd);

    return () => {
      socket.off(WS_EVENTS.GAME_STATE, onGameState);
      socket.off(WS_EVENTS.ROUND_START, onRoundStart);
      socket.off(WS_EVENTS.ROUND_END, onRoundEnd);
    };
  }, [socket, setGameState]);

  // 방 자동 참가
  useEffect(() => {
    if (!socket || !connected) return;

    if (options.matchId) {
      socket.emit(WS_EVENTS.JOIN_MATCH, { roomId: options.matchId });
    }
    if (options.sessionId) {
      socket.emit(WS_EVENTS.JOIN_SURVIVAL, { roomId: options.sessionId });
    }

    return () => {
      if (options.matchId) {
        socket.emit('leave_room', { roomId: `match:${options.matchId}` });
      }
      if (options.sessionId) {
        socket.emit('leave_room', { roomId: `survival:${options.sessionId}` });
      }
    };
  }, [socket, connected, options.matchId, options.sessionId]);

  // 플레이어 입력 전송
  const sendInput = useCallback(
    (direction: Direction) => {
      if (!socket || !connected) return;

      socket.emit(WS_EVENTS.PLAYER_INPUT, {
        sessionId: options.sessionId ?? '',
        direction,
        tick: tickRef.current,
      });
    },
    [socket, connected, options.sessionId],
  );

  // 방 참가/퇴장
  const joinRoom = useCallback(
    (roomType: string, roomId: string) => {
      if (!socket || !connected) return;
      const eventName = `join_${roomType}`;
      socket.emit(eventName, { roomId });
    },
    [socket, connected],
  );

  const leaveRoom = useCallback(
    (roomType: string, roomId: string) => {
      if (!socket || !connected) return;
      socket.emit('leave_room', { roomId: `${roomType}:${roomId}` });
    },
    [socket, connected],
  );

  return { connected, sendInput, joinRoom, leaveRoom };
}
