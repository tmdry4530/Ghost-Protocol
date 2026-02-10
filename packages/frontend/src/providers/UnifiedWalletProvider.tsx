/**
 * 통합 지갑 프로바이더
 *
 * wagmi (MetaMask/Rabby 등)와 Circle (소셜 로그인) 두 경로를 통합
 *
 * 우선순위:
 * 1. wagmi 연결이 있으면 wagmi 사용 (기존 지갑 유저)
 * 2. Circle 연결만 있으면 Circle 사용 (소셜 로그인 유저)
 * 3. 둘 다 없으면 미연결 상태
 */

import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import { useAccount as useWagmiAccount, useDisconnect as useWagmiDisconnect } from 'wagmi';
import { useCircleWallet } from '../hooks/useCircleWallet.js';
import type { WalletSource } from '@ghost-protocol/shared';

/** 통합 지갑 상태 */
interface UnifiedWalletState {
  /** 연결된 지갑 주소 */
  readonly address: string | null;
  /** 지갑 연결 여부 */
  readonly isConnected: boolean;
  /** 지갑 소스 (wagmi 또는 circle) */
  readonly source: WalletSource | null;
  /** 잔액 (문자열 형태, wei 단위) */
  readonly balance: string | null;
  /** wagmi 지갑 연결 (MetaMask 등) */
  connectWagmi: () => void;
  /** Circle 소셜 로그인 */
  connectCircle: () => Promise<void>;
  /** 연결 해제 */
  disconnect: () => void;
}

const UnifiedWalletContext = createContext<UnifiedWalletState>({
  address: null,
  isConnected: false,
  source: null,
  balance: null,
  connectWagmi: () => {
    throw new Error('UnifiedWalletProvider가 필요합니다');
  },
  connectCircle: async () => {
    throw new Error('UnifiedWalletProvider가 필요합니다');
  },
  disconnect: () => {
    throw new Error('UnifiedWalletProvider가 필요합니다');
  },
});

/** UnifiedWalletProvider Props */
interface UnifiedWalletProviderProps {
  readonly children: ReactNode;
}

/**
 * 통합 지갑 프로바이더
 *
 * 앱 최상위에서 wagmi와 Circle 두 지갑 경로를 통합하여 제공
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <WagmiProvider config={wagmiConfig}>
 *       <QueryClientProvider client={queryClient}>
 *         <UnifiedWalletProvider>
 *           <Router />
 *         </UnifiedWalletProvider>
 *       </QueryClientProvider>
 *     </WagmiProvider>
 *   );
 * }
 * ```
 */
export function UnifiedWalletProvider({ children }: UnifiedWalletProviderProps): React.ReactNode {
  const wagmi = useWagmiAccount();
  const { disconnect: wagmiDisconnect } = useWagmiDisconnect();
  const circle = useCircleWallet();

  /**
   * wagmi 지갑 연결
   *
   * 실제 연결은 wagmi의 useConnect 훅을 사용하는 별도 컴포넌트에서 수행
   * 이 함수는 placeholder — ConnectButton 컴포넌트에서 실제 구현
   */
  const connectWagmi = useCallback((): void => {
    // wagmi 연결은 ConnectButton 컴포넌트에서 처리
    console.warn('connectWagmi는 ConnectButton 컴포넌트를 사용하세요');
  }, []);

  /**
   * Circle 소셜 로그인
   */
  const connectCircle = useCallback(async (): Promise<void> => {
    await circle.connect();
  }, [circle]);

  /**
   * 연결 해제
   */
  const disconnect = useCallback((): void => {
    if (wagmi.isConnected) {
      wagmiDisconnect();
    }
    if (circle.address) {
      circle.disconnect();
    }
  }, [wagmi.isConnected, circle, wagmiDisconnect]);

  /**
   * 통합 지갑 상태 계산
   *
   * wagmi 연결이 우선
   */
  const value = useMemo<UnifiedWalletState>(() => {
    // wagmi 연결이 우선 (기존 지갑 유저)
    if (wagmi.isConnected && wagmi.address) {
      return {
        address: wagmi.address,
        isConnected: true,
        source: 'wagmi',
        balance: null, // wagmi의 useBalance 훅으로 별도 조회 필요
        connectWagmi,
        connectCircle,
        disconnect,
      };
    }

    // Circle 지갑 연결
    if (circle.status === 'ready' && circle.address) {
      return {
        address: circle.address,
        isConnected: true,
        source: 'circle',
        balance: null, // Circle API를 통해 별도 조회 필요
        connectWagmi,
        connectCircle,
        disconnect,
      };
    }

    // 미연결 상태
    return {
      address: null,
      isConnected: false,
      source: null,
      balance: null,
      connectWagmi,
      connectCircle,
      disconnect,
    };
  }, [
    wagmi.isConnected,
    wagmi.address,
    circle.status,
    circle.address,
    connectWagmi,
    connectCircle,
    disconnect,
  ]);

  return (
    <UnifiedWalletContext.Provider value={value}>
      {children}
    </UnifiedWalletContext.Provider>
  );
}

/**
 * 통합 지갑 훅
 *
 * @returns 통합 지갑 상태 및 제어 함수
 *
 * @example
 * ```tsx
 * function WalletDisplay() {
 *   const { address, isConnected, source, connectWagmi, connectCircle, disconnect } = useUnifiedWallet();
 *
 *   if (isConnected && address) {
 *     return (
 *       <div>
 *         <p>연결됨: {address.slice(0, 6)}...{address.slice(-4)} ({source})</p>
 *         <button onClick={disconnect}>연결 해제</button>
 *       </div>
 *     );
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={connectWagmi}>MetaMask 연결</button>
 *       <button onClick={connectCircle}>Google로 로그인</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUnifiedWallet(): UnifiedWalletState {
  const context = useContext(UnifiedWalletContext);

  if (!context) {
    throw new Error('useUnifiedWallet은 UnifiedWalletProvider 내부에서 사용해야 합니다');
  }

  return context;
}
