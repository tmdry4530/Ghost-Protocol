/**
 * 대시보드 Zustand Store
 * 토너먼트, 매치, 서바이벌 세션, 랭킹, 피드 상태 관리
 */
import { create } from 'zustand';
import type {
  MatchInfo,
  TournamentInfo,
  SurvivalSessionInfo,
  FeedItem,
  AgentRanking,
} from '@/types/dashboard';

/** 토너먼트 필터 타입 */
export type TournamentFilter = 'all' | 'active' | 'upcoming' | 'completed';

/** 대시보드 상태 인터페이스 */
interface DashboardState {
  /** 매치 목록 */
  matches: MatchInfo[];
  /** 토너먼트 목록 */
  tournaments: TournamentInfo[];
  /** 서바이벌 세션 목록 */
  survivalSessions: SurvivalSessionInfo[];
  /** 에이전트 랭킹 */
  agentRankings: AgentRanking[];
  /** 피드 아이템 */
  feedItems: FeedItem[];
  /** 토너먼트 필터 */
  tournamentFilter: TournamentFilter;

  /** 매치 업데이트 */
  updateMatch: (match: MatchInfo) => void;
  /** 토너먼트 업데이트 */
  updateTournament: (tournament: TournamentInfo) => void;
  /** 서바이벌 세션 업데이트 */
  updateSurvivalSession: (session: SurvivalSessionInfo) => void;
  /** 피드 아이템 추가 */
  addFeedItem: (item: FeedItem) => void;
  /** 토너먼트 필터 설정 */
  setTournamentFilter: (filter: TournamentFilter) => void;
  /** 필터링된 토너먼트 가져오기 */
  getFilteredTournaments: () => TournamentInfo[];
}

/**
 * 대시보드 Store 생성
 */
export const useDashboardStore = create<DashboardState>((set, get) => ({
  matches: [],
  tournaments: [],
  survivalSessions: [],
  agentRankings: [],
  feedItems: [],
  tournamentFilter: 'all',

  updateMatch: (match) =>
    { set((state) => ({
      matches: state.matches.some((m) => m.id === match.id)
        ? state.matches.map((m) => (m.id === match.id ? match : m))
        : [...state.matches, match],
    })); },

  updateTournament: (tournament) =>
    { set((state) => ({
      tournaments: state.tournaments.some((t) => t.id === tournament.id)
        ? state.tournaments.map((t) => (t.id === tournament.id ? tournament : t))
        : [...state.tournaments, tournament],
    })); },

  updateSurvivalSession: (session) =>
    { set((state) => ({
      survivalSessions: state.survivalSessions.some((s) => s.id === session.id)
        ? state.survivalSessions.map((s) => (s.id === session.id ? session : s))
        : [...state.survivalSessions, session],
    })); },

  addFeedItem: (item) =>
    { set((state) => {
      // 중복 방지 - 동일한 ID가 이미 있으면 추가하지 않음
      if (state.feedItems.some((f) => f.id === item.id)) return state;
      return {
        feedItems: [item, ...state.feedItems].slice(0, 50), // 최대 50개 유지
      };
    }); },

  setTournamentFilter: (filter) => { set({ tournamentFilter: filter }); },

  getFilteredTournaments: () => {
    const { tournaments, tournamentFilter } = get();
    if (tournamentFilter === 'all') return tournaments;
    return tournaments.filter((t) => t.status === tournamentFilter);
  },
}));
