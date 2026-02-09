/** Tournament page */

import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { BracketView } from '@/components/tournament/BracketView';
import { PrizePool } from '@/components/tournament/PrizePool';
import type { BracketRound, BracketMatch, MatchStatus } from '@/types/tournament';

/** API Base URL */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

/** 백엔드 API 응답 타입 */
interface TournamentResponse {
  tournament: {
    id: string;
    participants: string[];
    bracketSize: 8 | 16;
    status: 'upcoming' | 'active' | 'completed';
    currentRound: number;
    matches: MatchData[];
    champion: string | null;
    prizePool: string;
    createdAt: number;
  };
}

interface MatchData {
  id: string;
  tournamentId: string;
  round: number;
  agentA: string;
  agentB: string;
  scoreA: number;
  scoreB: number;
  winner: string | null;
  status: MatchStatus;
  createdAt: number;
}

interface AgentData {
  address: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
}

interface TournamentsListResponse {
  tournaments: Array<{
    id: string;
    status: 'upcoming' | 'active' | 'completed';
    createdAt: number;
  }>;
}

interface AgentsResponse {
  agents: AgentData[];
}

/**
 * Tournament detail page
 * - Bracket visualization
 * - Participant list
 * - Prize pool info
 */
export function Tournament() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentResponse['tournament'] | null>(null);
  const [agentsMap, setAgentsMap] = useState<Map<string, AgentData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let refreshTimer: ReturnType<typeof setInterval>;

    const fetchData = async () => {
      try {
        // 에이전트 정보 가져오기
        const agentsRes = await fetch(`${API_URL}/agents`);
        if (!agentsRes.ok) throw new Error('Failed to fetch agent list');
        const agentsData = (await agentsRes.json()) as AgentsResponse;
        const newAgentsMap = new Map(agentsData.agents.map((a) => [a.address, a]));

        // 토너먼트 ID 결정 (current 또는 undefined → 최신 활성/완료 토너먼트)
        let tournamentId = id;
        if (!id || id === 'current') {
          const listRes = await fetch(`${API_URL}/tournaments`);
          if (!listRes.ok) throw new Error('Failed to fetch tournament list');
          const listData = (await listRes.json()) as TournamentsListResponse;

          // 활성 토너먼트 우선, 없으면 가장 최근 토너먼트
          const active = listData.tournaments.find((t) => t.status === 'active');
          const latest = [...listData.tournaments].sort((a, b) => b.createdAt - a.createdAt)[0];
          tournamentId = active?.id ?? latest?.id;

          if (!tournamentId) {
            if (mounted) {
              setError('No active tournaments');
              setLoading(false);
            }
            return;
          }
        }

        // 토너먼트 상세 정보 가져오기
        const tournamentRes = await fetch(`${API_URL}/tournaments/${tournamentId}`);
        if (!tournamentRes.ok) {
          if (mounted) {
            if (tournamentRes.status === 404) {
              setError('Tournament not found');
            } else {
              throw new Error('Failed to fetch tournament');
            }
            setLoading(false);
          }
          return;
        }

        const tournamentData = (await tournamentRes.json()) as TournamentResponse;

        if (mounted) {
          setAgentsMap(newAgentsMap);
          setTournament(tournamentData.tournament);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'API connection failed');
          setLoading(false);
        }
      }
    };

    void fetchData();

    // 10초마다 자동 갱신
    refreshTimer = setInterval(() => {
      void fetchData();
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(refreshTimer);
    };
  }, [id]);

  // 매치를 라운드별로 그룹화하여 BracketRound 생성
  const buildBracketRounds = (): BracketRound[] => {
    if (!tournament) return [];

    const matchesByRound = new Map<number, MatchData[]>();
    for (const match of tournament.matches) {
      const existing = matchesByRound.get(match.round) ?? [];
      existing.push(match);
      matchesByRound.set(match.round, existing);
    }

    const rounds: BracketRound[] = [];
    const sortedRounds = [...matchesByRound.keys()].sort((a, b) => a - b);

    for (const round of sortedRounds) {
      const matches = matchesByRound.get(round) ?? [];
      const bracketMatches: BracketMatch[] = matches.map((m) => {
        const agentAData = agentsMap.get(m.agentA);
        const agentBData = agentsMap.get(m.agentB);

        return {
          id: m.id as BracketMatch['id'],
          agentA: {
            name: agentAData?.name ?? 'TBD',
            address: m.agentA,
            score: m.status === 'completed' ? m.scoreA : null,
          },
          agentB: {
            name: agentBData?.name ?? 'TBD',
            address: m.agentB,
            score: m.status === 'completed' ? m.scoreB : null,
          },
          winner: m.winner,
          status: m.status,
        };
      });

      // 라운드 이름 생성
      const bracketSize = tournament.bracketSize;
      let roundName = `Round ${String(round)}`;
      if (bracketSize === 8) {
        if (round === 1) roundName = 'Quarterfinals';
        else if (round === 2) roundName = 'Semifinals';
        else if (round === 3) roundName = 'Finals';
      } else if (bracketSize === 16) {
        if (round === 1) roundName = 'Round of 16';
        else if (round === 2) roundName = 'Quarterfinals';
        else if (round === 3) roundName = 'Semifinals';
        else if (round === 4) roundName = 'Finals';
      }

      rounds.push({ name: roundName, matches: bracketMatches });
    }

    return rounds;
  };

  const bracketRounds = buildBracketRounds();
  const prizePoolMon = tournament ? parseFloat(tournament.prizePool) || 0 : 0;

  // 로딩 상태
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-20 pt-24">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-ghost-violet/20 border-t-ghost-violet"></div>
            <p className="text-sm text-gray-400">Loading tournament data...</p>
          </div>
        </div>
      </div>
    );
  }

  // 에러 또는 데이터 없음
  if (error || !tournament) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-20 pt-24">
        <div>
          <Link
            to="/"
            className="mb-2 inline-flex items-center gap-2 text-xs tracking-wider text-ghost-violet hover:text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            &larr; Back to Dashboard
          </Link>
        </div>
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-ghost-violet/10 bg-arena-surface/40 p-12 text-center backdrop-blur-sm">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className="mb-6 text-ghost-violet/30">
            <path d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z" fill="currentColor" />
          </svg>
          <p className="text-lg font-semibold text-gray-400" style={{ fontFamily: 'var(--font-display)' }}>
            {error ?? 'No Tournament Data'}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Tournament data will appear here when a tournament is active.
          </p>
          <Link
            to="/"
            className="mt-6 rounded-lg border border-ghost-violet/40 bg-ghost-violet/10 px-6 py-2.5 text-sm tracking-wider text-ghost-violet transition-all hover:bg-ghost-violet/20"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // 상태 뱃지 색상
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-ghost-neon/20 text-ghost-neon border-ghost-neon/40';
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/40';
      case 'upcoming':
      default:
        return 'bg-ghost-violet/20 text-ghost-violet border-ghost-violet/40';
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-20 pt-24">
      {/* Header */}
      <div>
        <Link
          to="/"
          className="mb-2 inline-flex items-center gap-2 text-xs tracking-wider text-ghost-violet hover:text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          &larr; Back to Dashboard
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1
              className="neon-text-purple text-2xl tracking-widest text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tournament #{tournament.id}
            </h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wider ${getStatusBadge(tournament.status)}`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {tournament.status.toUpperCase()}
            </span>
          </div>
          {tournament.champion && (
            <div className="flex items-center gap-2 rounded-lg border border-ghost-neon/30 bg-ghost-neon/10 px-4 py-2">
              <span className="text-xl">&#x1F451;</span>
              <div>
                <p className="text-xs text-gray-400">Champion</p>
                <p className="font-bold text-ghost-neon" style={{ fontFamily: 'var(--font-display)' }}>
                  {agentsMap.get(tournament.champion)?.name ?? tournament.champion}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 토너먼트 정보 그리드 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Prize Pool */}
        <div className="lg:col-span-1">
          <PrizePool totalPoolMon={prizePoolMon} bracketSize={tournament.bracketSize} />
        </div>

        {/* 토너먼트 정보 카드 */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-ghost-violet/30 bg-arena-card p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Tournament Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">Bracket Size</p>
                <p className="text-lg font-bold text-ghost-violet">{tournament.bracketSize}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Participants</p>
                <p className="text-lg font-bold text-ghost-violet">{tournament.participants.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Current Round</p>
                <p className="text-lg font-bold text-ghost-violet">Round {tournament.currentRound}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total Matches</p>
                <p className="text-lg font-bold text-ghost-violet">{tournament.matches.length} matches</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400">Created</p>
                <p className="text-sm text-gray-300">
                  {new Date(tournament.createdAt).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bracket Visualization */}
      <div className="overflow-visible rounded-lg border border-ghost-violet/30 bg-arena-card p-6">
        <h2
          className="mb-6 text-xl font-bold text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Tournament Bracket
        </h2>
        {bracketRounds.length > 0 ? (
          <BracketView bracketSize={tournament.bracketSize} rounds={bracketRounds} />
        ) : (
          <div className="py-12 text-center text-gray-400">
            No match data available yet.
          </div>
        )}
      </div>

      {/* Auto-refresh indicator */}
      <div className="text-center text-xs text-gray-500">
        Auto-refreshes every 10 seconds
      </div>
    </div>
  );
}
