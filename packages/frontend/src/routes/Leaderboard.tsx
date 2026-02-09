import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentRankingTable } from '@/components/leaderboard/AgentRankingTable';
import { SurvivalRecords } from '@/components/leaderboard/SurvivalRecords';
import { TopBettors } from '@/components/leaderboard/TopBettors';

/** Tab type */
type TabType = 'agents' | 'survival' | 'bettors';

/** Tab interface */
interface Tab {
  readonly id: TabType;
  readonly label: string;
  readonly icon: string;
}

/** Tab list */
const tabs: Tab[] = [
  { id: 'agents', label: 'Agent Rankings', icon: '🤖' },
  { id: 'survival', label: 'Survival Records', icon: '👾' },
  { id: 'bettors', label: 'Top Bettors', icon: '💰' },
];

/** Leaderboard page component */
export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<TabType>('agents');

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-20 pt-24">
      {/* 뒤로가기 */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs tracking-wider text-gray-500 transition-colors hover:text-ghost-violet"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        BACK
      </Link>

      {/* Page header */}
      <header className="space-y-2 text-center">
        <h1
          className="neon-text-purple text-3xl tracking-widest text-ghost-violet sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          LEADERBOARD
        </h1>
        <p className="text-sm tracking-wide text-muted-foreground">
          Top agents, survival records, and betting leaders
        </p>
      </header>

      {/* Tab navigation */}
      <nav className="flex justify-center">
        <div className="flex gap-2 rounded-full border border-ghost-violet/10 bg-dark-surface/60 p-1 backdrop-blur-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); }}
              className={
                activeTab === tab.id
                  ? 'rounded-full bg-ghost-violet/20 px-4 py-2 text-xs tracking-wider text-ghost-violet'
                  : 'rounded-full px-4 py-2 text-xs text-muted-foreground hover:text-ghost-violet'
              }
              style={activeTab === tab.id ? { fontFamily: 'var(--font-display)' } : undefined}
              type="button"
            >
              <span className="flex items-center gap-2">
                <span>{tab.icon}</span>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <div className="animate-fadeIn">
        {activeTab === 'agents' && <AgentRankingTable />}
        {activeTab === 'survival' && <SurvivalRecords />}
        {activeTab === 'bettors' && <TopBettors />}
      </div>
    </div>
  );
}
