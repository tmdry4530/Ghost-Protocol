/**
 * Agent Faucet API 연동
 *
 * Monad AGENTS.md에 명시된 에이전트 전용 테스트넷 faucet을 호출한다.
 * 에이전트 참가 등록 시 지갑 잔액이 부족하면 자동으로 MON을 지급한다.
 *
 * 참조:
 * - Monad AGENTS.md: https://gist.githubusercontent.com/portdeveloper/c899ea34ccfd00e6375ab3edea259ecd/raw/AGENTS.md
 *
 * @notice 이 API는 AI 에이전트 전용입니다. curl로 직접 호출하고 브라우저 사용은 금지됩니다.
 */

import { ethers } from 'ethers';
import { loadEnv } from '../config.js';
import pino from 'pino';

const logger = pino({ name: 'agent-faucet' });

/**
 * Agent Faucet API URL
 * Monad 테스트넷 에이전트 전용 faucet
 */
const AGENT_FAUCET_URL = 'https://agents.devnads.com/v1/faucet';

/**
 * Monad finality 대기 시간 (밀리초)
 * 2블록 finality = 800ms (블록타임 400ms)
 */
const MONAD_FINALITY_MS = 1500;

/**
 * Faucet API 응답 스키마
 */
interface FaucetResponse {
  txHash: string;
  amount: string; // wei 단위 (예: "1000000000000000000" = 1 MON)
  chain: string;
}

/**
 * Agent Faucet 에러
 */
export class AgentFaucetError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AgentFaucetError';
  }
}

/**
 * 에이전트 지갑에 테스트넷 MON을 지급한다.
 * 등록 흐름에서 잔액 부족 시 자동 호출된다.
 *
 * @param address - 에이전트 지갑 주소 (0x...)
 * @returns 트랜잭션 해시, 지급 금액
 * @throws AgentFaucetError - Faucet API 호출 실패 시
 */
export async function fundAgentWallet(address: string): Promise<FaucetResponse> {
  logger.info({ address }, 'Agent Faucet call started');

  try {
    const response = await fetch(AGENT_FAUCET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: 10143, // Monad Testnet
        address,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      const errorMessage =
        errorData.error ?? `HTTP ${response.status.toString()}: ${response.statusText}`;

      logger.error(
        { address, statusCode: response.status, error: errorMessage },
        'Agent Faucet call failed',
      );

      throw new AgentFaucetError(
        `Agent Faucet failed: ${errorMessage}. ` +
          `Use manual faucet: https://faucet.monad.xyz`,
      );
    }

    const data = (await response.json()) as FaucetResponse;

    logger.info(
      {
        address,
        txHash: data.txHash,
        amount: data.amount,
        amountMON: ethers.formatEther(data.amount),
      },
      'Agent Faucet successful',
    );

    return data;
  } catch (error) {
    if (error instanceof AgentFaucetError) {
      throw error;
    }

    // Network error etc
    logger.error({ error, address }, 'Agent Faucet network error');
    throw new AgentFaucetError(
      `Agent Faucet network error. Use manual faucet: https://faucet.monad.xyz`,
      error,
    );
  }
}

/**
 * 에이전트 등록 흐름에서 지갑 잔액을 확인하고 부족하면 자동 펀딩한다.
 *
 * 동작:
 * 1. RPC로 잔액 조회
 * 2. minimumBalance보다 적으면 fundAgentWallet() 호출
 * 3. Monad finality 대기 (1500ms)
 * 4. 최종 잔액 확인
 *
 * @param address - 에이전트 지갑 주소
 * @param provider - ethers Provider 인스턴스
 * @param minimumBalance - 최소 필요 잔액 (MON 단위, 기본값 0.1)
 * @throws AgentFaucetError - 펀딩 실패 또는 펀딩 후에도 잔액 부족 시
 */
export async function ensureAgentFunded(
  address: string,
  provider: ethers.Provider,
  minimumBalance: number = 0.1,
): Promise<void> {
  const minimumWei = ethers.parseEther(minimumBalance.toString());

  // 1. 현재 잔액 조회
  const balance = await provider.getBalance(address);
  const balanceMON = ethers.formatEther(balance);

  logger.debug(
    { address, balance: balanceMON, minimumBalance },
    'Agent wallet balance check',
  );

  if (balance >= minimumWei) {
    logger.info({ address, balance: balanceMON }, 'Balance sufficient — funding skipped');
    return;
  }

  // 2. Insufficient balance — call faucet
  logger.warn(
    { address, balance: balanceMON, minimumBalance },
    'Insufficient balance — calling Agent Faucet',
  );

  const faucetResult = await fundAgentWallet(address);

  // 3. Wait for Monad finality (2 blocks = 800ms, safely 1500ms)
  logger.debug(
    { txHash: faucetResult.txHash, waitMs: MONAD_FINALITY_MS },
    'Waiting for Monad finality',
  );
  await new Promise((resolve) => setTimeout(resolve, MONAD_FINALITY_MS));

  // 4. Final balance check
  const newBalance = await provider.getBalance(address);
  const newBalanceMON = ethers.formatEther(newBalance);

  if (newBalance < minimumWei) {
    logger.error(
      {
        address,
        newBalance: newBalanceMON,
        minimumBalance,
        txHash: faucetResult.txHash,
      },
      'Balance insufficient even after funding',
    );
    throw new AgentFaucetError(
      `Balance still insufficient after funding (current: ${newBalanceMON} MON, required: ${minimumBalance.toString()} MON). ` +
        `Transaction: ${faucetResult.txHash}. ` +
        `Use manual faucet: https://faucet.monad.xyz`,
    );
  }

  logger.info(
    {
      address,
      oldBalance: balanceMON,
      newBalance: newBalanceMON,
      txHash: faucetResult.txHash,
    },
    'Agent Faucet funding completed',
  );
}

/**
 * Provider 인스턴스 생성 헬퍼
 * ensureAgentFunded()에서 사용
 */
export function createMonadProvider(): ethers.JsonRpcProvider {
  const env = loadEnv();
  const rpcUrl = env.MONAD_RPC_URL ?? 'https://testnet.monad.xyz/v1';
  return new ethers.JsonRpcProvider(rpcUrl);
}
