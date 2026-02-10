import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { WalletButton } from '@/components/common/WalletButton';
import { AudioToggle } from '@/components/common/AudioToggle';
import { NetworkSwitcher } from '@/components/common/NetworkSwitcher';
import { GhostParticles } from '@/components/common/GhostParticles';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useLobbySocket } from '@/hooks/useLobbySocket';

/** 메인 레이아웃 컴포넌트 — 헤더, 콘텐츠, 푸터 */
export function Layout() {
  // 모든 페이지에서 로비 WebSocket 연결 유지 (헤더 라이브 카운터용)
  useLobbySocket();

  const { matches, tournaments } = useDashboardStore();
  const activeMatchCount = matches.filter((m) => m.status === 'active' || m.status === 'betting').length;
  const activeTournamentCount = tournaments.filter((t) => t.status === 'active').length;

  // 활성 매치에서 유니크 에이전트 수 계산
  const uniqueAgents = new Set<string>();
  for (const m of matches) {
    if (m.agentA) uniqueAgents.add(m.agentA);
    if (m.agentB) uniqueAgents.add(m.agentB);
  }
  const totalAgentCount = uniqueAgents.size;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = (): void => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/tournament/current', label: 'Tournament' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/my-bets', label: 'My Bets' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-arena-bg">
      <GhostParticles />
      <header className={`fixed left-0 right-0 top-0 z-40 transition-all duration-300 ${scrolled ? 'border-b border-ghost-violet/20 bg-arena-bg/90 backdrop-blur-lg' : 'bg-transparent'}`}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
          {/* 로고 */}
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z" fill="#7c3aed" />
              <circle cx="9" cy="10" r="1.5" fill="#0a0a0f" />
              <circle cx="15" cy="10" r="1.5" fill="#0a0a0f" />
            </svg>
            <h1
              className="neon-text-purple font-display text-sm font-bold tracking-wider text-ghost-violet lg:text-base"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              GHOST PROTOCOL
            </h1>
          </div>

          {/* 데스크톱 네비게이션 링크 */}
          <div className="hidden items-center gap-3 md:flex lg:gap-5">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `whitespace-nowrap text-xs font-medium uppercase tracking-[0.1em] transition-all lg:text-sm ${
                    isActive ? 'text-ghost-violet neon-text-purple' : 'text-gray-500 hover:text-ghost-violet'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* 오른쪽: 네트워크 전환 + 오디오 토글 + 지갑 연결 버튼 (데스크톱) */}
          <div className="hidden items-center gap-2 md:flex">
            <NetworkSwitcher />
            <AudioToggle />
            <div className="animate-neon-pulse rounded-md border border-ghost-violet/40 bg-ghost-violet/10 px-2 py-1 font-display text-[11px] font-semibold tracking-wide text-ghost-violet transition-all hover:bg-ghost-violet/20 hover:text-white">
              <WalletButton />
            </div>
          </div>

          {/* 모바일 햄버거 메뉴 */}
          <button
            onClick={() => { setMobileMenuOpen(!mobileMenuOpen); }}
            className="flex flex-col gap-1 md:hidden"
            aria-label="Toggle menu"
          >
            <div className="h-0.5 w-6 bg-ghost-violet"></div>
            <div className="h-0.5 w-6 bg-ghost-violet"></div>
            <div className="h-0.5 w-6 bg-ghost-violet"></div>
          </button>
        </nav>

        {/* 라이브 스탯 바 */}
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 pb-2 lg:px-8">
          <div className="flex items-center gap-2 rounded-full border border-ghost-violet/10 bg-arena-surface/40 px-3 py-1 text-[10px] backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
            </span>
            <span className="font-bold text-green-400">LIVE</span>
            <span className="text-gray-600">|</span>
            <span className="font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{activeMatchCount}</span>
            <span className="text-gray-500">matches</span>
            <span className="text-gray-600">|</span>
            <span className="font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{activeTournamentCount}</span>
            <span className="text-gray-500">tournaments</span>
            <span className="text-gray-600">|</span>
            <span className="font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{totalAgentCount}</span>
            <span className="text-gray-500">agents</span>
          </div>
        </div>

        {/* 모바일 메뉴 오버레이 */}
        {mobileMenuOpen && (
          <div className="mt-4 flex flex-col gap-4 border-t border-ghost-violet/20 bg-arena-surface/95 px-4 pt-4 md:hidden">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => { setMobileMenuOpen(false); }}
                className={({ isActive }) =>
                  `text-sm font-medium transition-all ${
                    isActive ? 'text-ghost-neon' : 'text-gray-400 hover:text-ghost-violet'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            <div className="flex items-center gap-3 pb-4 pt-2">
              <NetworkSwitcher />
              <AudioToggle />
              <WalletButton />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="relative border-t border-ghost-violet/20 bg-arena-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between">
          {/* 뱃지 */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-ghost-violet/20 bg-arena-surface/60 px-4 py-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-ghost-violet">
                <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8L8 5L11 8L8 11L5 8Z" fill="currentColor" fillOpacity={0.6} />
              </svg>
              <span className="text-xs font-bold tracking-wider text-ghost-violet">Built on Monad</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-arena-surface/60 px-4 py-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-400">
                <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="currentColor" fillOpacity={0.6} />
              </svg>
              <span className="text-xs font-bold tracking-wider text-amber-400">Monad Hackathon</span>
            </div>
          </div>

          {/* 저작권 */}
          <p className="text-center text-[10px] tracking-wider text-gray-500">
            GHOST PROTOCOL © 2026 • All bets are final • Play responsibly
          </p>

          {/* 링크 */}
          <div className="flex items-center gap-4">
            <Link to="/docs" className="text-xs text-gray-500 transition-colors hover:text-ghost-violet">
              SDK Docs
            </Link>
            <a href="https://github.com/tmdry4530/Ghost-Protocol" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-gray-500 transition-colors hover:text-white">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21.5c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" fill="currentColor" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
