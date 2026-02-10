/**
 * 외부 에이전트 참가 등록 라우트
 *
 * Moltbook 인증 → 역할 할당 → 지갑 펀딩 → WebSocket 세션 발급
 *
 * 흐름:
 * 1. Moltbook Identity Token 검증 (미들웨어)
 * 2. 역할(팩맨/고스트) 검증
 * 3. 에이전트 코드 검증 (커스텀 코드 제출 시 — 향후 구현)
 * 4. 지갑 주소 할당 및 펀딩
 * 5. WebSocket 세션 토큰 발급
 * 6. 등록 정보 반환
 */

import { Router, type Router as ExpressRouter } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import pino from 'pino';
import { ethers } from 'ethers';
import { moltbookAuthMiddleware } from '../middleware/moltbookAuth.js';
import {
  ensureAgentFunded,
  createMonadProvider,
  AgentFaucetError,
} from '../services/agentFaucet.js';
import type { MoltbookVerifiedProfile } from '../services/moltbookAuth.js';
import { loadEnv } from '../config.js';

const logger = pino({ name: 'agent-registration' });
const router: ExpressRouter = Router();

/**
 * GhostArena.registerExternalAgent() 함수의 최소 ABI
 * AgentRole enum: 0 = PACMAN, 1 = GHOST
 */
const GHOST_ARENA_REGISTER_ABI = [
  'function registerExternalAgent(address _agent, string calldata _name, string calldata _moltbookId, uint256 _karma, uint8 _role) external',
] as const;

/**
 * 에이전트 역할 타입
 */
type AgentRole = 'pacman' | 'ghost';

/**
 * 등록 요청 바디 스키마
 */
const registerRequestSchema = z.object({
  role: z.enum(['pacman', 'ghost'], {
    errorMap: () => ({ message: "role must be 'pacman' or 'ghost'" }),
  }),
  agentCode: z.string().optional(),
  builtInAgent: z.string().optional(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  tournamentId: z.string().optional(),
});

/**
 * 등록된 에이전트 정보 (인메모리 저장소)
 * 실제 구현에서는 Redis/DB 사용 권장
 */
interface RegisteredAgent {
  agentId: string;
  moltbookId: string;
  sessionToken: string;
  walletAddress: string;
  role: AgentRole;
  moltbookProfile: {
    name: string;
    karma: number;
    avatar: string | null;
    ownerHandle: string;
  };
  registeredAt: number;
  active: boolean;
}

/**
 * 인메모리 에이전트 레지스트리
 * Key: moltbookId
 */
const agentRegistry = new Map<string, RegisteredAgent>();

/**
 * 온체인 registerExternalAgent 호출
 * 컨트랙트 주소 또는 개인키가 없으면 건너뜀 (graceful degradation)
 */
async function callRegisterOnChain(
  agentAddress: string,
  name: string,
  moltbookId: string,
  karma: number,
  role: AgentRole,
): Promise<string | null> {
  const env = loadEnv();

  if (!env.GHOST_ARENA_ADDRESS || !env.ARENA_MANAGER_PRIVATE_KEY) {
    logger.warn('Onchain registration skipped: GHOST_ARENA_ADDRESS or ARENA_MANAGER_PRIVATE_KEY not set');
    return null;
  }

  try {
    const provider = new ethers.JsonRpcProvider(env.MONAD_RPC_URL);
    const signer = new ethers.Wallet(env.ARENA_MANAGER_PRIVATE_KEY, provider);
    const arena = new ethers.Contract(
      env.GHOST_ARENA_ADDRESS,
      GHOST_ARENA_REGISTER_ABI,
      signer,
    ) as ethers.Contract & {
      registerExternalAgent: (
        agent: string,
        name: string,
        moltbookId: string,
        karma: number,
        role: number,
      ) => Promise<ethers.ContractTransactionResponse>;
    };

    // AgentRole enum: 0 = PACMAN, 1 = GHOST
    const roleEnum = role === 'pacman' ? 0 : 1;

    const tx = await arena.registerExternalAgent(
      agentAddress,
      name,
      moltbookId,
      karma,
      roleEnum,
    );

    const receipt = await tx.wait();
    const txHash = receipt?.hash ?? null;
    logger.info(
      { txHash, agentAddress, moltbookId },
      'Onchain agent registration completed',
    );

    return txHash;
  } catch (error) {
    // Keep offchain registration even if onchain registration fails
    logger.error(
      { error: error instanceof Error ? error.message : String(error), agentAddress, moltbookId },
      'Onchain agent registration failed (offchain registration maintained)',
    );
    return null;
  }
}

/**
 * POST /api/v1/arena/register
 *
 * 외부 에이전트가 토너먼트에 참가 등록한다.
 * Moltbook identity token으로 인증하며,
 * 역할(팩맨/고스트)을 선택하고 에이전트 코드를 제출한다.
 *
 * 헤더: X-Moltbook-Identity: <identity_token>
 * 본문: {
 *   role: 'pacman' | 'ghost',
 *   agentCode?: string,          // isolated-vm에서 실행할 커스텀 코드 (선택)
 *   builtInAgent?: string,       // 내장 에이전트 이름 사용 시 (선택)
 *   walletAddress?: string,      // 자체 지갑 주소 (없으면 서버 생성 — 향후 Circle 통합)
 *   tournamentId?: string,       // 특정 토너먼트 참가 (없으면 다음 토너먼트 대기열)
 * }
 *
 * 응답: {
 *   success: true,
 *   data: {
 *     agentId: string,
 *     sessionToken: string,
 *     walletAddress: string,
 *     moltbookProfile: { ... },
 *     role: string,
 *     authDocsUrl: string,
 *   }
 * }
 */
router.post(
  '/arena/register',
  moltbookAuthMiddleware,
  async (req, res): Promise<void> => {
    const agent = req.moltbookAgent as MoltbookVerifiedProfile;

    // 1. Validate request body
    const parseResult = registerRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      logger.warn({ errors, moltbookId: agent.id }, 'Registration request body validation failed');
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: errors,
      });
      return;
    }

    const { role, agentCode, builtInAgent, walletAddress, tournamentId } =
      parseResult.data;

    logger.info(
      {
        moltbookId: agent.id,
        name: agent.name,
        karma: agent.karma,
        role,
        hasCustomCode: Boolean(agentCode),
        hasBuiltIn: Boolean(builtInAgent),
        hasWallet: Boolean(walletAddress),
      },
      'Agent registration started',
    );

    // 2. Check duplicate registration
    const existingAgent = agentRegistry.get(agent.id);
    if (existingAgent?.active) {
      logger.warn(
        {
          moltbookId: agent.id,
          existingAgentId: existingAgent.agentId,
          existingRole: existingAgent.role,
        },
        'Duplicate registration attempt for already registered agent',
      );
      res.status(409).json({
        success: false,
        error: 'Agent already registered',
        existingRegistration: {
          agentId: existingAgent.agentId,
          role: existingAgent.role,
          registeredAt: existingAgent.registeredAt,
        },
      });
      return;
    }

    // 3. Validate agent code (future implementation)
    // TODO: Safety check agentCode with isolated-vm sandbox
    // - memoryLimit: 128MB
    // - timeout: 100ms
    // - Block filesystem/network access
    if (agentCode) {
      logger.debug({ moltbookId: agent.id }, 'Custom agent code submitted (validation skipped)');
    }
    if (builtInAgent) {
      logger.debug(
        { moltbookId: agent.id, builtInAgent },
        'Built-in agent selected',
      );
    }

    // 4. Wallet address allocation and funding
    let finalWalletAddress: string;

    if (walletAddress) {
      // Own wallet provided
      finalWalletAddress = walletAddress;
      logger.info(
        { moltbookId: agent.id, walletAddress },
        'Own wallet address provided',
      );
    } else {
      // Server-generated wallet (future Circle Dev-Controlled Wallet integration)
      // Currently generates random address temporarily (test only)
      const randomWallet = crypto.randomBytes(20).toString('hex');
      finalWalletAddress = `0x${randomWallet}`;
      logger.warn(
        { moltbookId: agent.id, generatedWallet: finalWalletAddress },
        'Temporary wallet address generated (Circle integration needed)',
      );
    }

    // Fund with Agent Faucet (testnet only, skip if not actual wallet)
    if (walletAddress) {
      try {
        const provider = createMonadProvider();
        await ensureAgentFunded(finalWalletAddress, provider, 0.1);
        logger.info(
          { moltbookId: agent.id, walletAddress: finalWalletAddress },
          'Agent Faucet funding completed',
        );
      } catch (error) {
        if (error instanceof AgentFaucetError) {
          logger.error(
            { moltbookId: agent.id, walletAddress: finalWalletAddress, error: error.message },
            'Agent Faucet funding failed',
          );
          res.status(503).json({
            success: false,
            error: 'Agent Faucet funding failed',
            details: error.message,
            fallback: 'https://faucet.monad.xyz',
          });
          return;
        }
        throw error;
      }
    }

    // 5. Issue WebSocket session token
    const sessionToken = crypto.randomUUID();
    const agentId = `agent-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    // 6. Register to registry
    const registration: RegisteredAgent = {
      agentId,
      moltbookId: agent.id,
      sessionToken,
      walletAddress: finalWalletAddress,
      role,
      moltbookProfile: {
        name: agent.name,
        karma: agent.karma,
        avatar: agent.avatar,
        ownerHandle: agent.owner.x_handle,
      },
      registeredAt: Date.now(),
      active: true,
    };

    agentRegistry.set(agent.id, registration);

    logger.info(
      {
        agentId,
        moltbookId: agent.id,
        role,
        walletAddress: finalWalletAddress,
        totalRegistered: agentRegistry.size,
      },
      'Agent registration completed',
    );

    // 6.5. Onchain registration (GhostArena.registerExternalAgent)
    const txHash = await callRegisterOnChain(
      finalWalletAddress,
      agent.name,
      agent.id,
      agent.karma,
      role,
    );

    // 7. Response
    res.status(201).json({
      success: true,
      data: {
        agentId,
        sessionToken,
        walletAddress: finalWalletAddress,
        moltbookProfile: {
          name: agent.name,
          karma: agent.karma,
          avatar: agent.avatar,
          ownerHandle: agent.owner.x_handle,
          ownerVerified: agent.owner.x_verified,
        },
        role,
        tournamentId: tournamentId ?? null,
        txHash: txHash ?? null,
        authDocsUrl:
          'https://moltbook.com/auth.md?app=GhostProtocol&endpoint=' +
          encodeURIComponent(
            `${req.protocol}://${req.get('host') ?? 'localhost'}/api/v1/arena/register`,
          ) +
          '&header=X-Moltbook-Identity',
      },
    });
  },
);

/**
 * GET /api/v1/arena/agents
 *
 * 현재 등록된 에이전트 목록 조회.
 * Moltbook 프로필 정보 포함.
 *
 * 쿼리 파라미터:
 * - role: 'pacman' | 'ghost' (선택)
 * - active: 'true' | 'false' (선택, 기본값 true)
 */
router.get('/arena/agents', (req, res): void => {
  const roleFilter = req.query['role'] as AgentRole | undefined;
  const activeFilter = req.query['active'] !== 'false'; // 기본값 true

  let agents = [...agentRegistry.values()];

  // 필터 적용
  if (roleFilter) {
    agents = agents.filter((a) => a.role === roleFilter);
  }
  if (activeFilter) {
    agents = agents.filter((a) => a.active);
  }

  // Remove sensitive info (exclude sessionToken)
  const publicAgents = agents.map((a) => ({
    agentId: a.agentId,
    moltbookId: a.moltbookId,
    walletAddress: a.walletAddress,
    role: a.role,
    moltbookProfile: a.moltbookProfile,
    registeredAt: a.registeredAt,
    active: a.active,
  }));

  logger.debug({ count: publicAgents.length, roleFilter, activeFilter }, 'Agent list query');

  res.json({
    success: true,
    agents: publicAgents,
    total: publicAgents.length,
  });
});

/**
 * GET /api/v1/arena/agents/:moltbookId
 *
 * 특정 에이전트의 상세 프로필 조회.
 * 온체인 전적 + Moltbook 소셜 데이터 결합 (향후 구현).
 */
router.get('/arena/agents/:moltbookId', (req, res): void => {
  const moltbookId = req.params['moltbookId'] as string;
  const agent = agentRegistry.get(moltbookId);

  if (!agent) {
    logger.warn({ moltbookId }, 'Non-existent agent query attempt');
    res.status(404).json({
      success: false,
      error: 'Agent not found',
    });
    return;
  }

  logger.debug({ moltbookId, agentId: agent.agentId }, 'Agent profile query');

  // Public info excluding sessionToken
  res.json({
    success: true,
    agent: {
      agentId: agent.agentId,
      moltbookId: agent.moltbookId,
      walletAddress: agent.walletAddress,
      role: agent.role,
      moltbookProfile: agent.moltbookProfile,
      registeredAt: agent.registeredAt,
      active: agent.active,
      // TODO: 온체인 전적 조회 (GhostArena.sol getAgentStats())
      // onchainStats: { wins, losses, totalScore, elo },
    },
  });
});

export { router as agentRegistrationRouter };
