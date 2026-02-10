import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './lib/wagmiConfig.js';
import { UnifiedWalletProvider } from './providers/UnifiedWalletProvider.js';
import { App } from './App.js';
import './index.css';

/** React Query 클라이언트 인스턴스 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 2,
    },
  },
});

/** 애플리케이션 루트 요소 */
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('루트 요소를 찾을 수 없습니다');
}

createRoot(rootElement).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <UnifiedWalletProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UnifiedWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
