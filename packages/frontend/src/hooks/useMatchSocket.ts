/**
 * 매치 관전용 WebSocket 훅
 * 특정 매치 룸에 참가하여 게임 상태와 배팅 이벤트 수신
 */
import { useEffect } from 'react';
import type {
  MatchId,
  GameState,
  BetUpdateEvent,
  BetLockedEvent,
  BetSettledEvent,
  MatchResultEvent,
} from '@ghost-protocol/shared';
import { useSocket } from './useSocket.js';
import { useGameStore } from '../stores/gameStore.js';
import { useBettingStore } from '../stores/bettingStore.js';

/**
 * MON 금액을 포맷팅 (wei → MON)
 */
function formatMon(wei: bigint): string {
  const mon = Number(wei) / 1e18;
  return mon.toFixed(4);
}

/**
 * 매치 관전 훅
 * 매치 룸에 참가하고 게임 상태 및 배팅 이벤트 리스닝
 */
export function useMatchSocket(matchId: MatchId | null) {
  const { socket, connected } = useSocket();
  const setGameState = useGameStore((s) => s.setGameState);
  const { setPool, setLocked, setSettlement, addClaimable, setNotification, reset } =
    useBettingStore();

  useEffect(() => {
    if (!socket || !connected || !matchId) return;

    // 매치 룸 참가
    socket.emit('join_match', { matchId });

    // 게임 상태 프레임 수신 (60fps)
    const onGameState = (state: GameState) => {
      setGameState(state);
    };

    // 배팅 업데이트 이벤트
    const onBetUpdate = (event: BetUpdateEvent) => {
      setPool({
        matchId,
        totalPool: event.poolTotal,
        sideA: event.sideA,
        sideB: event.sideB,
        oddsA: event.oddsA,
        oddsB: event.oddsB,
        betCount: event.betCount,
        locked: false,
      });
    };

    // 배팅 잠금 이벤트
    const onBetLocked = (event: BetLockedEvent) => {
      if (event.matchId === matchId) {
        setLocked(true);
        setNotification({
          type: 'locked',
          message: 'Betting is closed. Match starting soon!',
        });
      }
    };

    // 배팅 정산 이벤트
    const onBetSettled = (event: BetSettledEvent) => {
      if (event.matchId === matchId) {
        const myBet = useBettingStore.getState().myBet;
        const isWin = myBet ? myBet.side === event.winner : false;

        // 정산 결과 설정
        setSettlement({
          matchId: event.matchId,
          winner: event.winner,
          myPayout: event.yourPayout ?? null,
          isWin,
        });

        // 배당금이 있으면 청구 가능 목록에 추가
        if (event.yourPayout) {
          addClaimable(event.matchId, event.yourPayout);
        }

        // 알림 표시
        setNotification({
          type: 'settled',
          message: isWin
            ? `Congratulations! You won ${formatMon(event.yourPayout ?? 0n)} MON!`
            : 'Better luck next time.',
        });
      }
    };

    // 매치 결과 이벤트 (향후 매치 결과 UI 반영 시 확장)
    const onMatchResult = (_event: MatchResultEvent) => {
      // noop — 매치 결과는 bet_settled 이벤트에서 처리
    };

    // 이벤트 리스너 등록
    socket.on('game_state', onGameState);
    socket.on('bet_update', onBetUpdate);
    socket.on('bet_locked', onBetLocked);
    socket.on('bet_settled', onBetSettled);
    socket.on('match_result', onMatchResult);

    // 언마운트 시 정리
    return () => {
      socket.emit('leave_match', { matchId });
      socket.off('game_state', onGameState);
      socket.off('bet_update', onBetUpdate);
      socket.off('bet_locked', onBetLocked);
      socket.off('bet_settled', onBetSettled);
      socket.off('match_result', onMatchResult);
      reset();
    };
  }, [socket, connected, matchId, setGameState, setPool, setLocked, reset]);
}
