import { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import type { MatchId } from '@ghost-protocol/shared';
import { useWagerPool } from '../../hooks/useWagerPool.js';
import { useSurvivalBet } from '../../hooks/useSurvivalBet.js';
import { useWallet } from '../../hooks/useWallet.js';
import { useBettingStore } from '../../stores/bettingStore.js';
import type { BettingHistoryItem } from '../../stores/bettingStore.js';

type TabType = 'arena' | 'survival' | 'claimable';

/**
 * Betting history and payout claim component
 *
 * Displays arena bets, survival predictions, and claimable payouts
 * in separate tabs, allowing users to claim winnings directly.
 */
export function PayoutClaim() {
  const [activeTab, setActiveTab] = useState<TabType>('arena');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const { isConnected } = useWallet();
  const wagerPool = useWagerPool();
  const survivalBet = useSurvivalBet();
  const { bettingHistory, claimablePayouts, markClaimed } = useBettingStore();

  // Reset transaction state on tab change
  useEffect(() => {
    wagerPool.reset();
    survivalBet.reset();
  }, [activeTab]);

  // 서바이벌 예측 데이터 (향후 survivalStore에서 가져올 예정)
  const survivalPredictions: Array<{
    sessionId: string;
    predictedRound: number;
    amount: number;
    actualRound: number | null;
    accuracy: number | null;
    payout: number | null;
    result: 'won' | 'lost' | 'pending';
    claimedAt: number | null;
  }> = [];

  // 실제 베팅 히스토리 데이터
  const displayHistory: BettingHistoryItem[] = bettingHistory;

  /**
   * Claim arena bet winnings
   */
  const handleClaimArena = (matchId: string) => {
    setClaimingId(matchId);
    try {
      wagerPool.claimWinnings(BigInt(matchId));
      // Call markClaimed when transaction is confirmed (recommended via useEffect)
      if (wagerPool.isConfirmed) {
        markClaimed(matchId as MatchId);
      }
    } catch (error) {
      console.error('Failed to claim arena winnings:', error);
    } finally {
      setClaimingId(null);
    }
  };

  /**
   * Claim survival prediction winnings
   */
  const handleClaimSurvival = (sessionId: string) => {
    setClaimingId(sessionId);
    try {
      survivalBet.claimPayout(BigInt(sessionId));
      // Reflect in survivalStore when transaction is confirmed (future implementation)
    } catch (error) {
      console.error('Failed to claim survival winnings:', error);
    } finally {
      setClaimingId(null);
    }
  };

  /**
   * Batch claim all winnings
   */
  const handleClaimAll = async () => {
    const claimableItems = Array.from(claimablePayouts.entries());
    for (const [matchId] of claimableItems) {
      handleClaimArena(matchId);
      // Add slight delay between transactions
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  /**
   * Calculate total claimable amount
   */
  const totalClaimable = Array.from(claimablePayouts.values()).reduce(
    (sum, amount) => sum + amount,
    0n,
  );

  /**
   * Wallet not connected screen
   */
  if (!isConnected) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg bg-arena-card p-8">
        <div className="text-center">
          <p className="text-lg text-gray-400">Connect your wallet to view betting history.</p>
          <p className="mt-2 text-sm text-gray-500">Click the wallet connect button in the top right.</p>
        </div>
      </div>
    );
  }

  /**
   * Tab button rendering
   */
  const TabButton = ({ tab, label }: { tab: TabType; label: string }) => (
    <button
      onClick={() => { setActiveTab(tab); }}
      className={`rounded-lg px-6 py-3 text-sm font-semibold transition-all ${
        activeTab === tab
          ? 'bg-gradient-to-r from-ghost-violet to-ghost-pink text-white shadow-lg shadow-ghost-violet/30'
          : 'bg-arena-surface text-gray-400 hover:bg-arena-surface/80 hover:text-ghost-violet'
      }`}
    >
      {label}
    </button>
  );

  /**
   * Result badge rendering
   */
  const ResultBadge = ({ result }: { result: 'won' | 'lost' | 'pending' | 'refunded' }) => {
    const styles = {
      won: 'bg-ghost-neon/20 text-ghost-neon border-ghost-neon',
      lost: 'bg-red-500/20 text-red-400 border-red-500',
      pending: 'bg-ghost-violet/20 text-ghost-violet border-ghost-violet animate-pulse',
      refunded: 'bg-gray-500/20 text-gray-400 border-gray-500',
    };

    const labels = {
      won: 'Won ✓',
      lost: 'Lost ✗',
      pending: 'Pending...',
      refunded: 'Refunded',
    };

    return (
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles[result]}`}>
        {labels[result]}
      </span>
    );
  };

  /**
   * Arena bets tab content
   */
  const ArenaTab = () => {
    if (displayHistory.length === 0) {
      return (
        <div className="py-12 text-center">
          <p className="text-gray-400">No betting history yet.</p>
          <p className="mt-2 text-sm text-gray-500">Try placing a bet in the Arena!</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {displayHistory.map((bet, index) => (
          <div
            key={`${bet.matchId}-${String(index)}`}
            className={`rounded-lg border p-4 transition-all ${
              bet.result === 'won'
                ? 'border-ghost-neon bg-ghost-neon/5 shadow-sm shadow-ghost-neon/20'
                : bet.result === 'lost'
                  ? 'border-gray-700 bg-gray-800/30'
                  : 'border-ghost-violet bg-ghost-violet/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-400">Match #{bet.matchId}</span>
                  <span className="text-sm text-gray-300">
                    {bet.side === 'agentA' ? 'Agent A' : 'Agent B'} selected
                  </span>
                  <span className="text-sm font-semibold text-ghost-neon">
                    {formatEther(bet.amount)} MON
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <ResultBadge result={bet.result} />
                  {bet.payout && (
                    <span className="text-sm text-gray-300">
                      Payout:{' '}
                      <span className="font-semibold text-ghost-neon">
                        {formatEther(bet.payout)} MON
                      </span>
                    </span>
                  )}
                  {bet.claimedAt && (
                    <span className="text-xs text-gray-500">
                      Claimed ({new Date(bet.claimedAt).toLocaleDateString()})
                    </span>
                  )}
                </div>
              </div>
              {bet.result === 'won' && bet.claimedAt === null && (
                <button
                  onClick={() => { handleClaimArena(bet.matchId as string); }}
                  disabled={
                    claimingId === bet.matchId || wagerPool.isPending || wagerPool.isConfirming
                  }
                  className="rounded-lg bg-gradient-to-r from-ghost-violet to-ghost-pink px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-ghost-violet/30 disabled:opacity-50"
                >
                  {claimingId === bet.matchId || wagerPool.isPending || wagerPool.isConfirming
                    ? 'Claiming...'
                    : 'Claim'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /**
   * Survival predictions tab content
   */
  const SurvivalTab = () => {
    if (survivalPredictions.length === 0) {
      return (
        <div className="py-12 text-center">
          <p className="text-gray-400">No prediction history yet.</p>
          <p className="mt-2 text-sm text-gray-500">Try making a prediction in Survival Mode!</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {survivalPredictions.map((prediction) => (
          <div
            key={prediction.sessionId}
            className={`rounded-lg border p-4 transition-all ${
              prediction.result === 'won'
                ? 'border-ghost-neon bg-ghost-neon/5 shadow-sm shadow-ghost-neon/20'
                : prediction.result === 'lost'
                  ? 'border-gray-700 bg-gray-800/30'
                  : 'border-ghost-violet bg-ghost-violet/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-400">
                    Session #{prediction.sessionId}
                  </span>
                  <span className="text-sm text-gray-300">
                    Predicted Round {prediction.predictedRound}
                  </span>
                  <span className="text-sm font-semibold text-ghost-neon">
                    {prediction.amount} MON
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <ResultBadge result={prediction.result} />
                  {prediction.actualRound !== null && (
                    <span className="text-sm text-gray-300">
                      Actual: Round {prediction.actualRound}
                    </span>
                  )}
                  {prediction.accuracy !== null && (
                    <span className="text-sm text-gray-400">Accuracy: {prediction.accuracy}%</span>
                  )}
                  {prediction.payout !== null && (
                    <span className="text-sm text-gray-300">
                      Payout:{' '}
                      <span className="font-semibold text-ghost-neon">{prediction.payout} MON</span>
                    </span>
                  )}
                  {prediction.claimedAt !== null && (
                    <span className="text-xs text-gray-500">
                      Claimed ({new Date(prediction.claimedAt).toLocaleDateString()})
                    </span>
                  )}
                </div>
              </div>
              {prediction.result === 'won' && prediction.claimedAt === null && (
                <button
                  onClick={() => { handleClaimSurvival(prediction.sessionId); }}
                  disabled={
                    claimingId === prediction.sessionId ||
                    survivalBet.isPending ||
                    survivalBet.isConfirming
                  }
                  className="rounded-lg bg-gradient-to-r from-ghost-violet to-ghost-pink px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-ghost-violet/30 disabled:opacity-50"
                >
                  {claimingId === prediction.sessionId ||
                  survivalBet.isPending ||
                  survivalBet.isConfirming
                    ? 'Claiming...'
                    : 'Claim'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /**
   * Claimable tab content
   */
  const ClaimableTab = () => {
    const claimableItems = Array.from(claimablePayouts.entries());

    if (claimableItems.length === 0) {
      return (
        <div className="py-12 text-center">
          <p className="text-gray-400">No claimable winnings.</p>
          <p className="mt-2 text-sm text-gray-500">Winning bets will appear here.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Total claimable amount */}
        <div className="rounded-lg border border-ghost-neon bg-ghost-neon/10 p-6 shadow-lg shadow-ghost-neon/20">
          <div className="text-center">
            <p className="text-sm text-gray-400">Total Claimable</p>
            <p className="mt-2 text-4xl font-bold text-ghost-neon neon-text">
              {formatEther(totalClaimable)} MON
            </p>
          </div>
        </div>

        {/* Claimable items list */}
        <div className="space-y-3">
          {claimableItems.map(([matchId, amount]) => (
            <div
              key={matchId}
              className="flex items-center justify-between rounded-lg border border-ghost-violet bg-arena-surface p-4"
            >
              <div className="flex items-center gap-4">
                <span className="text-sm font-mono text-gray-400">Match #{matchId}</span>
                <span className="text-lg font-semibold text-ghost-neon">
                  {formatEther(amount)} MON
                </span>
              </div>
              <button
                onClick={() => { handleClaimArena(matchId); }}
                disabled={claimingId === matchId || wagerPool.isPending || wagerPool.isConfirming}
                className="rounded-lg bg-gradient-to-r from-ghost-violet to-ghost-pink px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-ghost-violet/30 disabled:opacity-50"
              >
                {claimingId === matchId || wagerPool.isPending || wagerPool.isConfirming
                  ? 'Claiming...'
                  : 'Claim'}
              </button>
            </div>
          ))}
        </div>

        {/* Claim all button */}
        {claimableItems.length > 1 && (
          <button
            onClick={() => { void handleClaimAll(); }}
            disabled={wagerPool.isPending || wagerPool.isConfirming}
            className="w-full rounded-lg bg-gradient-to-r from-ghost-violet to-ghost-pink py-3 text-sm font-bold text-white transition-all hover:shadow-xl hover:shadow-ghost-violet/40 disabled:opacity-50"
          >
            {wagerPool.isPending || wagerPool.isConfirming ? 'Claiming...' : 'Claim All'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">💰</span>
        <h2 className="text-2xl font-bold text-white neon-text">My Bets & Claim Winnings</h2>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-3">
        <TabButton tab="arena" label="Arena Bets" />
        <TabButton tab="survival" label="Survival Predictions" />
        <TabButton tab="claimable" label="Claimable" />
      </div>

      {/* Tab content */}
      <div className="rounded-lg bg-arena-card p-6">
        {activeTab === 'arena' && <ArenaTab />}
        {activeTab === 'survival' && <SurvivalTab />}
        {activeTab === 'claimable' && <ClaimableTab />}
      </div>

      {/* Transaction status notification */}
      {(wagerPool.isPending || survivalBet.isPending) && (
        <div className="rounded-lg border border-ghost-violet bg-ghost-violet/10 p-4 text-center">
          <p className="text-sm text-gray-300">Processing transaction...</p>
        </div>
      )}
      {(wagerPool.isConfirmed || survivalBet.isConfirmed) && (
        <div className="rounded-lg border border-ghost-neon bg-ghost-neon/10 p-4 text-center">
          <p className="text-sm text-ghost-neon">Winnings claimed successfully! ✓</p>
        </div>
      )}
      {(wagerPool.error !== null || survivalBet.error !== null) && (
        <div className="rounded-lg border border-red-500 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-400">
            An error occurred: {wagerPool.error?.message ?? survivalBet.error?.message ?? 'Unknown error'}
          </p>
        </div>
      )}
    </div>
  );
}
