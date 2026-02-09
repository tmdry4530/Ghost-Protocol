import { useState, useEffect, useMemo } from 'react';
import { parseEther, formatEther } from 'viem';
import type { SessionId } from '@ghost-protocol/shared';
import { useSurvivalBet } from '../../hooks/useSurvivalBet.js';
import { useWallet } from '../../hooks/useWallet.js';
import { useSurvivalBettingStore } from '../../stores/survivalBettingStore.js';
import { SessionStatus } from '../../lib/contracts.js';
import type { SessionInfo, PredictionInfo } from '../../hooks/useSurvivalBet.js';

/**
 * SurvivalBetting component Props
 */
interface SurvivalBettingProps {
  /** Session ID */
  sessionId: SessionId;
  /** Player name (optional) */
  playerName?: string;
  /** Current round in progress (for live spectating, optional) */
  currentRound?: number;
}


/**
 * Survival prediction betting component
 *
 * Provides an interface for predicting and betting on a player's survival round
 * in Survival Mode.
 * - Round selection grid (1-9, 9+)
 * - Per-round prediction distribution visualization
 * - Odds calculation and preview
 * - My prediction status display
 * - Post-settlement payout claim
 *
 * @example
 * ```tsx
 * <SurvivalBetting
 *   sessionId="survival:123"
 *   playerName="PacManAI"
 *   currentRound={3}
 * />
 * ```
 */
export function SurvivalBetting({
  sessionId,
  playerName = 'Player',
  currentRound,
}: SurvivalBettingProps) {
  const { isConnected, balance } = useWallet();
  const {
    placePrediction,
    claimPayout,
    getSessionInfo,
    getPredictionDistribution,
    getMyPrediction,
    calculatePayout,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  } = useSurvivalBet();

  const {
    status: storeStatus,
    setStatus,
    setMyPrediction: setStoreMyPrediction,
  } = useSurvivalBettingStore();

  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [isClaimingPayout, setIsClaimingPayout] = useState(false);

  // Convert sessionId to bigint
  const numericSessionId = useMemo(() => {
    const parts = sessionId.split(':');
    return BigInt(parts[1] ?? (sessionId.replace(/\D/g, '') || '0'));
  }, [sessionId]);

  // Session info state
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [predictionDistribution, setPredictionDistribution] = useState<bigint[] | null>(null);
  const [myPrediction, setMyPrediction] = useState<PredictionInfo | null>(null);
  const [myPayout, setMyPayout] = useState<bigint | null>(null);

  // Fetch session info
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      const [session, distribution, prediction, payout] = await Promise.all([
        getSessionInfo(numericSessionId),
        getPredictionDistribution(numericSessionId),
        getMyPrediction(numericSessionId),
        calculatePayout(numericSessionId),
      ]);

      if (mounted) {
        setSessionInfo(session);
        setPredictionDistribution(distribution);
        setMyPrediction(prediction);
        setMyPayout(payout);
      }
    };

    void fetchData();

    return () => {
      mounted = false;
    };
  }, [
    numericSessionId,
    getSessionInfo,
    getPredictionDistribution,
    getMyPrediction,
    calculatePayout,
  ]);

  // Sync session status
  useEffect(() => {
    if (sessionInfo) {
      if (sessionInfo.status === SessionStatus.Betting) {
        setStatus('betting');
      } else if (sessionInfo.status === SessionStatus.Active) {
        setStatus('active');
      } else {
        setStatus('settled');
      }
    }
  }, [sessionInfo, setStatus]);

  // Update my prediction when transaction is confirmed
  useEffect(() => {
    if (isConfirmed && selectedRound !== null && betAmount !== '') {
      const amountWei = parseEther(betAmount);
      setStoreMyPrediction(selectedRound, amountWei);
      setBetAmount('');
      setSelectedRound(null);
    }
  }, [isConfirmed, selectedRound, betAmount, setStoreMyPrediction]);

  // Format MON units (wei -> MON)
  const formatMon = (wei: bigint): string => {
    return parseFloat(formatEther(wei)).toFixed(3);
  };

  // Calculate total pool
  const totalPool = useMemo(() => {
    if (!predictionDistribution) return 0n;
    return predictionDistribution.reduce((sum: bigint, amount: bigint) => sum + amount, 0n);
  }, [predictionDistribution]);

  // Calculate per-round bet amount and percentage
  const distributionData = useMemo(() => {
    const data: Array<{ round: number; amount: bigint; percentage: number }> = [];

    if (predictionDistribution) {
      predictionDistribution.forEach((amount, index) => {
        if (amount > 0n) {
          const round = index;
          const percentage = totalPool > 0n ? (Number(amount) / Number(totalPool)) * 100 : 0;
          data.push({ round, amount, percentage });
        }
      });
    }

    return data.sort((a, b) => a.round - b.round);
  }, [predictionDistribution, totalPool]);

  // Calculate odds (simplified pari-mutuel method)
  const calculateOdds = (round: number): number => {
    const roundData = distributionData.find((d) => d.round === round);
    if (!roundData || roundData.amount === 0n || totalPool === 0n) {
      return 1.0;
    }
    return Number(totalPool) / Number(roundData.amount);
  };

  // Calculate estimated payout
  const estimatedPayout = useMemo(() => {
    if (selectedRound === null || betAmount === '' || parseFloat(betAmount) <= 0) {
      return 0n;
    }
    const odds = calculateOdds(selectedRound);
    const amountWei = parseEther(betAmount);
    return BigInt(Math.floor(Number(amountWei) * odds));
  }, [selectedRound, betAmount, distributionData]);

  // Round selection handler
  const handleRoundSelect = (round: number): void => {
    if (storeStatus === 'betting' && !myPrediction) {
      setSelectedRound(round);
    }
  };

  // Bet submission handler
  const handlePlaceBet = (): void => {
    if (!isConnected || selectedRound === null || betAmount === '') return;

    try {
      const amountWei = parseEther(betAmount);
      placePrediction(numericSessionId, selectedRound, amountWei);
    } catch (err) {
      console.error('Failed to place prediction bet:', err);
    }
  };

  // Payout claim handler
  const handleClaimPayout = (): void => {
    if (myPayout === null || myPayout === 0n) return;

    try {
      setIsClaimingPayout(true);
      claimPayout(numericSessionId);
    } catch (err) {
      console.error('Failed to claim payout:', err);
    } finally {
      setIsClaimingPayout(false);
    }
  };

  // Calculate gradient color (blue -> pink based on round)
  const getRoundGradientColor = (round: number): string => {
    const maxRound = 10;
    const ratio = Math.min(round / maxRound, 1);
    // ghost-blue (#3b82f6) -> ghost-pink (#ec4899)
    const r = Math.floor(59 + (236 - 59) * ratio);
    const g = Math.floor(130 - (130 - 72) * ratio);
    const b = Math.floor(246 - (246 - 153) * ratio);
    return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
  };

  // Check if round has already passed
  const isRoundPassed = (round: number): boolean => {
    return currentRound !== undefined && round < currentRound;
  };

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
        <h2 className="text-xl font-bold text-white mb-1">🎯 Survival Prediction Betting</h2>
        <div className="text-sm text-gray-400">Player: {playerName}</div>
        <div className="text-xs text-gray-500">Session: {sessionId}</div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Round selection grid */}
        {storeStatus === 'betting' && !myPrediction && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider">Select Elimination Round</div>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((round) => (
                <button
                  key={round}
                  onClick={() => { handleRoundSelect(round); }}
                  disabled={isRoundPassed(round)}
                  className={`
                    px-3 py-2 rounded-lg font-semibold text-sm transition-all
                    ${
                      selectedRound === round
                        ? 'text-white neon-glow'
                        : 'text-gray-400 hover:text-white'
                    }
                    ${isRoundPassed(round) ? 'opacity-30 cursor-not-allowed' : ''}
                  `}
                  style={{
                    backgroundColor:
                      selectedRound === round ? getRoundGradientColor(round) : '#111128',
                    border: selectedRound === round ? 'none' : '1px solid #2d2b6b',
                  }}
                >
                  {round === 10 ? '9+' : `R${String(round)}`}
                </button>
              ))}
            </div>
            {currentRound !== undefined && (
              <div className="text-xs text-ghost-neon">Current Round: {currentRound}</div>
            )}
          </div>
        )}

        {/* Prediction distribution visualization */}
        <div className="space-y-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Prediction Distribution</div>
          {distributionData.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-gray-500">No predictions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {distributionData.map(({ round, amount, percentage }) => (
              <div key={round} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-300">Round {round === 0 ? '9+' : String(round)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{formatMon(amount)} MON</span>
                    <span className="text-gray-500">{percentage.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-2 bg-arena-bg rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${String(percentage)}%`,
                      background: `linear-gradient(90deg, ${getRoundGradientColor(round)}, ${getRoundGradientColor(round + 1)})`,
                    }}
                  />
                </div>
              </div>
              ))}
            </div>
          )}
          <div className="p-3 rounded-lg mt-2" style={{ backgroundColor: '#111128' }}>
            <div className="text-xs text-gray-400">Total Betting Pool</div>
            <div className="text-lg font-bold text-white">{formatMon(totalPool)} MON</div>
          </div>
        </div>

        {/* Betting input form */}
        {!isConnected ? (
          <div className="p-4 rounded-lg text-center" style={{ backgroundColor: '#111128' }}>
            <p className="text-sm text-gray-400">Connect your wallet to place bets</p>
          </div>
        ) : myPrediction && myPrediction.amount > 0n ? (
          // My prediction display
          <div className="space-y-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider">My Prediction</div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#111128' }}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-400">Predicted Round</span>
                <span className="text-lg font-bold text-ghost-neon">
                  Round {myPrediction.predictedRound === 0 ? '9+' : myPrediction.predictedRound}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-400">Bet Amount</span>
                <span className="text-lg font-bold text-white">
                  {formatMon(myPrediction.amount)} MON
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Status</span>
                <span className="text-sm text-ghost-blue">
                  {storeStatus === 'betting'
                    ? 'Pending'
                    : storeStatus === 'active'
                      ? 'Game In Progress'
                      : 'Settled'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          storeStatus === 'betting' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Bet Amount (MON)
                </label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => { setBetAmount(e.target.value); }}
                  placeholder="0.01"
                  step="0.01"
                  min="0.01"
                  max="10"
                  className="w-full px-4 py-3 rounded-lg bg-arena-bg border border-arena-border text-white focus:outline-none focus:border-ghost-violet transition-colors"
                />
                {balance !== undefined && (
                  <div className="text-xs text-gray-400 mt-1">Balance: {formatMon(balance)} MON</div>
                )}
              </div>

              {selectedRound !== null && betAmount !== '' && parseFloat(betAmount) > 0 && (
                <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: '#111128' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Estimated Odds</span>
                    <span className="text-sm font-bold text-ghost-neon">
                      {calculateOdds(selectedRound).toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Estimated Payout</span>
                    <span className="text-sm font-bold text-ghost-pink">
                      {formatMon(estimatedPayout)} MON
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => { handlePlaceBet(); }}
                disabled={betAmount === '' || selectedRound === null || isPending || isConfirming}
                className="w-full px-6 py-4 rounded-lg font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    betAmount !== '' && selectedRound !== null && !isPending && !isConfirming
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'
                      : '#2d2b6b',
                  boxShadow:
                    betAmount !== '' && selectedRound !== null && !isPending && !isConfirming
                      ? '0 0 20px rgba(139, 92, 246, 0.5)'
                      : 'none',
                }}
              >
                {isPending
                  ? 'Awaiting Signature...'
                  : isConfirming
                    ? 'Confirming Transaction...'
                    : 'Place Prediction Bet'}
              </button>

              {error && (
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30">
                  <p className="text-xs text-red-400">{error.message}</p>
                </div>
              )}
            </div>
          )
        )}

        {/* Settlement results and payout claim */}
        {storeStatus === 'settled' && sessionInfo && myPrediction && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider">Settlement Results</div>
            <div className="p-4 rounded-lg space-y-3" style={{ backgroundColor: '#111128' }}>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Actual Elimination Round</span>
                <span className="text-lg font-bold text-ghost-neon">
                  Round {sessionInfo.eliminationRound}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">My Prediction</span>
                <span className="text-lg font-bold text-white">
                  Round {myPrediction.predictedRound === 0 ? '9+' : myPrediction.predictedRound}
                </span>
              </div>
              {myPrediction.predictedRound === sessionInfo.eliminationRound ? (
                <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/30">
                  <p className="text-sm text-green-400 font-semibold">Exact match!</p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                  <p className="text-sm text-yellow-400">
                    Difference: {Math.abs(myPrediction.predictedRound - sessionInfo.eliminationRound)}{' '}
                    round(s)
                  </p>
                </div>
              )}

              {myPayout !== null && myPayout > 0n && !myPrediction.claimed && (
                <>
                  <div className="flex justify-between items-center pt-2 border-t border-arena-border">
                    <span className="text-sm text-gray-400">Reward</span>
                    <span className="text-xl font-bold text-ghost-pink">
                      {formatMon(myPayout)} MON
                    </span>
                  </div>
                  <button
                    onClick={() => { handleClaimPayout(); }}
                    disabled={isClaimingPayout || isPending || isConfirming}
                    className="w-full px-6 py-3 rounded-lg font-bold text-white transition-all disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
                      boxShadow: '0 0 20px rgba(236, 72, 153, 0.5)',
                    }}
                  >
                    {isClaimingPayout || isPending || isConfirming ? 'Processing...' : 'Claim Winnings'}
                  </button>
                </>
              )}

              {myPrediction.claimed && (
                <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
                  <p className="text-sm text-gray-400 text-center">Winnings already claimed</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Betting rules */}
        <div
          className="p-4 rounded-lg text-xs text-gray-400 space-y-2"
          style={{ backgroundColor: '#111128' }}
        >
          <div className="font-semibold text-gray-300 mb-2">Betting Rules</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>Predict the round in which the player will be eliminated</li>
            <li>Correct predictions earn a payout</li>
            <li>Minimum bet: 0.01 MON</li>
            <li>Only one prediction per session</li>
            <li>Odds are calculated using the pari-mutuel method</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
