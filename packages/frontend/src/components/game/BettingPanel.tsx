import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import type { BetSide, MatchId } from '@ghost-protocol/shared';
import { useBettingStore } from '../../stores/bettingStore.js';
import { useWagerPool } from '../../hooks/useWagerPool.js';
import { useWallet } from '../../hooks/useWallet.js';
import { useAudio } from '../../hooks/useAudio.js';

interface BettingPanelProps {
  /** Match ID */
  matchId: MatchId;
  /** Agent A name */
  agentAName: string;
  /** Agent B name */
  agentBName: string;
  /** Betting deadline (Unix timestamp ms, optional) */
  bettingDeadline?: number;
}

/**
 * Betting panel component
 * Betting interface displayed on the right side of the match spectating page
 */
export function BettingPanel({
  matchId,
  agentAName,
  agentBName,
  bettingDeadline,
}: BettingPanelProps) {
  const { isConnected } = useAccount();
  const {
    pool,
    myBet,
    isLocked,
    settlement,
    notification,
    addBetToHistory,
    setMyBet,
    clearNotification,
    clearSettlement,
  } = useBettingStore();
  const { balance } = useWallet();
  const { placeBet, claimWinnings, txHash, isPending, isConfirming, isConfirmed, error } =
    useWagerPool();
  const { sfx } = useAudio();

  const [betAmount, setBetAmount] = useState('');
  const [selectedSide, setSelectedSide] = useState<BetSide | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Bet validation
  const getValidationMessage = (): string | null => {
    if (!isConnected) return 'Please connect your wallet';
    if (selectedSide === null) return 'Please select a side to bet on';
    if (betAmount === '') return 'Please enter a bet amount';
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) return 'Please enter a valid amount';
    if (amount < 0.001) return 'Minimum bet is 0.001 MON';
    if (amount > 10) return 'Maximum bet is 10 MON';
    if (balance !== undefined) {
      const balanceMon = parseFloat(formatEther(balance));
      if (amount > balanceMon) return 'Insufficient balance';
    }
    return null;
  };
  const validationMessage = getValidationMessage();

  // Betting deadline countdown timer
  useEffect(() => {
    if (!bettingDeadline) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = (): void => {
      const now = Date.now();
      const remaining = Math.max(0, bettingDeadline - now);
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [bettingDeadline]);

  // Update state on transaction confirmation
  useEffect(() => {
    if (isConfirmed && selectedSide !== null && betAmount !== '') {
      const amountWei = parseEther(betAmount);
      setMyBet(selectedSide, amountWei);
      addBetToHistory(matchId, selectedSide, amountWei);
      setBetAmount('');
      setSelectedSide(null);
    }
  }, [isConfirmed, selectedSide, betAmount, matchId, setMyBet, addBetToHistory]);

  // Settlement result sound
  useEffect(() => {
    if (!settlement) return;

    if (settlement.isWin) {
      sfx.playBetResultWin();
    } else {
      sfx.playBetResultLoss();
    }
  }, [settlement, sfx]);

  // Format MON (wei -> MON)
  const formatMon = (wei: bigint): string => {
    return parseFloat(formatEther(wei)).toFixed(3);
  };

  // Betting status text
  const getStatusText = (): string => {
    if (timeRemaining !== null && timeRemaining === 0) return 'Betting Closed';
    if (isLocked) return 'Betting Locked';
    if (pool === null) return 'Loading...';
    return 'Accepting Bets';
  };

  // Betting status color
  const getStatusColor = (): string => {
    if (timeRemaining !== null && timeRemaining === 0) return '#ef4444';
    if (isLocked) return '#ef4444';
    if (pool === null) return '#6b7280';
    return '#22d3ee';
  };

  // Format time (ms -> MM:SS)
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Place bet handler
  const handlePlaceBet = (): void => {
    if (!isConnected || selectedSide === null || betAmount === '') return;

    try {
      const amountWei = parseEther(betAmount);
      const side = selectedSide === 'agentA' ? 0 : 1;
      const numericMatchId = Number(matchId.split(':')[1] ?? (matchId.replace(/\D/g, '') || '0'));
      placeBet(BigInt(numericMatchId), side, amountWei);
      sfx.playBetPlaced();
    } catch (err) {
      console.error('Bet failed:', err);
    }
  };

  // Claim winnings handler
  const handleClaimWinnings = (): void => {
    if (settlement === null) return;

    try {
      const numericMatchId = Number(matchId.split(':')[1] ?? (matchId.replace(/\D/g, '') || '0'));
      claimWinnings(BigInt(numericMatchId));
      sfx.playPayoutClaimed();
    } catch (err) {
      console.error('Claim failed:', err);
    }
  };

  // Whether betting is disabled
  const isBettingDisabled = isLocked || (timeRemaining !== null && timeRemaining === 0);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        backgroundColor: '#1a1a3e',
        borderLeft: '1px solid #2d2b6b',
      }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-arena-border">
        <h2 className="text-xl font-bold text-white mb-2">Betting</h2>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="text-sm" style={{ color: getStatusColor() }}>
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Notification toast */}
        {notification && (
          <div
            className={`p-4 rounded-lg border-l-4 flex items-center gap-3 animate-slide-in ${
              notification.type === 'locked'
                ? 'bg-yellow-900/20 border-yellow-500'
                : notification.type === 'claimed'
                  ? 'bg-green-900/20 border-green-500'
                  : 'bg-blue-900/20 border-blue-500'
            }`}
          >
            <div className="flex-shrink-0">
              {notification.type === 'locked' && <span className="text-xl">🔒</span>}
              {notification.type === 'claimed' && <span className="text-xl">✅</span>}
              {notification.type === 'settled' && <span className="text-xl">🎯</span>}
            </div>
            <p className="text-sm text-white flex-1">{notification.message}</p>
            <button
              onClick={clearNotification}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Betting deadline countdown */}
        {timeRemaining !== null && timeRemaining > 0 && (
          <div
            className={`p-4 rounded-lg text-center ${
              timeRemaining < 30000 ? 'neon-glow animate-pulse' : ''
            }`}
            style={{
              backgroundColor: timeRemaining < 30000 ? '#1a0a2e' : '#111128',
              border: timeRemaining < 30000 ? '1px solid #8b5cf6' : 'none',
            }}
          >
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Time Remaining</div>
            <div
              className="text-3xl font-display font-bold"
              style={{
                color: timeRemaining < 30000 ? '#8b5cf6' : '#22d3ee',
              }}
            >
              {formatTime(timeRemaining)}
            </div>
          </div>
        )}
        {/* Odds display */}
        {pool && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider">Current Odds</div>

            {/* Agent A odds */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white">{agentAName}</span>
                <span className="text-lg font-bold text-ghost-blue">{pool.oddsA.toFixed(2)}x</span>
              </div>
              <div className="h-2 bg-arena-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-ghost-blue transition-all duration-300"
                  style={{
                    width: `${String((Number(pool.sideA) / Number(pool.totalPool)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Agent B odds */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white">{agentBName}</span>
                <span className="text-lg font-bold text-ghost-pink">{pool.oddsB.toFixed(2)}x</span>
              </div>
              <div className="h-2 bg-arena-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-ghost-pink transition-all duration-300"
                  style={{
                    width: `${String((Number(pool.sideB) / Number(pool.totalPool)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Total betting pool */}
        {pool && (
          <div className="p-4 rounded-lg" style={{ backgroundColor: '#111128' }}>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Pool</div>
            <div className="text-2xl font-bold text-white">{formatMon(pool.totalPool)} MON</div>
            <div className="text-xs text-gray-400 mt-1">{pool.betCount} bets</div>
          </div>
        )}

        {/* Settlement result overlay */}
        {settlement && (
          <div
            className={`p-6 rounded-lg border-2 ${
              settlement.isWin
                ? 'bg-green-900/20 border-green-500 neon-glow'
                : 'bg-gray-900/20 border-gray-600'
            }`}
          >
            <div className="text-center space-y-4">
              <div className="text-4xl">{settlement.isWin ? '🎉' : '😢'}</div>
              <div>
                <div className="text-xl font-bold text-white mb-2">
                  {settlement.isWin ? 'Congratulations!' : 'Better luck next time'}
                </div>
                {settlement.isWin && settlement.myPayout !== null && (
                  <div className="text-2xl font-bold text-green-400">
                    Won {formatMon(settlement.myPayout)} MON!
                  </div>
                )}
                {!settlement.isWin && (
                  <div className="text-sm text-gray-400">Try again next match</div>
                )}
              </div>
              {settlement.isWin && settlement.myPayout !== null && (
                <button
                  onClick={() => { handleClaimWinnings(); }}
                  disabled={isPending || isConfirming}
                  className="w-full px-6 py-3 rounded-lg font-bold text-white transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
                  }}
                >
                  {isPending || isConfirming ? 'Processing...' : 'Claim Winnings'}
                </button>
              )}
              <button
                onClick={clearSettlement}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Betting input form */}
        {!isConnected ? (
          <div className="p-4 rounded-lg text-center" style={{ backgroundColor: '#111128' }}>
            <p className="text-sm text-gray-400">Connect your wallet to place bets</p>
          </div>
        ) : myBet ? (
          <div className="p-4 rounded-lg" style={{ backgroundColor: '#111128' }}>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">My Bet</div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white">
                {myBet.side === 'agentA' ? agentAName : agentBName}
              </span>
              <span className="text-lg font-bold text-ghost-neon">
                {formatMon(myBet.amount)} MON
              </span>
            </div>
          </div>
        ) : (
          !isBettingDisabled && (
            <div className="space-y-4">
              {/* Wallet balance display */}
              {balance !== undefined && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Balance:</span>
                  <span className="text-white font-semibold">{formatMon(balance)} MON</span>
                </div>
              )}

              {/* Transaction status display */}
              {(isPending || isConfirming || isConfirmed || error) && (
                <div
                  className={`p-4 rounded-lg border ${
                    error
                      ? 'bg-red-900/20 border-red-500'
                      : isConfirmed
                        ? 'bg-green-900/20 border-green-500'
                        : 'bg-blue-900/20 border-blue-500'
                  }`}
                >
                  {isPending && (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      <span className="text-sm text-white">Signing in wallet...</span>
                    </div>
                  )}
                  {isConfirming && !isPending && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span className="text-sm text-white">Sending transaction...</span>
                      </div>
                      {txHash && (
                        <a
                          href={`https://explorer.testnet.monad.xyz/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 underline break-all"
                        >
                          {txHash}
                        </a>
                      )}
                    </div>
                  )}
                  {isConfirmed && !isPending && !isConfirming && (
                    <div className="flex items-center gap-3">
                      <span className="text-xl">✅</span>
                      <span className="text-sm text-white font-semibold">Bet confirmed!</span>
                    </div>
                  )}
                  {error && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">❌</span>
                        <span className="text-sm text-white">Transaction failed</span>
                      </div>
                      <p className="text-xs text-red-300">{error.message}</p>
                      <button
                        onClick={() => { handlePlaceBet(); }}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Bet Amount (MON)
                </label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || (parseFloat(val) >= 0 && parseFloat(val) <= 10)) {
                      setBetAmount(val);
                    }
                  }}
                  placeholder="0.001"
                  step="0.001"
                  min="0.001"
                  max="10"
                  disabled={isPending || isConfirming}
                  className="w-full px-4 py-3 rounded-lg bg-arena-bg border border-arena-border text-white focus:outline-none focus:border-ghost-violet transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Select Side
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setSelectedSide('agentA'); }}
                    disabled={isPending || isConfirming}
                    className={`px-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      selectedSide === 'agentA'
                        ? 'bg-ghost-blue text-white neon-glow'
                        : 'bg-arena-bg text-gray-400 hover:text-white hover:border-ghost-blue'
                    }`}
                    style={{
                      border: selectedSide === 'agentA' ? 'none' : '1px solid #2d2b6b',
                    }}
                  >
                    {agentAName}
                  </button>
                  <button
                    onClick={() => { setSelectedSide('agentB'); }}
                    disabled={isPending || isConfirming}
                    className={`px-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      selectedSide === 'agentB'
                        ? 'bg-ghost-pink text-white neon-glow'
                        : 'bg-arena-bg text-gray-400 hover:text-white hover:border-ghost-pink'
                    }`}
                    style={{
                      border: selectedSide === 'agentB' ? 'none' : '1px solid #2d2b6b',
                    }}
                  >
                    {agentBName}
                  </button>
                </div>
              </div>

              <button
                onClick={() => { handlePlaceBet(); }}
                disabled={validationMessage !== null || isPending || isConfirming}
                className="w-full px-6 py-4 rounded-lg font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    validationMessage === null && !isPending && !isConfirming
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'
                      : '#2d2b6b',
                  boxShadow:
                    validationMessage === null && !isPending && !isConfirming
                      ? '0 0 20px rgba(139, 92, 246, 0.5)'
                      : 'none',
                }}
              >
                {isPending || isConfirming ? 'Processing...' : 'Place Bet'}
              </button>
              {validationMessage && !isPending && !isConfirming && (
                <p className="text-center text-xs text-gray-500 mt-2">{validationMessage}</p>
              )}
            </div>
          )
        )}

        {/* Betting closed notice */}
        {isBettingDisabled && !myBet && isConnected && (
          <div className="p-4 rounded-lg text-center" style={{ backgroundColor: '#111128' }}>
            <p className="text-sm text-gray-400">Betting is closed</p>
          </div>
        )}

        {/* Betting rules */}
        <div
          className="p-4 rounded-lg text-xs text-gray-400 space-y-2"
          style={{ backgroundColor: '#111128' }}
        >
          <div className="font-semibold text-gray-300 mb-2">Betting Rules</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>Minimum bet: 0.001 MON</li>
            <li>Maximum bet: 10 MON</li>
            <li>One bet per match</li>
            <li>No cancellations after lock</li>
            <li>Platform fee: 5%</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
