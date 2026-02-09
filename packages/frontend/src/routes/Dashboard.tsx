/**
 * 대시보드 페이지 (랜딩)
 * Ghost Protocol Arena 메인 랜딩 페이지 — 히어로, 모드 카드, 라이브 피드
 */
import { Link } from 'react-router-dom';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useLobbySocket } from '@/hooks/useLobbySocket';

/** 시간 경과 포맷 */
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${String(Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${String(Math.floor(diff / 3_600_000))}h ago`;
  return `${String(Math.floor(diff / 86_400_000))}d ago`;
}

/** 피드 아이템 타입별 아이콘 매핑 */
function getFeedIcon(type: string): string {
  switch (type) {
    case 'tournament_created': return '\u{1F3C6}';
    case 'match_started': return '\u26A1';
    case 'match_completed': return '\u2705';
    case 'tournament_completed': return '\u{1F451}';
    default: return '\u{1F47B}';
  }
}

/**
 * 대시보드 랜딩 페이지 컴포넌트
 * 히어로 섹션 + 모드 카드 + 라이브 피드로 구성
 */
export function Dashboard(): React.JSX.Element {
  const { matches, feedItems } = useDashboardStore();

  // 로비 WebSocket 연결
  useLobbySocket();

  const liveMatches = matches.filter((m) => m.status === 'active' || m.status === 'betting');
  const firstActiveMatch = liveMatches[0];

  return (
    <div className="scanline-overlay grid-bg relative min-h-screen">
      {/* ===== 1. 히어로 섹션 (전체 뷰포트 높이) ===== */}
      <section className="relative z-10 flex min-h-screen flex-col items-center px-4 pt-20 pb-8">
        {/* Radial gradient background overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(124,58,237,0.08) 0%, transparent 70%)',
          }}
        />

        {/* Centered hero content */}
        <div className="flex flex-1 flex-col items-center justify-center">

        {/* 타이틀 — 네온 퍼플 글로우 */}
        <h1
          className="animate-text-glow text-center font-black tracking-widest"
          style={{ fontFamily: 'var(--font-display)', color: '#7c3aed' }}
        >
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[96px]">GHOST</span>
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[96px] mt-2">PROTOCOL</span>
        </h1>

        {/* 태그라인 */}
        <p className="mt-4 text-center text-sm tracking-wide text-gray-300 sm:text-base md:text-lg">
          AI Agent Pac-Man Arena &bull; On-chain Wagering &bull; Built on Monad
        </p>

        {/* 도트 인디케이터 */}
        <div className="mt-6 flex items-center gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="animate-dot-pulse inline-block h-1.5 w-1.5 rounded-full bg-ghost-violet"
              style={{ animationDelay: `${String(i * 200)}ms` }}
            />
          ))}
        </div>

        {/* ===== 2. 모드 카드 (히어로 내부) ===== */}
        <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {/* 아레나 모드 카드 */}
          <div className="group relative overflow-hidden rounded-xl border border-ghost-violet/30 bg-arena-surface/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-ghost-violet/60 hover:bg-dark-surface-2/80 lg:p-8">
            {/* Gradient border overlay */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.1), transparent 60%)' }}
            />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl">{'\u2694\uFE0F'}</span>
                <h2
                  className="text-sm font-bold tracking-wider"
                  style={{ fontFamily: 'var(--font-display)', color: '#7c3aed' }}
                >
                  ARENA MODE
                </h2>
              </div>
              <p className="mb-5 flex-1 text-sm leading-relaxed text-gray-300">
                Watch AI agents battle in Pac-Man tournaments. Bet on the winner.
              </p>
              <Link
                to={firstActiveMatch ? `/match/${firstActiveMatch.id}` : '/tournament/current'}
                className="animate-neon-pulse block w-full rounded-lg border-2 border-ghost-violet/70 bg-ghost-violet/10 py-3.5 text-center text-sm font-bold tracking-wider text-ghost-violet transition-all hover:bg-ghost-violet/30 hover:text-white hover:border-ghost-violet"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Watch &amp; Bet
              </Link>
            </div>
          </div>

          {/* 서바이벌 모드 카드 */}
          <div className="group relative overflow-hidden rounded-xl border border-amber-400/30 bg-arena-surface/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-amber-400/60 hover:bg-dark-surface-2/80 lg:p-8">
            {/* Gradient border overlay */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
              style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1), transparent 60%)' }}
            />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl">{'\u{1F47E}'}</span>
                <h2
                  className="text-sm font-bold tracking-wider"
                  style={{ fontFamily: 'var(--font-display)', color: '#fbbf24' }}
                >
                  SURVIVAL MODE
                </h2>
              </div>
              <p className="mb-5 flex-1 text-sm leading-relaxed text-gray-300">
                You vs AI Ghosts. How long can you survive?
              </p>
              <Link
                to="/survival"
                className="animate-neon-pulse-yellow block w-full rounded-lg border-2 border-amber-400/70 bg-amber-400/10 py-3.5 text-center text-sm font-bold tracking-wider text-amber-400 transition-all hover:bg-amber-400/30 hover:text-white hover:border-amber-400"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Play Now
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll indicator with live feed label */}
        <div className="relative z-10 mt-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
            </span>
            <span
              className="text-xs font-bold uppercase tracking-[0.25em] text-gray-500"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              LIVE FEED
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="animate-bounce text-ghost-violet"
          >
            <path
              d="M8 3v10M4 9l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        </div>
      </section>

      {/* ===== 3. 라이브 피드 섹션 ===== */}
      <section className="relative z-10 px-4 pb-16">
        <div className="mx-auto max-w-3xl space-y-3">
          {feedItems.length > 0 ? (
            feedItems.slice(0, 10).map((item, idx) => (
              <div
                key={item.id ?? idx}
                className="flex items-center gap-3 rounded-lg border border-ghost-violet/10 bg-arena-surface/40 px-4 py-3 backdrop-blur-sm transition-all hover:border-ghost-violet/30"
              >
                <span className="text-lg">
                  {getFeedIcon(item.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">{item.message ?? item.description}</p>
                </div>
                <span className="whitespace-nowrap text-[10px] text-gray-600">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-ghost-violet/10 bg-arena-surface/40 p-8 text-center backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">{'\u{1F47B}'}</span>
                <p className="text-sm text-gray-500">Waiting for live activity...</p>
                <p className="text-xs text-gray-600">Matches and tournaments will appear here</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
