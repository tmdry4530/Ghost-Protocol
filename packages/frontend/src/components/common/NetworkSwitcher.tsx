import { useState, useRef, useEffect } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { monadTestnet, monadMainnet } from '../../lib/wagmiConfig.js';

/** 네트워크 체인 정보 */
interface NetworkChainInfo {
  chain: typeof monadTestnet | typeof monadMainnet;
  label: string;
  dotColor: string;
}

const chains: NetworkChainInfo[] = [
  { chain: monadTestnet, label: 'Testnet', dotColor: 'bg-green-400' },
  { chain: monadMainnet, label: 'Mainnet', dotColor: 'bg-ghost-violet' },
];

/**
 * 네트워크 전환 버튼 컴포넌트
 * Monad 테스트넷과 메인넷 간 전환 기능 제공
 */
export function NetworkSwitcher(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  /** 현재 선택된 네트워크 정보 (기본값: 테스트넷) */
  const currentNetwork = chains.find((n) => n.chain.id === chainId) ?? chains[0];

  /** 드롭다운 외부 클릭 감지하여 닫기 */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  /** 네트워크 전환 핸들러 */
  const handleSwitchNetwork = (targetChainId: number): void => {
    switchChain({ chainId: targetChainId });
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 현재 네트워크 표시 버튼 */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 rounded-full border border-ghost-violet/20 bg-arena-surface/60 px-3 py-1.5 text-xs transition-all hover:border-ghost-violet/40 hover:bg-arena-surface/80"
      >
        <span className={`h-2 w-2 rounded-full ${currentNetwork?.dotColor ?? 'bg-green-400'}`}></span>
        <span className="font-medium text-gray-300">{currentNetwork?.label ?? 'Testnet'}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* 네트워크 선택 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[140px] rounded-lg border border-ghost-violet/20 bg-arena-surface p-2 shadow-lg">
          {chains.map((network) => (
            <button
              key={network.chain.id}
              onClick={() => {
                handleSwitchNetwork(network.chain.id);
              }}
              className={`flex w-full items-center gap-2 rounded px-3 py-2 text-xs transition-all ${
                network.chain.id === chainId
                  ? 'bg-ghost-violet/20 text-ghost-violet'
                  : 'text-gray-400 hover:bg-ghost-violet/10 hover:text-gray-300'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${network.dotColor}`}></span>
              <span className="font-medium">{network.label}</span>
              {network.chain.id === chainId && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto">
                  <path
                    d="M2 6L5 9L10 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
