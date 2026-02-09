import { Link } from 'react-router-dom';
import { PayoutClaim } from '@/components/betting/PayoutClaim';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

/**
 * My Bets page
 *
 * View betting history and claimable winnings,
 * and claim payouts directly from this page.
 */
export function MyBets() {
  const { isConnected } = useAccount();
  const { connect } = useConnect();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-20 pt-24">
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

      <h1
        className="neon-text-purple text-center text-3xl tracking-widest text-ghost-violet"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        MY BETS
      </h1>

      {!isConnected ? (
        <div className="mx-auto max-w-md rounded-xl border border-ghost-violet/10 bg-arena-surface/40 p-8 text-center backdrop-blur-sm">
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            className="mx-auto mb-6"
          >
            <path
              d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z"
              fill="#7c3aed"
              fillOpacity="0.3"
            />
            <circle cx="9" cy="10" r="1.5" fill="#7c3aed" fillOpacity="0.6" />
            <circle cx="15" cy="10" r="1.5" fill="#7c3aed" fillOpacity="0.6" />
          </svg>
          <p className="mb-6 text-sm text-muted-foreground">
            Connect your wallet to view betting history
          </p>
          <button
            onClick={() => { connect({ connector: injected() }); }}
            className="animate-neon-pulse rounded-lg border border-ghost-violet/40 bg-ghost-violet/10 px-6 py-3 text-sm tracking-wider text-ghost-violet hover:bg-ghost-violet/25 hover:text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <PayoutClaim />
      )}
    </div>
  );
}
