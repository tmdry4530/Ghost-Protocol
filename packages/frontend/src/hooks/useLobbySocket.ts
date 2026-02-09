/**
 * 로비 WebSocket 연결 훅
 * 대시보드 실시간 업데이트를 위한 이벤트 리스너
 */
import { useEffect } from 'react';
import { useSocket } from './useSocket';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { MatchInfo, TournamentInfo, SurvivalSessionInfo, FeedItem } from '@/types/dashboard';

/**
 * 로비 소켓 이벤트 리스너 훅
 * 토너먼트, 매치, 서바이벌 세션, 피드 업데이트 수신
 */
export function useLobbySocket(): void {
  const { socket, connected } = useSocket();
  const { updateMatch, updateTournament, updateSurvivalSession, addFeedItem } = useDashboardStore();

  useEffect(() => {
    if (!socket || !connected) return;

    /**
     * 매치 업데이트 이벤트
     * 매치 상태, 점수 변경 시 수신
     */
    const handleMatchUpdate = (match: MatchInfo) => {
      updateMatch(match);
    };

    /**
     * 토너먼트 업데이트 이벤트
     * 토너먼트 상태, 참가자 변경 시 수신
     */
    const handleTournamentUpdate = (tournament: TournamentInfo) => {
      updateTournament(tournament);
    };

    /**
     * 서바이벌 세션 업데이트 이벤트
     * 세션 상태, 점수 변경 시 수신
     */
    const handleSurvivalUpdate = (session: SurvivalSessionInfo) => {
      updateSurvivalSession(session);
    };

    /**
     * 피드 아이템 이벤트
     * 새로운 이벤트 발생 시 수신
     */
    const handleFeedItem = (item: FeedItem) => {
      addFeedItem(item);
    };

    // 이벤트 리스너 등록
    socket.on('match_update', handleMatchUpdate);
    socket.on('tournament_update', handleTournamentUpdate);
    socket.on('survival_update', handleSurvivalUpdate);
    socket.on('feed_item', handleFeedItem);

    // 로비 룸 참가
    socket.emit('join_lobby');

    /**
     * REST API에서 초기 데이터 로드
     * WebSocket 연결 전에 생성된 매치/토너먼트를 가져오기
     */
    const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

    void (async () => {
      try {
        // 기존 매치 목록 가져오기
        const matchesRes = await fetch(`${API_URL}/matches`);
        if (matchesRes.ok) {
          const matchesData = await matchesRes.json() as { matches: MatchInfo[] };
          matchesData.matches.forEach((match) => {
            updateMatch(match);
          });
        }

        // 기존 토너먼트 목록 가져오기
        const tournamentsRes = await fetch(`${API_URL}/tournaments`);
        if (tournamentsRes.ok) {
          const tournamentsData = await tournamentsRes.json() as { tournaments: TournamentInfo[] };
          tournamentsData.tournaments.forEach((tournament) => {
            updateTournament(tournament);
          });
        }
      } catch (error) {
        // API를 사용할 수 없는 경우 조용히 무시
        // WebSocket 이벤트만으로도 작동 가능
        console.warn('초기 데이터 로드 실패:', error);
      }
    })();

    // 클린업: 이벤트 리스너 제거
    return () => {
      socket.off('match_update', handleMatchUpdate);
      socket.off('tournament_update', handleTournamentUpdate);
      socket.off('survival_update', handleSurvivalUpdate);
      socket.off('feed_item', handleFeedItem);
      socket.emit('leave_lobby', { roomId: 'lobby' });
    };
  }, [socket, connected, updateMatch, updateTournament, updateSurvivalSession, addFeedItem]);
}
