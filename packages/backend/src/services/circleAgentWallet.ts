/**
 * Circle Developer-Controlled Wallet 서비스
 *
 * 에이전트가 자체 지갑을 제공하지 않았을 때 서버가 Circle dev-controlled 지갑을 할당
 *
 * 참조: https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
 */

/**
 * Circle API 베이스 URL
 */
const CIRCLE_BASE = process.env.CIRCLE_API_BASE ?? 'https://api.circle.com';

/**
 * Circle API 키 (서버 전용)
 */
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;

/**
 * Circle Wallet Set ID (Circle Console에서 생성)
 */
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;

/**
 * Monad Agent Faucet URL
 */
const AGENT_FAUCET_URL = 'https://agents.devnads.com/v1/faucet';

/**
 * Developer-Controlled 지갑 정보
 */
interface DevWallet {
  id: string;
  address: string;
  blockchain: string;
  state: string;
}

/**
 * Circle API 사용 가능 여부 확인
 */
function isCircleAvailable(): boolean {
  return Boolean(CIRCLE_API_KEY && CIRCLE_WALLET_SET_ID);
}

/**
 * 에이전트에게 Developer-Controlled 지갑을 생성한다.
 *
 * @param agentName - 에이전트 식별자
 * @returns 생성된 지갑 정보 (walletId, address)
 */
export async function createAgentWallet(
  agentName: string,
): Promise<{ walletId: string; address: string } | null> {
  if (!isCircleAvailable()) {
    // CIRCLE_API_KEY 없으면 기능 비활성화 (에러 대신 null 반환)
    return null;
  }

  try {
    // 1. 지갑 생성 요청
    const response = await fetch(`${CIRCLE_BASE}/v1/w3s/developer/wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({
        idempotencyKey: `ghost-protocol-agent-${agentName}-${Date.now()}`,
        walletSetId: CIRCLE_WALLET_SET_ID,
        blockchains: ['MONAD-TESTNET'],
        count: 1,
        metadata: [{ name: 'agentName', value: agentName }],
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      console.error(`Circle 에이전트 지갑 생성 실패: ${errorData.error ?? response.statusText}`);
      return null;
    }

    const data = (await response.json()) as {
      data?: { wallets: DevWallet[] };
    };

    const wallet = data.data?.wallets[0];
    if (!wallet) {
      console.error('Circle 응답에 지갑 정보 없음');
      return null;
    }

    // 2. Agent Faucet으로 초기 MON 지급
    try {
      await fundAgentWallet(wallet.address);
    } catch (faucetError) {
      // Faucet 실패는 치명적이지 않음 (지갑은 생성됨)
      console.warn(`Faucet 지급 실패 (${wallet.address}):`, faucetError);
    }

    return {
      walletId: wallet.id,
      address: wallet.address,
    };
  } catch (error) {
    const err = error as Error;
    console.error(`Circle 지갑 생성 중 오류: ${err.message}`);
    return null;
  }
}

/**
 * 에이전트 지갑 잔액 조회
 *
 * @param walletId - Circle 지갑 ID
 * @returns MON 잔액 (문자열) 또는 null
 */
export async function getAgentWalletBalance(walletId: string): Promise<string | null> {
  if (!isCircleAvailable()) {
    return null;
  }

  try {
    const response = await fetch(`${CIRCLE_BASE}/v1/w3s/wallets/${walletId}/balances`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      data?: {
        tokenBalances: Array<{
          token?: { symbol?: string };
          amount?: string;
        }>;
      };
    };

    const monBalance = data.data?.tokenBalances?.find((t) => t.token?.symbol === 'MON');
    return monBalance?.amount ?? '0';
  } catch (error) {
    const err = error as Error;
    console.error(`잔액 조회 실패: ${err.message}`);
    return null;
  }
}

/**
 * Monad Agent Faucet으로 초기 MON 지급
 *
 * @param address - 지갑 주소
 */
async function fundAgentWallet(address: string): Promise<void> {
  const response = await fetch(AGENT_FAUCET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      amount: '1000000000000000000', // 1 MON (18 decimals)
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent Faucet 실패: ${response.statusText}`);
  }
}
