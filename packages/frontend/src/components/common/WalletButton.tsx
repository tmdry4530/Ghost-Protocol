import { useState, useRef, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

/** Wallet connection button component */
export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  const handleConnect = () => {
    connect({ connector: injected() });
  };

  const handleDisconnect = () => {
    disconnect();
    setShowConfirm(false);
  };

  // Close confirm dialog on outside click
  useEffect(() => {
    if (!showConfirm) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setShowConfirm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showConfirm]);

  if (isConnected && address) {
    return (
      <div className="relative" ref={confirmRef}>
        <button
          onClick={() => {
            setShowConfirm(!showConfirm);
          }}
          className="flex items-center gap-1.5 rounded-md bg-arena-card px-2.5 py-1 text-[11px] font-medium text-white transition-all hover:bg-arena-surface hover:neon-glow"
        >
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
          <span>{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
        </button>
        {showConfirm && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-ghost-violet/20 bg-arena-surface p-3 shadow-lg shadow-black/50">
            <p className="mb-3 text-xs text-gray-400">Disconnect wallet?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDisconnect}
                className="flex-1 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30"
              >
                Disconnect
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                }}
                className="flex-1 rounded-md bg-arena-card px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="rounded-md bg-ghost-violet px-2.5 py-1 text-[11px] font-medium text-white transition-all hover:bg-ghost-violet-dark hover:neon-glow"
    >
      Connect Wallet
    </button>
  );
}
