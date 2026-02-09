import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { MatchId, MatchInfo, AgentAddress, TournamentId, Direction } from '@ghost-protocol/shared';
import { PhaserGame, getActiveGame } from '../game/PhaserGame.js';
import { GameScene } from '../game/scenes/GameScene.js';
import { LocalGameEngine } from '../game/engine/LocalGameEngine.js';
import { MatchStatsOverlay } from '../components/game/MatchStatsOverlay.js';
import { BettingPanel } from '../components/game/BettingPanel.js';
import { useMatchSocket } from '../hooks/useMatchSocket.js';
import { useBettingStore } from '../stores/bettingStore.js';

/**
 * Game spectating page
 * Arena match live spectating + betting interface
 */
export function GameViewer() {
  const { id } = useParams<{ id: string }>();
  const matchId = id as MatchId;

  // 매치 데이터 (API에서 가져올 예정)
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({
    id: matchId,
    tournamentId: '' as TournamentId,
    agentA: '' as AgentAddress,
    agentB: '' as AgentAddress,
    scoreA: 0,
    scoreB: 0,
    winner: null,
    gameLogHash: '',
    replayURI: '',
    status: 'active',
  });

  const [agentAInfo, setAgentAInfo] = useState({
    address: matchInfo.agentA,
    name: 'Agent A',
    score: matchInfo.scoreA,
  });

  const [agentBInfo, setAgentBInfo] = useState({
    address: matchInfo.agentB,
    name: 'Agent B',
    score: matchInfo.scoreB,
  });

  // 배팅 스토어
  const { setPool } = useBettingStore();

  // WebSocket connection and event listening
  useMatchSocket(matchId);

  // API에서 매치 데이터 가져오기
  useEffect(() => {
    const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api/v1';
    let mounted = true;

    const fetchMatchData = async () => {
      try {
        // 매치 데이터 가져오기
        const [matchRes, agentsRes] = await Promise.all([
          fetch(`${API_URL}/matches/${matchId}`),
          fetch(`${API_URL}/agents`),
        ]);

        if (!matchRes.ok || !agentsRes.ok || !mounted) return;

        const matchData = await matchRes.json() as { match: { agentA: string; agentB: string; status: string; scoreA: number; scoreB: number; tournamentId: string } };
        const agentsData = await agentsRes.json() as { agents: Array<{ address: string; name: string }> };

        const agentsMap = new Map(agentsData.agents.map(a => [a.address, a]));
        const match = matchData.match;

        if (!mounted) return;

        // 에이전트 이름 업데이트
        const agentAData = agentsMap.get(match.agentA);
        const agentBData = agentsMap.get(match.agentB);

        setAgentAInfo({
          address: match.agentA as AgentAddress,
          name: agentAData?.name ?? `Agent ${match.agentA.slice(-4)}`,
          score: match.scoreA,
        });

        setAgentBInfo({
          address: match.agentB as AgentAddress,
          name: agentBData?.name ?? `Agent ${match.agentB.slice(-4)}`,
          score: match.scoreB,
        });

        // 매치 상태 업데이트
        setMatchInfo(prev => ({
          ...prev,
          agentA: match.agentA as AgentAddress,
          agentB: match.agentB as AgentAddress,
          tournamentId: match.tournamentId as TournamentId,
          status: match.status as MatchInfo['status'],
        }));

      } catch (err) {
        console.warn('매치 데이터 로드 실패:', err);
      }
    };

    void fetchMatchData();

    return () => { mounted = false; };
  }, [matchId]);

  // 배팅 풀 초기화 (데모 데이터 - 매치별 고유 값 생성)
  useEffect(() => {
    // matchId 문자열에서 간단한 해시 생성 (char code 합산)
    const hashMatchId = (id: string): number => {
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash = hash & hash; // 32비트 정수로 변환
      }
      return Math.abs(hash);
    };

    const hash = hashMatchId(matchId);
    const seed = hash % 10000;

    // 총 풀 크기 생성 (1.5 ~ 5.0 MON 범위)
    const totalMon = 1.5 + (seed % 3500) / 1000; // 1.5~5.0
    const totalPool = BigInt(Math.floor(totalMon * 1e18));

    // A/B 배분 비율 생성 (40~60% 범위)
    const sideARatio = 0.4 + (seed % 2000) / 10000; // 0.4~0.6
    const sideA = BigInt(Math.floor(Number(totalPool) * sideARatio));
    const sideB = totalPool - sideA;

    // 배율 계산 (sideA/sideB 비율 기반)
    const oddsA = Number(totalPool) / Number(sideA);
    const oddsB = Number(totalPool) / Number(sideB);

    // 배팅 개수 생성 (3~15 범위)
    const betCount = 3 + (seed % 13);

    // 매치 완료 시 락 상태
    const locked = matchInfo.status === 'completed';

    const demoPool = {
      matchId,
      totalPool,
      sideA,
      sideB,
      oddsA,
      oddsB,
      betCount,
      locked,
    };
    setPool(demoPool);
  }, [matchId, matchInfo.status, setPool]);

  // Demo game loop setup (using LocalGameEngine)
  useEffect(() => {
    let gameLoop: ReturnType<typeof setInterval> | null = null;
    let engine: LocalGameEngine | null = null;
    let tickCount = 0;
    let currentDir: Direction = 'right';
    const directions: Direction[] = ['up', 'down', 'left', 'right'];

    // Wait for Phaser scene to be ready
    const initTimeout = setTimeout(() => {
      // Create demo game engine (classic maze, difficulty 1, random seed)
      engine = new LocalGameEngine('classic', 1, Date.now());

      // 60fps game loop
      gameLoop = setInterval(() => {
        if (!engine) return;

        // Change direction every 30 ticks (AI simulation)
        if (tickCount % 30 === 0) {
          currentDir = directions[Math.floor(Math.random() * 4)] ?? 'right';
        }
        tickCount++;

        // Execute game tick
        const state = engine.tick(currentDir);

        // Pass state to Phaser scene
        const game = getActiveGame();
        const scene = game?.scene.getScene('GameScene') as GameScene | null;
        if (scene) {
          scene.updateGameState(state);

          // Update score overlay
          setAgentAInfo((prev) => ({ ...prev, score: state.score }));
          // AI score simulated at ~80% of pacman score
          setAgentBInfo((prev) => ({ ...prev, score: Math.floor(state.score * 0.8) }));
        }
      }, 16); // ~60fps (16ms)
    }, 500); // Start after 500ms delay

    // Cleanup on unmount
    return () => {
      clearTimeout(initTimeout);
      if (gameLoop !== null) {
        clearInterval(gameLoop);
      }
      engine = null;
    };
  }, []);

  // 에이전트별 전략 레이블 매핑
  const getAgentStrategy = (name: string): string => {
    const strategyMap: Record<string, string> = {
      'AlphaGhost': 'Aggressive Ghost Hunting',
      'BetaHunter': 'Greedy Pellet Chasing',
      'GammaTracker': 'A* Path Optimization',
      'DeltaStalker': 'Defensive Pathfinding',
      'EpsilonWraith': 'Power Pellet Priority',
      'ZetaPhantom': 'Adaptive Pattern Analysis',
      'EtaSpectre': 'Map Zone Control',
      'ThetaShadow': 'Claude LLM Strategy',
    };
    return strategyMap[name] ?? 'AI Strategy Active';
  };

  // Status badge by match state
  const getStatusBadge = () => {
    const styles = {
      pending: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
      betting: 'border-amber-400/30 bg-amber-400/10 text-amber-400 animate-pulse',
      active: 'border-green-500/30 bg-green-500/10 text-green-400',
      completed: 'border-ghost-violet/30 bg-ghost-violet/10 text-ghost-violet',
      cancelled: 'border-red-500/30 bg-red-500/10 text-red-400',
    };

    const labels = {
      pending: 'Pending',
      betting: 'Betting',
      active: 'Live',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };

    return (
      <span
        className={`font-display text-[10px] tracking-[0.2em] rounded-full px-3 py-1 border ${
          styles[matchInfo.status]
        }`}
      >
        {labels[matchInfo.status]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Scanline and grid background effects */}
      <div className="scanline-overlay" />
      <div className="grid-bg" />

      {/* Header (fixed) */}
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-ghost-violet/10 bg-dark-bg/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="font-display text-xs tracking-wider text-ghost-violet hover:text-white transition-colors flex items-center gap-2"
            >
              <span>←</span>
              <span>Dashboard</span>
            </Link>
            <div className="h-6 w-px bg-ghost-violet/20" />
            <div>
              <h1 className="font-display text-base tracking-wider text-white mb-1">
                {agentAInfo.name} vs {agentBInfo.name}
              </h1>
              <div className="font-display text-[10px] tracking-wider text-muted-foreground">
                Match ID: {matchId}
              </div>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </header>

      {/* Main content: Game view + Betting panel */}
      <div className="flex flex-col lg:flex-row h-screen pt-16">
        {/* Game area (left ~65%) */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-8">
          <div className="relative">
            {/* Match stats overlay */}
            <MatchStatsOverlay agentA={agentAInfo} agentB={agentBInfo} />

            {/* Phaser game canvas */}
            <div
              className="border border-ghost-violet/20 rounded-xl overflow-hidden"
              style={{ boxShadow: '0 0 40px rgba(124, 58, 237, 0.15)' }}
            >
              <PhaserGame />
            </div>

            {/* Game bottom info */}
            <div className="mt-4 flex justify-between items-center font-display text-[10px] tracking-wider text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>Live Broadcast</span>
              </div>
              <div className="flex items-center gap-4">
                <span>60 FPS</span>
                <span>•</span>
                <span>Latency: ~50ms</span>
              </div>
            </div>

            {/* AI 전략 표시 */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-ghost-blue/20 bg-ghost-blue/5 px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-ghost-blue" />
                  <span className="font-display text-[10px] tracking-wider text-ghost-blue">{agentAInfo.name}</span>
                  <span className="ml-auto font-display text-xs font-bold text-white">{agentAInfo.score}</span>
                </div>
                <div className="text-[9px] text-gray-500">Strategy: {getAgentStrategy(agentAInfo.name)}</div>
              </div>
              <div className="rounded-lg border border-ghost-pink/20 bg-ghost-pink/5 px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-ghost-pink" />
                  <span className="font-display text-[10px] tracking-wider text-ghost-pink">{agentBInfo.name}</span>
                  <span className="ml-auto font-display text-xs font-bold text-white">{agentBInfo.score}</span>
                </div>
                <div className="text-[9px] text-gray-500">Strategy: {getAgentStrategy(agentBInfo.name)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Betting panel (right ~35%) */}
        <div className="lg:w-[400px] xl:w-[480px] lg:border-l lg:border-ghost-violet/10 bg-dark-surface/40">
          <BettingPanel
            matchId={matchId}
            agentAName={agentAInfo.name}
            agentBName={agentBInfo.name}
            matchStatus={matchInfo.status}
          />
        </div>
      </div>
    </div>
  );
}
