/**
 * Circle Web SDK 소셜 로그인 훅
 *
 * Google OAuth를 통한 Circle Programmable Wallets 연동
 * SDK 없이도 동작하는 fallback 구현 포함
 *
 * 흐름:
 * 1. SDK 초기화 (동적 import)
 * 2. connect() → 백엔드에서 deviceToken 발급
 * 3. Google OAuth 리다이렉트
 * 4. 콜백에서 userToken + encryptionKey 수신
 * 5. 백엔드에서 challengeId 발급
 * 6. Circle SDK로 지갑 생성
 * 7. 지갑 목록 조회 → 첫 번째 지갑 사용
 */

import { useEffect, useState, useCallback } from 'react';

const API_BASE = (import.meta.env['VITE_API_URL'] as string) || 'http://localhost:3001/api/v1';
const CIRCLE_APP_ID = import.meta.env['VITE_CIRCLE_APP_ID'] as string | undefined;

/** Circle SDK 상태 */
type CircleWalletStatus = 'idle' | 'authenticating' | 'initializing' | 'ready' | 'error';

/** Circle 지갑 정보 */
interface CircleWallet {
  readonly id: string;
  readonly address: string;
  readonly blockchain: string;
}

/** useCircleWallet 반환 타입 */
interface UseCircleWalletReturn {
  /** 현재 상태 */
  readonly status: CircleWalletStatus;
  /** 연결된 지갑 주소 */
  readonly address: string | null;
  /** Circle 지갑 ID */
  readonly walletId: string | null;
  /** Google OAuth 로그인 시작 */
  connect: () => Promise<void>;
  /** 연결 해제 */
  disconnect: () => void;
  /** 에러 메시지 */
  readonly error: string | null;
}

/**
 * Circle Web SDK 소셜 로그인 훅
 *
 * Circle SDK가 설치되지 않은 경우 fallback으로 백엔드 API만 사용
 * localStorage에 세션 정보 저장 (재연결 지원)
 *
 * @returns Circle 지갑 상태 및 제어 함수
 *
 * @example
 * ```tsx
 * function LoginButton() {
 *   const { status, address, connect, disconnect, error } = useCircleWallet();
 *
 *   if (status === 'ready' && address) {
 *     return <button onClick={disconnect}>연결 해제 ({address.slice(0, 6)}...)</button>;
 *   }
 *
 *   return (
 *     <button onClick={connect} disabled={status === 'authenticating'}>
 *       {status === 'authenticating' ? '로그인 중...' : 'Google로 로그인'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useCircleWallet(): UseCircleWalletReturn {
  // Circle SDK는 현재 설치되지 않았으므로 fallback 구현만 제공
  // TODO: npm install @circle-fin/w3s-pw-web-sdk 후 SDK 통합

  const [status, setStatus] = useState<CircleWalletStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);

  // localStorage에서 세션 복원
  useEffect(() => {
    const savedAddress = localStorage.getItem('gp_circle_address');
    const savedWalletId = localStorage.getItem('gp_circle_walletId');
    const savedUserId = localStorage.getItem('gp_circle_userId');

    if (savedAddress && savedWalletId && savedUserId) {
      setAddress(savedAddress);
      setWalletId(savedWalletId);
      setStatus('ready');
    } else {
      setStatus('idle');
    }
  }, []);

  /**
   * Google OAuth 로그인 시작
   *
   * Fallback 구현: 백엔드 API를 통해 간소화된 지갑 생성
   * 실제 Circle SDK는 설치 후 활성화
   */
  const connect = useCallback(async (): Promise<void> => {
    try {
      if (!CIRCLE_APP_ID) {
        setError('Circle App ID가 설정되지 않았습니다. VITE_CIRCLE_APP_ID 환경변수를 확인하세요.');
        setStatus('error');
        return;
      }

      setStatus('authenticating');
      setError(null);

      // Fallback: 백엔드 API를 통한 간소화된 지갑 생성 시뮬레이션
      // 실제 구현에서는 Circle SDK의 OAuth 플로우를 사용해야 함

      // 1. 디바이스 ID 생성 (브라우저 fingerprint)
      const deviceId = generateDeviceId();

      // 2. 백엔드에서 deviceToken 발급
      const deviceTokenRes = await fetch(`${API_BASE}/wallet/device-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });

      if (!deviceTokenRes.ok) {
        throw new Error('디바이스 토큰 발급 실패');
      }

      // deviceToken과 deviceEncryptionKey는 추후 실제 SDK 통합 시 사용
      await deviceTokenRes.json();

      // 3. Google OAuth 플로우 (현재는 시뮬레이션)
      // 실제로는 Circle SDK의 performLogin()을 호출하여 리다이렉트
      // 여기서는 fallback으로 임시 userToken 생성
      const mockUserToken = `mock_user_token_${Date.now()}`;

      setStatus('initializing');

      // 4. 백엔드에서 유저 초기화
      const initRes = await fetch(`${API_BASE}/wallet/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: mockUserToken }),
      });

      if (!initRes.ok) {
        const initData = await initRes.json() as { code?: number };
        // code 155106 = 이미 초기화된 유저 → 기존 지갑 로드
        if (initData.code !== 155106) {
          throw new Error('유저 초기화 실패');
        }
      }

      // 5. 지갑 목록 조회
      const listRes = await fetch(`${API_BASE}/wallet/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: mockUserToken }),
      });

      if (!listRes.ok) {
        throw new Error('지갑 목록 조회 실패');
      }

      const listData = await listRes.json() as { wallets?: CircleWallet[] };

      if (listData.wallets && listData.wallets.length > 0) {
        const wallet = listData.wallets[0];
        if (!wallet) {
          throw new Error('지갑 데이터가 유효하지 않습니다');
        }
        setAddress(wallet.address);
        setWalletId(wallet.id);
        setStatus('ready');

        // localStorage에 세션 저장
        localStorage.setItem('gp_circle_address', wallet.address);
        localStorage.setItem('gp_circle_walletId', wallet.id);
        localStorage.setItem('gp_circle_userId', mockUserToken);
      } else {
        throw new Error('지갑을 찾을 수 없습니다');
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '알 수 없는 오류';
      setError(errorMsg);
      setStatus('error');
      console.error('[useCircleWallet] 연결 실패:', e);
    }
  }, []);

  /**
   * 연결 해제
   */
  const disconnect = useCallback((): void => {
    setAddress(null);
    setWalletId(null);
    setStatus('idle');
    setError(null);

    // localStorage 세션 제거
    localStorage.removeItem('gp_circle_address');
    localStorage.removeItem('gp_circle_walletId');
    localStorage.removeItem('gp_circle_userId');
    localStorage.removeItem('gp_circle_userToken');
  }, []);

  return {
    status,
    address,
    walletId,
    connect,
    disconnect,
    error,
  };
}

/**
 * 브라우저 fingerprint 기반 디바이스 ID 생성
 */
function generateDeviceId(): string {
  const nav = navigator;
  const screen = window.screen;

  const fingerprint = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join('|');

  return btoa(fingerprint).slice(0, 32);
}

