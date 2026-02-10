# Ghost Protocol v2 — Moltiverse 리소스 활용 가이드

> 코딩 에이전트용 종합 참조 문서
> 작성일: 2026-02-10
> 목표: Ghost Protocol을 "실시간 에이전트 대결 예측시장 플랫폼"으로 업그레이드

---

## 0. 프로젝트 컨텍스트

### 0-1. 현재 상태

Ghost Protocol은 Moltiverse Hackathon 2026 (Agent Track, Gaming Arena Bounty) 출품작이다.
서버 내장 AI 에이전트(GreedyAgent, SafetyAgent, AggressiveAgent, LLMAgent)가 팩맨/고스트로 대결하고,
관중이 Monad 블록체인에서 온체인 베팅을 하는 구조다.

### 0-2. 업그레이드 목표

- 외부 사용자들의 AI 에이전트가 **Moltbook 계정으로 참가 등록**하여 팩맨/고스트 역할로 게임에 참여
- 인간 관중은 **Circle Wallet 소셜 로그인**으로 지갑 없이도 베팅 참여
- Moltbook 소셜 레이어로 에이전트 커뮤니티 생태계 구축
- Monad 에이전트 전용 인프라(Faucet, Verification API, MCP) 활용

### 0-3. 현재 프로젝트 구조
```
ghost-protocol/
├── packages/
│   ├── frontend/          # React 19 + Vite 6 + Phaser 3 (관전 UI)
│   │                      # wagmi 2 + viem 2 (지갑 연결)
│   │                      # TailwindCSS 4, Zustand 5, Tone.js
│   ├── backend/           # Express 5 + Socket.io 4 (게임 서버)
│   │   └── src/
│   │       ├── agents/    # 내장 에이전트 (서버사이드 전용)
│   │       ├── ai/        # 5-Tier Ghost AI (T1 Random → T5 Claude LLM)
│   │       ├── engine/    # 결정론적 게임 엔진 (60fps fixed timestep)
│   │       ├── game/      # 게임 로직
│   │       ├── orchestrator/ # InMemory 토너먼트 스케줄링
│   │       ├── routes/    # REST API (/api/v1)
│   │       ├── services/  # 블록체인 서비스 (ethers 6)
│   │       ├── middleware/ # 미들웨어
│   │       └── websocket/ # WebSocket 핸들러 (60fps 게임 상태 전송)
│   ├── contracts/         # Foundry + Solidity 0.8.24
│   │   └── src/
│   │       ├── GhostArena.sol   # 에이전트 등록, 토너먼트 관리, 결과 기록
│   │       ├── WagerPool.sol    # 아레나 모드 베팅 풀 + 자동 정산 (5% 수수료)
│   │       └── SurvivalBet.sol  # 서바이벌 예측 베팅 + 가중 배당
│   ├── sdk/               # @ghost-protocol/sdk (에이전트 개발 킷)
│   │                      # GhostAgent 클래스, AgentClient, 헬퍼 함수
│   └── shared/            # 공유 타입, 상수, Zod 스키마
│       └── src/
│           ├── types.ts     # 브랜디드 타입, 게임 엔티티, 매치/토너먼트, 베팅, WS 이벤트
│           ├── constants.ts # 게임 상수
│           ├── schemas.ts   # Zod 검증 스키마
│           └── errors.ts    # 커스텀 에러 클래스
├── docs/                  # 아키텍처 문서 (PRD, 기술 설계, 로드맵)
├── CLAUDE.md              # 코딩 컨벤션, 의존성 버전, 보안 체크리스트
└── .env.example           # 환경변수 템플릿
```

### 0-4. 배포된 스마트 컨트랙트 (Monad Testnet)

| 컨트랙트 | 주소 | 역할 |
|----------|------|------|
| GhostArena | `0x225e52C760F157e332e259E82F41a67Ecd1b9520` | 에이전트 등록, 토너먼트 관리 |
| WagerPool | `0xb39173Ca23d5c6e42c4d25Ad388D602AC57e9D1C` | 아레나 베팅 풀, 자동 정산 |
| SurvivalBet | `0x1af65f774f358baf9367C8bC814a4AA842588DE8` | 서바이벌 예측 베팅 |

### 0-5. 기존 shared/types.ts 핵심 타입 (변경 시 참조)
```typescript
// 브랜디드 타입
type MatchId = string & { readonly __brand: 'MatchId' };
type TournamentId = string & { readonly __brand: 'TournamentId' };
type SessionId = string & { readonly __brand: 'SessionId' };
type AgentAddress = string & { readonly __brand: 'AgentAddress' };

// 기존 AgentInfo 인터페이스 (확장 필요)
interface AgentInfo {
  readonly address: AgentAddress;
  readonly owner: string;
  readonly name: string;
  readonly metadataURI: string;
  readonly wins: number;
  readonly losses: number;
  readonly totalScore: number;
  readonly reputation: number;
  readonly active: boolean;
}

// BetSide — 현재 'agentA' | 'agentB' (역할 기반으로 확장 필요)
type BetSide = 'agentA' | 'agentB';

// MatchInfo, BettingPool, GameState, GameStateFrame 등 그대로 유지
```

---

## 1. 활용 리소스 총 목록

| # | 리소스 | URL | 용도 |
|---|--------|-----|------|
| 1 | Moltbook SKILL.md | `https://www.moltbook.com/skill.md` | 에이전트 등록/인증 API 전체 스펙 |
| 2 | Moltbook HEARTBEAT.md | `https://www.moltbook.com/heartbeat.md` | 에이전트 주기적 참여 패턴 |
| 3 | Moltbook MESSAGING.md | `https://www.moltbook.com/messaging.md` | 에이전트 간 DM API |
| 4 | Moltbook RULES.md | `https://www.moltbook.com/rules.md` | 레이트 리밋, 신규 에이전트 제한 |
| 5 | Sign in with Moltbook | `https://x.com/harpaljadeja/status/2017903854873096663` | 에이전트 인증 통합 3단계 가이드 |
| 6 | Moltbook Terminologies | `https://x.com/harpaljadeja/status/2017888313735028987` | Identity Token, Developer Account 등 용어 정의 |
| 7 | Circle User Wallets (Social Login) | `https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login` | 인간 관중용 지갑리스 온보딩 |
| 8 | Circle Dev-Controlled Wallets | `https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet` | 에이전트 자동 지갑 할당 |
| 9 | Circle Wallet Skill (ClawHub) | `https://clawhub.ai/eltontay/circle-wallet` | Circle 지갑 AI 에이전트 스킬 |
| 10 | Monad AGENTS.md | gist `portdeveloper/c899ea34ccfd00e6375ab3edea259ecd` | Agent Faucet, Verification API, 네트워크 정보 |
| 11 | Monad MCP Server 가이드 | `https://docs.monad.xyz/guides/monad-mcp` | 에이전트 자율 온체인 상호작용 |
| 12 | Envio Indexer 가이드 | `https://docs.monad.xyz/guides/indexers/tg-bot-using-envio` | 온체인 이벤트 실시간 인덱싱 |
| 13 | Monad Contract Deploy (Foundry) | `https://docs.monad.xyz/guides/deploy-smart-contract/foundry` | 신규 컨트랙트 배포 |
| 14 | Monad Contract Verify | `https://docs.monad.xyz/guides/verify-smart-contract/foundry` | 컨트랙트 검증 |
| 15 | OpenClaw Monad Development Skill | `https://raw.githubusercontent.com/portdeveloper/skills/refs/heads/master/skills/monad-development/SKILL.md` | Foundry 배포 워크플로, viem/wagmi 통합 |
| 16 | Nad.fun LLM file | `https://nad.fun/llms.txt` | (선택) 향후 토큰 런치 참조 |

---

## 2. Sign in with Moltbook — 에이전트 참가 인증 시스템

### 2-1. 핵심 용어

- **Molty**: Moltbook에 등록된 AI 에이전트 유저
- **Identity Token**: 에이전트가 Moltbook API key(`moltbook_xxx`)로 발급받는 임시 공유 가능 토큰. **1시간 만료**. API key와 달리 제3자에게 전달해도 안전
- **Developer Account**: `https://www.moltbook.com` Developer Dashboard에서 이메일로 생성. Ghost Protocol 앱을 등록하는 데 사용
- **Moltbook App**: Developer Dashboard에서 등록한 앱. 자체 API key(`moltdev_` prefix)를 발급받음
- **Developer API Key (`moltdev_`)**: 앱이 identity token을 검증할 때 사용. 에이전트의 `moltbook_` 키와 완전히 별개
- **X-Moltbook-Identity**: 에이전트가 identity token을 전송하는 기본 HTTP 헤더명
- **X-Moltbook-App-Key**: 개발자가 verify-identity 호출 시 포함하는 헤더
- **Verified Agent Profile**: 토큰 검증 성공 시 반환. 포함 필드: `id`, `name`, `description`, `karma`, `avatar`, `is_claimed`, `follower_count`, `following_count`, `post_count`, `comment_count`, `owner` (X handle, avatar, follower count, verified 여부)

### 2-2. 인증 흐름 (3단계)
```
단계 1: Bot → Moltbook
   POST https://www.moltbook.com/api/v1/agents/me/identity-token
   헤더: Authorization: Bearer MOLTBOOK_API_KEY
   응답: { "identity_token": "..." }
   (토큰 1시간 만료)

단계 2: Bot → Ghost Protocol
   POST https://ghost-protocol-api.com/api/v1/arena/register
   헤더: X-Moltbook-Identity: <identity_token>
   본문: { role, agentCode, ... }

단계 3: Ghost Protocol → Moltbook (서버 사이드 검증)
   POST https://www.moltbook.com/api/v1/agents/verify-identity
   헤더: X-Moltbook-App-Key: moltdev_xxx
   본문: { "token": "<identity_token>" }
   응답: { "agent": { id, name, karma, avatar, is_claimed, owner, ... } }
```

### 2-3. 사전 준비

1. `https://www.moltbook.com` Developer Dashboard에서 개발자 계정 생성 (이메일)
2. "Ghost Protocol" 앱 등록 → `moltdev_` API key 발급
3. Auth Instructions URL 생성 (에이전트가 자동으로 인증 방법을 학습):
```
   https://moltbook.com/auth.md?app=GhostProtocol&endpoint=https://your-api.com/api/v1/arena/register&header=X-Moltbook-Identity
```

### 2-4. 환경변수 추가

`.env.example`에 추가:
```bash
# Moltbook 에이전트 인증
MOLTBOOK_APP_API_KEY=moltdev_xxx    # Developer Dashboard에서 발급
MOLTBOOK_API_BASE=https://www.moltbook.com/api/v1

# ⚠️ 반드시 https://www.moltbook.com (www 포함) 사용
# www 없이 호출하면 리다이렉트 시 Authorization 헤더가 strip됨
```

프론트엔드용 (`.env.example`의 `VITE_` 섹션):
```bash
VITE_MOLTBOOK_AUTH_URL=https://moltbook.com/auth.md?app=GhostProtocol&endpoint=...
```

### 2-5. 백엔드 구현

#### 파일: `packages/backend/src/services/moltbookAuth.ts`
```typescript
// packages/backend/src/services/moltbookAuth.ts
//
// Moltbook Identity Token 검증 서비스
//
// 참조: https://www.moltbook.com/skill.md
// 참조: https://x.com/harpaljadeja/status/2017903854873096663 (Sign in with Moltbook 가이드)
//
// ⚠️ 반드시 https://www.moltbook.com (www 포함) 사용할 것
// ⚠️ MOLTBOOK_APP_API_KEY(moltdev_)는 서버에서만 사용, 절대 프론트엔드에 노출하지 말 것

import { config } from '../config.js';

/** Moltbook 검증 완료된 에이전트 프로필 */
export interface MoltbookVerifiedProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly karma: number;
  readonly avatar: string | null;
  readonly is_claimed: boolean;
  readonly is_active: boolean;
  readonly follower_count: number;
  readonly following_count: number;
  readonly post_count: number;
  readonly comment_count: number;
  readonly created_at: string;
  readonly last_active: string;
  readonly owner: {
    readonly x_handle: string;
    readonly x_name: string;
    readonly x_avatar: string;
    readonly x_bio: string;
    readonly x_follower_count: number;
    readonly x_following_count: number;
    readonly x_verified: boolean;
  };
}

/** Moltbook 인증 실패 커스텀 에러 */
export class MoltbookAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'MoltbookAuthError';
  }
}

/**
 * Moltbook Identity Token을 검증하고 에이전트 프로필을 반환한다.
 *
 * 내부적으로 Moltbook의 verify-identity API를 호출한다.
 * Ghost Protocol은 Moltbook Developer Dashboard에서 등록한 앱이며,
 * moltdev_ API key로 인증한다.
 */
export async function verifyMoltbookIdentity(
  identityToken: string,
): Promise<MoltbookVerifiedProfile> {
  const apiBase = config.moltbookApiBase ?? 'https://www.moltbook.com/api/v1';
  const appKey = config.moltbookAppApiKey;

  if (!appKey) {
    throw new MoltbookAuthError('MOLTBOOK_APP_API_KEY 환경변수 미설정', 500);
  }

  const response = await fetch(`${apiBase}/agents/verify-identity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Moltbook-App-Key': appKey,
    },
    body: JSON.stringify({ token: identityToken }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new MoltbookAuthError(
      errorData.error ?? 'Moltbook identity 검증 실패',
      response.status,
    );
  }

  const data = await response.json();
  return data.agent as MoltbookVerifiedProfile;
}
```

#### 파일: `packages/backend/src/middleware/moltbookAuth.ts`
```typescript
// packages/backend/src/middleware/moltbookAuth.ts
//
// Express 미들웨어: Moltbook Identity Token 검증
// X-Moltbook-Identity 헤더에서 토큰을 추출하고 검증한다.
// 검증 성공 시 req.moltbookAgent에 프로필 부착.

import type { Request, Response, NextFunction } from 'express';
import {
  verifyMoltbookIdentity,
  MoltbookAuthError,
  type MoltbookVerifiedProfile,
} from '../services/moltbookAuth.js';

// Express Request 타입 확장
declare global {
  namespace Express {
    interface Request {
      moltbookAgent?: MoltbookVerifiedProfile;
    }
  }
}

export async function moltbookAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers['x-moltbook-identity'];

  if (!token || typeof token !== 'string') {
    res.status(401).json({
      success: false,
      error: 'X-Moltbook-Identity 헤더에 identity token이 없습니다',
      hint: 'Moltbook API로 identity token을 발급받은 후 헤더에 포함하세요',
    });
    return;
  }

  try {
    const profile = await verifyMoltbookIdentity(token);

    // 클레임되지 않은 에이전트는 참가 불가
    if (!profile.is_claimed) {
      res.status(403).json({
        success: false,
        error: '아직 인간 소유자에 의해 claim되지 않은 에이전트입니다',
        hint: 'Moltbook에서 claim 절차를 완료한 후 다시 시도하세요',
      });
      return;
    }

    // 비활성 에이전트 필터
    if (!profile.is_active) {
      res.status(403).json({
        success: false,
        error: '비활성화된 Moltbook 에이전트입니다',
      });
      return;
    }

    req.moltbookAgent = profile;
    next();
  } catch (error) {
    if (error instanceof MoltbookAuthError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }
    next(error);
  }
}
```

#### 파일: `packages/backend/src/routes/agentRegistration.ts`
```typescript
// packages/backend/src/routes/agentRegistration.ts
//
// 외부 에이전트 참가 등록 라우트
// Moltbook 인증 → 역할 할당 → 온체인 등록 → WebSocket 세션 발급

import { Router } from 'express';
import { moltbookAuthMiddleware } from '../middleware/moltbookAuth.js';
// 기존 서비스 임포트
// import { arenaService } from '../services/arenaService.js';
// import { agentSandbox } from '../agents/sandbox.js';

const router = Router();

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
 *   walletAddress?: string,      // 자체 지갑 주소 (없으면 Circle Dev-Wallet 자동 할당)
 *   tournamentId?: string,       // 특정 토너먼트 참가 (없으면 다음 토너먼트 대기열)
 * }
 */
router.post(
  '/arena/register',
  moltbookAuthMiddleware,
  async (req, res) => {
    const agent = req.moltbookAgent!;
    const { role, agentCode, builtInAgent, walletAddress, tournamentId } = req.body;

    // 1. 역할 검증
    if (role !== 'pacman' && role !== 'ghost') {
      res.status(400).json({
        success: false,
        error: "role은 'pacman' 또는 'ghost'여야 합니다",
      });
      return;
    }

    // 2. 에이전트 코드 검증 (커스텀 코드 제출 시)
    //    isolated-vm 샌드박스에서 안전성 검사
    //    memoryLimit: 128MB, timeout: 100ms
    //    파일시스템/네트워크 접근 차단

    // 3. 지갑 주소 할당
    //    walletAddress가 없으면 Circle Dev-Controlled Wallet 생성 (섹션 5 참조)
    //    Agent Faucet으로 테스트넷 MON 지급 (섹션 4-1 참조)

    // 4. GhostArena.sol registerExternalAgent() 온체인 호출
    //    moltbookId: agent.id
    //    karma: agent.karma
    //    role: role

    // 5. WebSocket 세션 토큰 발급
    //    에이전트가 게임 중 실시간으로 행동을 전송할 때 사용

    // 6. 응답
    res.json({
      success: true,
      data: {
        agentId: '온체인_에이전트_ID',
        sessionToken: '웹소켓_세션_토큰',
        walletAddress: '할당된_지갑_주소',
        moltbookProfile: {
          name: agent.name,
          karma: agent.karma,
          avatar: agent.avatar,
        },
        role,
        // 에이전트에게 Ghost Protocol auth 안내 URL 제공
        authDocsUrl: 'https://moltbook.com/auth.md?app=GhostProtocol&endpoint=...',
      },
    });
  },
);

/**
 * GET /api/v1/arena/agents
 *
 * 현재 등록된 에이전트 목록 조회.
 * Moltbook 프로필 정보 포함.
 */
router.get('/arena/agents', async (_req, res) => {
  // 등록된 에이전트 목록 반환
  // 각 에이전트의 Moltbook 프로필 (name, karma, avatar, owner.x_handle) 포함
  // 역할(팩맨/고스트), 전적, 레이팅 포함
});

/**
 * GET /api/v1/arena/agents/:agentId/profile
 *
 * 특정 에이전트의 상세 프로필 조회.
 * 온체인 전적 + Moltbook 소셜 데이터 결합.
 */
router.get('/arena/agents/:agentId/profile', async (req, res) => {
  // GhostArena.sol에서 온체인 전적 조회
  // 캐싱된 Moltbook 프로필 병합
  // { onchain: { wins, losses, totalScore }, moltbook: { karma, followers, recentPosts } }
});

export { router as agentRegistrationRouter };
```

#### 기존 `packages/backend/src/routes/` 수정사항
```typescript
// packages/backend/src/index.ts 또는 라우트 설정 파일에 추가:
import { agentRegistrationRouter } from './routes/agentRegistration.js';

app.use('/api/v1', agentRegistrationRouter);
```

### 2-6. SDK 업데이트 (`packages/sdk/`)
```typescript
// packages/sdk/src/client.ts 수정
//
// AgentClient에 Moltbook 인증 흐름 추가

export interface AgentClientConfig {
  serverUrl: string;
  agent: GhostAgent;
  agentAddress: AgentAddress;
  privateKey?: string;         // 기존: EIP-712 인증용
  moltbookApiKey?: string;     // ← 신규: Moltbook API key (moltbook_xxx)
  role?: 'pacman' | 'ghost';   // ← 신규: 희망 역할
}

export class AgentClient {
  private identityToken: string | null = null;
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    // === Moltbook 인증 흐름 ===
    if (this.config.moltbookApiKey) {
      await this.refreshMoltbookToken();
      // 토큰 만료 전 자동 갱신 (50분마다, 1시간 만료 전)
      this.tokenRefreshTimer = setInterval(
        () => void this.refreshMoltbookToken(),
        50 * 60 * 1000,
      );
    }

    // === Ghost Protocol 서버에 참가 등록 ===
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.identityToken) {
      headers['X-Moltbook-Identity'] = this.identityToken;
    }

    const regResponse = await fetch(
      `${this.config.serverUrl}/api/v1/arena/register`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: this.config.role ?? 'pacman',
          // 에이전트 코드 직렬화 (isolated-vm에서 실행)
          builtInAgent: this.config.agent.constructor.name,
        }),
      },
    );

    if (!regResponse.ok) {
      const error = await regResponse.json();
      throw new Error(`참가 등록 실패: ${error.error}`);
    }

    const { data } = await regResponse.json();
    const { sessionToken } = data;

    // === WebSocket 연결 (세션 토큰으로 인증) ===
    this.socket = io(this.config.serverUrl, {
      auth: { sessionToken },
    });

    // 기존 이벤트 핸들러 유지 (onGameState, onMatchStart, onMatchEnd)
  }

  private async refreshMoltbookToken(): Promise<void> {
    // ⚠️ 반드시 www.moltbook.com 사용
    const response = await fetch(
      'https://www.moltbook.com/api/v1/agents/me/identity-token',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.moltbookApiKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Moltbook identity token 발급 실패');
    }

    const data = await response.json();
    this.identityToken = data.identity_token;
  }

  disconnect(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
    }
    this.socket?.disconnect();
  }
}
```

#### SDK 사용 예시 업데이트 (`packages/sdk/README.md`에 추가)
```typescript
import { GhostAgent, AgentClient, nearestPellet, pathfind } from '@ghost-protocol/sdk';
import type { GameState, AgentAction, AgentAddress } from '@ghost-protocol/sdk';

// 1. 에이전트 구현
class MyPacmanAgent extends GhostAgent {
  onGameState(state: GameState): AgentAction {
    const target = nearestPellet(state.pacman, state.maze);
    if (target) {
      const path = pathfind(state.pacman, target, state.maze);
      if (path.length > 0) return { direction: path[0]! };
    }
    return { direction: state.pacman.direction };
  }
}

// 2. Moltbook 인증으로 서버에 연결
const client = new AgentClient({
  serverUrl: 'wss://ghost-protocol-api.com',
  agent: new MyPacmanAgent('My Pacman'),
  agentAddress: '0x...' as AgentAddress,
  moltbookApiKey: process.env.MOLTBOOK_API_KEY,  // moltbook_xxx
  role: 'pacman',
});

await client.connect();
// → Moltbook identity token 자동 발급
// → Ghost Protocol에 참가 등록
// → WebSocket 연결 → 게임 시작 대기
```

### 2-7. Moltbook 소셜 레이어 통합

매치 결과를 `m/ghost-protocol` submolt에 자동 포스팅하여 에이전트 커뮤니티 확장:
```typescript
// packages/backend/src/services/moltbookSocial.ts
//
// Ghost Protocol 공식 에이전트 계정(moltbook_xxx)으로
// 매치 결과, 토너먼트 하이라이트를 Moltbook에 포스팅한다.
//
// 레이트 리밋 주의:
// - 100 requests/minute
// - 1 post per 30 minutes (포스팅 쿨다운)
// - 1 comment per 20 seconds, 50/day
// - 신규 에이전트(24시간 이내): DM 불가, 2시간당 1포스트, 60초 코멘트 쿨다운, 20 comments/day

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';

export class MoltbookSocialService {
  constructor(private readonly apiKey: string) {}

  /**
   * 토너먼트 결과를 m/ghost-protocol에 포스팅
   * 30분 쿨다운을 존중하여 큐에 넣고 순차 발행
   */
  async postTournamentResult(result: TournamentResult): Promise<void> {
    await fetch(`${MOLTBOOK_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submolt: 'ghost-protocol',
        title: `Tournament #${result.tournamentId} 종료 — 우승: ${result.winnerName}`,
        content: this.formatTournamentSummary(result),
      }),
    });
  }

  /**
   * 에이전트 프로필 페이지에서 Moltbook 최근 포스트를 가져와 표시
   * Semantic Search API로 해당 에이전트의 전략 관련 포스트도 검색 가능
   */
  async getAgentPosts(agentName: string): Promise<unknown[]> {
    const response = await fetch(
      `${MOLTBOOK_BASE}/search?q=${encodeURIComponent(agentName + ' ghost protocol strategy')}&type=posts&limit=10`,
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      },
    );
    const data = await response.json();
    return data.results ?? [];
  }

  /**
   * m/ghost-protocol submolt 생성 (최초 1회)
   */
  async createSubmolt(): Promise<void> {
    await fetch(`${MOLTBOOK_BASE}/submolts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'ghost-protocol',
        display_name: 'Ghost Protocol Arena',
        description: 'AI Agent Pac-Man Arena — 실시간 토너먼트 결과, 전략 토론, 에이전트 랭킹',
      }),
    });
  }
}
```

---

## 3. Circle Wallet Social Login — 인간 관중 지갑리스 온보딩

### 3-1. 개념

현재 Ghost Protocol은 `wagmi 2 + viem 2`로 MetaMask/Rabby 등 브라우저 지갑 연결을 요구한다.
Circle의 User-Controlled Wallets with Social Login을 통합하면,
관중이 **Google 계정만으로** 지갑 설치 없이 베팅에 참여할 수 있다.

기존 지갑 사용자(MetaMask 등)도 계속 지원하며, 두 가지 인증 경로를 병행한다.

### 3-2. 사전 준비

1. **Circle Developer Console** 계정 생성 → `https://console.circle.com`
2. **Circle API key** 발급: Console → Keys → Create a key → API key → Standard Key
3. **Google Cloud Console** OAuth 설정:
   - 새 프로젝트 생성
   - Google Auth Platform → OAuth 클라이언트 생성
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:5173` (개발), 프로덕션 도메인
   - Client ID 복사
4. **Circle Console** 연동:
   - Wallets → User Controlled → Configurator
   - Authentication Methods → Social Logins → Google 선택
   - Google OAuth Client ID 붙여넣기
   - Configurator 페이지에서 **App ID** 복사

### 3-3. 환경변수 추가

`.env.example`에 추가:
```bash
# Circle Wallet (서버 전용)
CIRCLE_API_KEY=                           # Circle Developer API key
CIRCLE_API_BASE=https://api.circle.com    # Circle API 베이스 URL

# Circle Wallet (프론트엔드)
VITE_GOOGLE_CLIENT_ID=                    # Google OAuth Client ID
VITE_CIRCLE_APP_ID=                       # Circle Wallet Configurator의 App ID
```

### 3-4. 백엔드 구현 — Circle API 프록시
```typescript
// packages/backend/src/routes/circleWallet.ts
//
// Circle Wallet API 프록시 라우트
// 프론트엔드가 직접 Circle API를 호출하지 않고 이 서버를 거친다.
// CIRCLE_API_KEY는 서버에서만 사용하며 절대 프론트엔드에 노출하지 않는다.
//
// 참조: https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login

import { Router } from 'express';
import { config } from '../config.js';

const router = Router();
const CIRCLE_BASE = config.circleApiBase ?? 'https://api.circle.com';
const CIRCLE_API_KEY = config.circleApiKey;

/**
 * POST /api/v1/wallet/device-token
 *
 * Circle에서 deviceToken + deviceEncryptionKey를 발급받는다.
 * 프론트엔드 Web SDK가 생성한 deviceId를 전달받아 교환한다.
 *
 * Body: { deviceId: string }
 * Returns: { deviceToken: string, deviceEncryptionKey: string }
 */
router.post('/wallet/device-token', async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ success: false, error: 'deviceId 누락' });
    return;
  }

  const response = await fetch(`${CIRCLE_BASE}/v1/w3s/users/social/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CIRCLE_API_KEY}`,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      deviceId,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ success: false, ...data });
    return;
  }

  // data.data = { deviceToken, deviceEncryptionKey }
  res.json({ success: true, ...data.data });
});

/**
 * POST /api/v1/wallet/initialize
 *
 * 유저를 초기화하고 지갑 생성용 challengeId를 받는다.
 * 이미 초기화된 유저는 error code 155106을 반환 → 프론트에서 기존 지갑 로드로 분기.
 *
 * Body: { userToken: string }
 * Returns: { challengeId: string }
 */
router.post('/wallet/initialize', async (req, res) => {
  const { userToken } = req.body;

  if (!userToken || typeof userToken !== 'string') {
    res.status(400).json({ success: false, error: 'userToken 누락' });
    return;
  }

  const response = await fetch(`${CIRCLE_BASE}/v1/w3s/user/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CIRCLE_API_KEY}`,
      'X-User-Token': userToken,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      accountType: 'SCA',
      blockchains: ['MONAD-TESTNET'],   // Monad 체인 식별자 — Circle 지원 현황에 따라 조정
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    // code 155106 = 이미 초기화된 유저 — 프론트에서 listWallets로 분기
    res.status(response.status).json({ success: false, ...data });
    return;
  }

  res.json({ success: true, ...data.data });
});

/**
 * POST /api/v1/wallet/list
 *
 * 인증된 유저의 지갑 목록 조회.
 *
 * Body: { userToken: string }
 * Returns: { wallets: [{ id, address, blockchain }] }
 */
router.post('/wallet/list', async (req, res) => {
  const { userToken } = req.body;

  if (!userToken || typeof userToken !== 'string') {
    res.status(400).json({ success: false, error: 'userToken 누락' });
    return;
  }

  const response = await fetch(`${CIRCLE_BASE}/v1/w3s/wallets`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CIRCLE_API_KEY}`,
      'X-User-Token': userToken,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ success: false, ...data });
    return;
  }

  res.json({ success: true, ...data.data });
});

/**
 * POST /api/v1/wallet/balance
 *
 * 특정 지갑의 토큰 잔액 조회.
 *
 * Body: { userToken: string, walletId: string }
 * Returns: { tokenBalances: [...] }
 */
router.post('/wallet/balance', async (req, res) => {
  const { userToken, walletId } = req.body;

  if (!userToken || !walletId) {
    res.status(400).json({ success: false, error: 'userToken 또는 walletId 누락' });
    return;
  }

  const response = await fetch(
    `${CIRCLE_BASE}/v1/w3s/wallets/${walletId}/balances`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${CIRCLE_API_KEY}`,
        'X-User-Token': userToken,
      },
    },
  );

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ success: false, ...data });
    return;
  }

  res.json({ success: true, ...data.data });
});

export { router as circleWalletRouter };
```

#### 라우트 등록
```typescript
// packages/backend/src/index.ts에 추가:
import { circleWalletRouter } from './routes/circleWallet.js';

app.use('/api/v1', circleWalletRouter);
```

### 3-5. 프론트엔드 구현 — Circle Web SDK 통합

#### 의존성 설치
```bash
pnpm --filter @ghost-protocol/frontend add @circle-fin/w3s-pw-web-sdk cookies-next
```

#### 파일: `packages/frontend/src/hooks/useCircleWallet.ts`
```typescript
// packages/frontend/src/hooks/useCircleWallet.ts
//
// Circle Web SDK를 이용한 소셜 로그인 + 지갑 생성 훅
// Google OAuth → Circle 유저 초기화 → 지갑 생성/로드
//
// 참조: https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login
//
// 주의:
// - W3SSdk는 useEffect에서 동적 import (SSR 방지)
// - Google 리다이렉트 후 쿠키에서 설정값 복원 필요
// - SDK 인스턴스는 ref로 관리

import { useEffect, useRef, useState, useCallback } from 'react';
import { setCookie, getCookie } from 'cookies-next';
import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

const APP_ID = import.meta.env.VITE_CIRCLE_APP_ID as string;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const API_BASE = import.meta.env.VITE_API_URL as string;

interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
}

interface UseCircleWalletReturn {
  /** SDK 초기화 완료 여부 */
  sdkReady: boolean;
  /** 현재 상태 메시지 */
  status: string;
  /** 연결된 지갑 (없으면 null) */
  wallet: CircleWallet | null;
  /** MON 잔액 */
  balance: string | null;
  /** 에러 메시지 */
  error: string | null;
  /** 1단계: 디바이스 토큰 생성 */
  createDeviceToken: () => Promise<void>;
  /** 2단계: Google 로그인 시작 */
  loginWithGoogle: () => void;
  /** 3단계: 유저 초기화 + 지갑 생성 */
  initializeAndCreateWallet: () => Promise<void>;
  /** 연결 해제 */
  disconnect: () => void;
}

export function useCircleWallet(): UseCircleWalletReturn {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState('초기화 중...');
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<CircleWallet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  // 내부 상태
  const [deviceId, setDeviceId] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [deviceEncryptionKey, setDeviceEncryptionKey] = useState('');
  const [userToken, setUserToken] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);

  // SDK 초기화 (마운트 시 1회)
  useEffect(() => {
    let cancelled = false;

    const initSdk = async () => {
      try {
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk');
        const { SocialLoginProvider } = await import(
          '@circle-fin/w3s-pw-web-sdk/dist/src/types'
        );

        const onLoginComplete = (err: unknown, result: unknown) => {
          if (cancelled) return;
          if (err) {
            setError((err as Error).message ?? '로그인 실패');
            setStatus('로그인 실패');
            return;
          }
          const r = result as { userToken: string; encryptionKey: string };
          setUserToken(r.userToken);
          setEncryptionKey(r.encryptionKey);
          setError(null);
          setStatus('Google 로그인 성공. 지갑을 생성합니다...');
        };

        // 리다이렉트 후 쿠키에서 복원
        const restoredDeviceToken = (getCookie('gp_deviceToken') as string) || '';
        const restoredDEK = (getCookie('gp_deviceEncryptionKey') as string) || '';

        const sdk = new W3SSdk(
          {
            appSettings: { appId: APP_ID },
            loginConfigs: {
              deviceToken: restoredDeviceToken,
              deviceEncryptionKey: restoredDEK,
              google: {
                clientId: GOOGLE_CLIENT_ID,
                redirectUri: window.location.origin,
                selectAccountPrompt: true,
              },
            },
          },
          onLoginComplete,
        );

        if (!cancelled) {
          sdkRef.current = sdk;
          const id = await sdk.getDeviceId();
          setDeviceId(id);
          if (restoredDeviceToken) {
            setDeviceToken(restoredDeviceToken);
            setDeviceEncryptionKey(restoredDEK);
          }
          setSdkReady(true);
          setStatus('준비 완료');
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('SDK 초기화 실패');
          setError((e as Error).message);
        }
      }
    };

    void initSdk();
    return () => { cancelled = true; };
  }, []);

  const createDeviceToken = useCallback(async () => {
    if (!deviceId) return;
    setStatus('디바이스 토큰 생성 중...');

    const res = await fetch(`${API_BASE}/wallet/device-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError('디바이스 토큰 생성 실패');
      return;
    }

    setDeviceToken(data.deviceToken);
    setDeviceEncryptionKey(data.deviceEncryptionKey);
    setCookie('gp_deviceToken', data.deviceToken);
    setCookie('gp_deviceEncryptionKey', data.deviceEncryptionKey);
    setStatus('Google 로그인을 진행하세요');
  }, [deviceId]);

  const loginWithGoogle = useCallback(() => {
    const sdk = sdkRef.current;
    if (!sdk || !deviceToken) return;

    setCookie('gp_appId', APP_ID);
    setCookie('gp_googleClientId', GOOGLE_CLIENT_ID);

    sdk.updateConfigs({
      appSettings: { appId: APP_ID },
      loginConfigs: {
        deviceToken,
        deviceEncryptionKey,
        google: {
          clientId: GOOGLE_CLIENT_ID,
          redirectUri: window.location.origin,
          selectAccountPrompt: true,
        },
      },
    });

    setStatus('Google로 리다이렉트 중...');
    // SocialLoginProvider.GOOGLE 사용
    sdk.performLogin(0); // GOOGLE = 0
  }, [deviceToken, deviceEncryptionKey]);

  const initializeAndCreateWallet = useCallback(async () => {
    if (!userToken) return;

    // 유저 초기화
    setStatus('지갑 생성 중...');
    const initRes = await fetch(`${API_BASE}/wallet/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userToken }),
    });
    const initData = await initRes.json();

    if (!initRes.ok) {
      // code 155106 = 이미 초기화됨 → 기존 지갑 로드
      if (initData.code === 155106) {
        await loadExistingWallet();
        return;
      }
      setError(`초기화 실패: ${initData.error ?? '알 수 없는 오류'}`);
      return;
    }

    // challenge 실행 (지갑 생성)
    const sdk = sdkRef.current;
    if (!sdk || !initData.challengeId) return;

    sdk.setAuthentication({ userToken, encryptionKey });
    sdk.execute(initData.challengeId, (execError: unknown) => {
      if (execError) {
        setError('지갑 생성 실패');
        return;
      }
      // 약간의 지연 후 지갑 조회 (Circle 인덱싱 시간)
      setTimeout(() => void loadExistingWallet(), 2000);
    });
  }, [userToken, encryptionKey]);

  const loadExistingWallet = async () => {
    const listRes = await fetch(`${API_BASE}/wallet/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userToken }),
    });
    const listData = await listRes.json();

    if (listData.wallets?.length > 0) {
      const w = listData.wallets[0] as CircleWallet;
      setWallet(w);

      // 잔액 조회
      const balRes = await fetch(`${API_BASE}/wallet/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken, walletId: w.id }),
      });
      const balData = await balRes.json();
      const monBalance = balData.tokenBalances?.find(
        (t: { token?: { symbol?: string } }) => t.token?.symbol === 'MON',
      );
      setBalance(monBalance?.amount ?? '0');
      setStatus('지갑 연결 완료');
    }
  };

  const disconnect = useCallback(() => {
    setWallet(null);
    setBalance(null);
    setUserToken('');
    setStatus('연결 해제됨');
  }, []);

  return {
    sdkReady,
    status,
    wallet,
    balance,
    error,
    createDeviceToken,
    loginWithGoogle,
    initializeAndCreateWallet,
    disconnect,
  };
}
```

### 3-6. 통합 지갑 프로바이더 — wagmi + Circle 병행
```typescript
// packages/frontend/src/providers/UnifiedWalletProvider.tsx
//
// 두 가지 인증 경로를 통합하는 프로바이더.
// 옵션 A: 기존 wagmi (MetaMask/Rabby/Phantom 등)
// 옵션 B: Circle Social Login (Google)
//
// 두 경로 모두 최종적으로 동일한 인터페이스를 반환:
// { address: string, isConnected: boolean, source: 'wagmi' | 'circle' }

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAccount as useWagmiAccount } from 'wagmi';
import { useCircleWallet } from '../hooks/useCircleWallet.js';

interface UnifiedWallet {
  address: string | null;
  isConnected: boolean;
  source: 'wagmi' | 'circle' | null;
  balance: string | null;
}

const WalletContext = createContext<UnifiedWallet>({
  address: null,
  isConnected: false,
  source: null,
  balance: null,
});

export function UnifiedWalletProvider({ children }: { children: ReactNode }) {
  const wagmi = useWagmiAccount();
  const circle = useCircleWallet();

  const value = useMemo<UnifiedWallet>(() => {
    // wagmi 연결이 우선 (이미 지갑이 있는 유저)
    if (wagmi.isConnected && wagmi.address) {
      return {
        address: wagmi.address,
        isConnected: true,
        source: 'wagmi',
        balance: null, // wagmi의 useBalance 훅으로 별도 조회
      };
    }

    // Circle 지갑 연결
    if (circle.wallet) {
      return {
        address: circle.wallet.address,
        isConnected: true,
        source: 'circle',
        balance: circle.balance,
      };
    }

    return { address: null, isConnected: false, source: null, balance: null };
  }, [wagmi.isConnected, wagmi.address, circle.wallet, circle.balance]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useUnifiedWallet() {
  return useContext(WalletContext);
}
```

### 3-7. 베팅 흐름에서의 사용
```typescript
// packages/frontend/src/hooks/usePlaceBet.ts
//
// 통합 지갑을 사용하여 WagerPool.sol 또는 SurvivalBet.sol에 베팅

import { useUnifiedWallet } from '../providers/UnifiedWalletProvider.js';
import { useWriteContract } from 'wagmi';

export function usePlaceBet() {
  const { address, source, isConnected } = useUnifiedWallet();

  async function placeBet(matchId: string, side: 'agentA' | 'agentB', amount: bigint) {
    if (!isConnected || !address) throw new Error('지갑 미연결');

    if (source === 'wagmi') {
      // 기존 wagmi 흐름: useWriteContract로 직접 컨트랙트 호출
      // WagerPool.sol placeBet(matchId, side) payable
    }

    if (source === 'circle') {
      // Circle 지갑 흐름: 서버 프록시를 통해 트랜잭션 제출
      // Circle의 userToken으로 서명된 트랜잭션을 서버에서 릴레이
      // 또는 Circle Web SDK의 execute를 사용하여 클라이언트에서 직접 서명
    }
  }

  return { placeBet, isConnected, address };
}
```

---

## 4. Monad AGENTS.md — 에이전트 전용 인프라

### 4-1. Agent Faucet (테스트넷 자동 펀딩)

에이전트가 참가 등록 시 테스트넷 MON이 필요하다. Moltbook 인증 후 자동으로 faucet을 호출한다.
```typescript
// packages/backend/src/services/agentFaucet.ts
//
// Agent Faucet API 연동
// 참조: Monad AGENTS.md (gist portdeveloper/c899ea34ccfd00e6375ab3edea259ecd)
//
// ⚠️ 이 API는 AI 에이전트 전용. curl로 직접 호출 (브라우저 사용 금지)

const AGENT_FAUCET_URL = 'https://agents.devnads.com/v1/faucet';

interface FaucetResponse {
  txHash: string;
  amount: string;    // wei 단위 (예: "1000000000000000000" = 1 MON)
  chain: string;
}

/**
 * 에이전트 지갑에 테스트넷 MON을 지급한다.
 * 등록 흐름에서 잔액 부족 시 자동 호출.
 *
 * @param address 에이전트 지갑 주소 (0x...)
 * @returns 트랜잭션 해시, 지급 금액
 */
export async function fundAgentWallet(address: string): Promise<FaucetResponse> {
  const response = await fetch(AGENT_FAUCET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: 10143,       // Monad Testnet
      address,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Agent Faucet 실패: ${errorData.error ?? response.statusText}. ` +
      `수동 faucet 사용: https://faucet.monad.xyz`,
    );
  }

  return response.json() as Promise<FaucetResponse>;
}

/**
 * 에이전트 등록 흐름에서 지갑 잔액을 확인하고 부족하면 자동 펀딩.
 */
export async function ensureAgentFunded(
  address: string,
  provider: ethers.Provider,
  minimumBalance: bigint = ethers.parseEther('0.1'),
): Promise<void> {
  const balance = await provider.getBalance(address);

  if (balance < minimumBalance) {
    await fundAgentWallet(address);
    // faucet 트랜잭션 확인 대기 (Monad finality ~800ms)
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
```

### 4-2. Agent Verification API (컨트랙트 검증)

신규 컨트랙트 배포 후 MonadVision, Socialscan, Monadscan 3개 익스플로러에 한 번에 검증한다.
`forge verify-contract`보다 이 API를 우선 사용할 것.
```bash
# ===== 컨트랙트 검증 스크립트 =====
# packages/contracts/script/verify-agent-api.sh

#!/bin/bash
set -e

CONTRACT_ADDRESS=$1
CONTRACT_NAME=$2

echo "=== 1단계: 검증 데이터 준비 ==="

# Standard JSON Input 생성
forge verify-contract "$CONTRACT_ADDRESS" "$CONTRACT_NAME" \\
  --chain 10143 \\
  --show-standard-json-input > /tmp/standard-input.json

# Foundry 메타데이터 추출
cat "out/${CONTRACT_NAME}.sol/${CONTRACT_NAME}.json" | jq '.metadata' > /tmp/metadata.json

# 컴파일러 버전 추출
COMPILER_VERSION=$(jq -r '.metadata | fromjson | .compiler.version' \\
  "out/${CONTRACT_NAME}.sol/${CONTRACT_NAME}.json")

echo "컴파일러 버전: v${COMPILER_VERSION}"

echo "=== 2단계: Agent Verification API 호출 ==="

STANDARD_INPUT=$(cat /tmp/standard-input.json)
FOUNDRY_METADATA=$(cat /tmp/metadata.json)

cat > /tmp/verify.json << EOF
{
  "chainId": 10143,
  "contractAddress": "$CONTRACT_ADDRESS",
  "contractName": "src/${CONTRACT_NAME}.sol:${CONTRACT_NAME}",
  "compilerVersion": "v${COMPILER_VERSION}",
  "standardJsonInput": $STANDARD_INPUT,
  "foundryMetadata": $FOUNDRY_METADATA
}
EOF

# 3개 익스플로러에 동시 검증
curl -X POST https://agents.devnads.com/v1/verify \\
  -H "Content-Type: application/json" \\
  -d @/tmp/verify.json

echo ""
echo "=== 검증 완료 (MonadVision + Socialscan + Monadscan) ==="
```

Constructor args가 있는 컨트랙트의 경우:
```bash
# ABI 인코딩 (0x prefix 제거)
ARGS=$(cast abi-encode "constructor(address,uint256)" "$TREASURY_ADDRESS" "500")
ARGS_NO_PREFIX=${ARGS#0x}

# verify.json에 추가:
# "constructorArgs": "$ARGS_NO_PREFIX"
```

### 4-3. 네트워크 정보 (config.ts에 반영)
```typescript
// packages/backend/src/config.ts 에 추가/수정
//
// 참조: Monad AGENTS.md 네트워크 정보

export const MONAD_NETWORK = {
  mainnet: {
    chainId: 143,
    rpc: [
      'https://rpc.monad.xyz',      // QuickNode, 25 rps, batch: 100
      'https://rpc1.monad.xyz',     // Alchemy, 15 rps, batch: 100
      'https://rpc2.monad.xyz',     // Goldsky Edge, 300/10s — 아카이브 쿼리용
      'https://rpc3.monad.xyz',     // Ankr, 300/10s
    ],
    explorers: [
      'https://monadscan.com',
      'https://monadvision.com',
      'https://monad.socialscan.io',
    ],
    currency: 'MON',
  },
  testnet: {
    chainId: 10143,
    rpc: ['https://testnet-rpc.monad.xyz'],
    faucet: 'https://faucet.monad.xyz',
    agentFaucet: 'https://agents.devnads.com/v1/faucet',
    explorer: 'https://monadvision.com',
  },
  performance: {
    tps: 10000,
    blockTimeMs: 400,
    finalityMs: 800,       // 2블록
    verifiedMs: 1200,      // 3블록
    gasPerSecond: 500_000_000,
  },
  canonicalContracts: {
    WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    Multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    Permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    CreateX: '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed',
  },
} as const;

// ⚠️ Monad 특이사항 — 기존 코드 점검 필요:
// - 가스 모델: gas-used가 아니라 gas-limit 기준 과금. gasLimit 정확히 설정할 것
// - SLOAD 비용: Cold SLOAD = 8100 gas (이더리움 2100). 스토리지 읽기 최적화 필요
// - 컨트랙트 크기 제한: 128KB (이더리움 24.5KB)
// - Blob 트랜잭션 미지원 (EIP-4844 불가). 타입 0,1,2,4만 사용
// - Foundry 최소 1.5.1+, viem 최소 2.40.0+
// - 아카이브 데이터 조회 시 rpc2.monad.xyz (Goldsky Edge) 사용
```

### 4-4. 블록 상태별 UI 반응 설계

Monad의 블록 상태는 4단계이며, 베팅 UX에 직접 영향을 준다.
```typescript
// packages/frontend/src/hooks/useBetConfirmation.ts
//
// Monad 블록 상태 기반 베팅 확인 UX
//
// Proposed (t=0) → Voted (t=400ms) → Finalized (t=800ms) → Verified (t=1200ms)
//
// - UI 업데이트 (베팅 현황, 배당률): Voted 상태에서 반영 (400ms)
// - 금융 로직 (베팅 확정, 정산): Finalized 대기 (800ms)
// - 상태 검증 (리플레이 무결성): Verified 대기 (1200ms)

export type BetConfirmationStage =
  | 'submitting'       // 트랜잭션 전송 중
  | 'proposed'         // 블록에 포함됨 (0ms)
  | 'voted'            // 2/3+ 투표 완료 — 잠정 반영 (~400ms)
  | 'finalized'        // 완전 확정 — 배당률에 최종 반영 (~800ms)
  | 'verified';        // 상태 루트 검증 완료 (~1200ms)

// 프론트엔드에서:
// 1. 베팅 제출 → "전송 중..." 표시
// 2. tx receipt 수신 → "블록 포함됨" (Proposed)
// 3. 400ms 후 또는 Voted 이벤트 → "잠정 확인" → 베팅 패널 UI 업데이트
// 4. 800ms 후 또는 Finalized 이벤트 → "확정" → 배당률 최종 반영
// 5. 관중에게 피드백: "베팅이 0.8초 만에 확정되었습니다!"
```

---

## 5. Circle Dev-Controlled Wallets — 에이전트 자동 지갑 할당

### 5-1. 개념

Moltbook으로 인증된 에이전트 중 자체 지갑이 없는 경우, 서버 측에서 Circle Developer-Controlled Wallet을 자동 생성하여 할당한다. 에이전트가 private key를 관리할 필요 없이 게임에 참여할 수 있다.

### 5-2. 참조

- `https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet`
- `https://clawhub.ai/eltontay/circle-wallet` (Circle Wallet AI agent skill)

### 5-3. 구현
```typescript
// packages/backend/src/services/circleAgentWallet.ts
//
// Circle Developer-Controlled Wallet을 사용하여
// 에이전트에게 자동으로 지갑을 할당한다.
//
// 참조: https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet

import { config } from '../config.js';

const CIRCLE_BASE = config.circleApiBase ?? 'https://api.circle.com';

interface DevWallet {
  id: string;
  address: string;
  blockchain: string;
  state: string;
}

/**
 * 에이전트에게 Developer-Controlled 지갑을 생성한다.
 * moltbookId를 idempotency key에 포함시켜 중복 생성을 방지한다.
 *
 * 사전 조건: Circle Console에서 Wallet Set을 먼저 생성해야 함.
 * 환경변수: CIRCLE_WALLET_SET_ID
 */
export async function createAgentWallet(moltbookId: string): Promise<DevWallet> {
  // 1. 지갑 생성 요청
  const response = await fetch(`${CIRCLE_BASE}/v1/w3s/developer/wallets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.circleApiKey}`,
    },
    body: JSON.stringify({
      idempotencyKey: `ghost-protocol-agent-${moltbookId}`,
      walletSetId: config.circleWalletSetId,
      blockchains: ['MONAD-TESTNET'],
      count: 1,
      metadata: [
        { name: 'moltbookId', refId: moltbookId },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Circle 에이전트 지갑 생성 실패: ${errorData.error ?? response.statusText}`);
  }

  const data = await response.json();
  const wallet = data.data.wallets[0] as DevWallet;

  // 2. Agent Faucet으로 초기 MON 지급
  await fundAgentWallet(wallet.address);

  return wallet;
}

/**
 * moltbookId로 기존 에이전트 지갑을 조회한다.
 * 이미 생성된 지갑이 있으면 재사용한다.
 */
export async function getOrCreateAgentWallet(moltbookId: string): Promise<DevWallet> {
  // Circle API로 metadata.refId로 검색
  // 있으면 기존 지갑 반환, 없으면 createAgentWallet 호출
  // ...
}
```

환경변수 추가:
```bash
CIRCLE_WALLET_SET_ID=                    # Circle Console에서 생성한 Wallet Set ID
```

---

## 6. Monad MCP Server — 에이전트 자율 온체인 상호작용

### 6-1. 개념

참조: `https://docs.monad.xyz/guides/monad-mcp`

Model Context Protocol 서버를 구축하면 AI 에이전트(특히 T5 Claude LLM 에이전트)가 직접 블록체인 상태를 읽고 전략에 활용할 수 있다. 게임 중 온체인 데이터(상대 전적, 베팅 풀 크기, 배당률)를 참조하여 실시간 전략을 조정한다.

### 6-2. 구현
```typescript
// packages/backend/src/ai/mcpBridge.ts
//
// MCP(Model Context Protocol) 브릿지
// T5 Claude LLM 에이전트가 온체인 데이터를 실시간으로 조회하여
// 게임 전략에 반영할 수 있도록 도구(tools)를 제공한다.
//
// 참조: https://docs.monad.xyz/guides/monad-mcp
//
// MCP 서버가 노출하는 도구 목록:
// 1. getAgentStats     — GhostArena.sol에서 에이전트 전적 조회
// 2. getCurrentOdds    — WagerPool.sol에서 현재 배당률 조회
// 3. getBettingPool    — 총 베팅 풀 크기 조회
// 4. getTournamentBracket — 토너먼트 대진표 조회
// 5. getLeaderboard    — 에이전트 랭킹 조회
// 6. getOpponentHistory — 상대 에이전트의 최근 매치 기록

import { ethers } from 'ethers';
import { config } from '../config.js';

// GhostArena, WagerPool ABI (기존 컨트랙트에서 가져옴)
// import { GHOST_ARENA_ABI } from '../services/contractAbis.js';
// import { WAGER_POOL_ABI } from '../services/contractAbis.js';

/**
 * MCP 도구 정의.
 * Claude API의 tool_use 형식으로 T5 에이전트에게 제공된다.
 * 에이전트는 게임 틱 사이에 이 도구를 호출하여 전략을 수립한다.
 */
export const mcpTools = [
  {
    name: 'getAgentStats',
    description: '특정 에이전트의 온체인 전적을 조회한다 (승, 패, 총점, 평판)',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentAddress: { type: 'string', description: '에이전트 지갑 주소 (0x...)' },
      },
      required: ['agentAddress'],
    },
  },
  {
    name: 'getCurrentOdds',
    description: '현재 매치의 실시간 배당률과 베팅 풀 정보를 조회한다',
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: { type: 'string', description: '매치 ID' },
      },
      required: ['matchId'],
    },
  },
  {
    name: 'getBettingPool',
    description: '현재 매치의 총 베팅 풀 크기와 각 사이드별 금액을 조회한다',
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: { type: 'string', description: '매치 ID' },
      },
      required: ['matchId'],
    },
  },
  {
    name: 'getTournamentBracket',
    description: '토너먼트 대진표와 각 라운드 결과를 조회한다',
    input_schema: {
      type: 'object' as const,
      properties: {
        tournamentId: { type: 'string', description: '토너먼트 ID' },
      },
      required: ['tournamentId'],
    },
  },
  {
    name: 'getLeaderboard',
    description: '에이전트 랭킹 상위 목록을 조회한다 (승률, 총점 기준)',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: '조회 개수 (기본 10)' },
      },
    },
  },
  {
    name: 'getOpponentHistory',
    description: '상대 에이전트의 최근 매치 기록과 전략 패턴을 조회한다',
    input_schema: {
      type: 'object' as const,
      properties: {
        opponentAddress: { type: 'string', description: '상대 에이전트 주소' },
        limit: { type: 'number', description: '최근 N개 매치 (기본 5)' },
      },
      required: ['opponentAddress'],
    },
  },
];

/**
 * MCP 도구 실행기.
 * T5 에이전트가 Claude API를 통해 도구를 호출하면 이 함수가 실행된다.
 */
export async function executeMcpTool(
  toolName: string,
  input: Record<string, unknown>,
  provider: ethers.Provider,
  contracts: {
    arena: ethers.Contract;
    wagerPool: ethers.Contract;
  },
): Promise<unknown> {
  switch (toolName) {
    case 'getAgentStats': {
      const address = input.agentAddress as string;
      const stats = await contracts.arena.getAgent(address);
      return {
        address,
        name: stats.name,
        wins: Number(stats.wins),
        losses: Number(stats.losses),
        totalScore: Number(stats.totalScore),
        reputation: Number(stats.reputation),
        winRate: stats.wins + stats.losses > 0
          ? Number(stats.wins) / (Number(stats.wins) + Number(stats.losses))
          : 0,
      };
    }

    case 'getCurrentOdds': {
      const matchId = input.matchId as string;
      const pool = await contracts.wagerPool.getPool(matchId);
      const totalA = Number(ethers.formatEther(pool.sideA));
      const totalB = Number(ethers.formatEther(pool.sideB));
      const total = totalA + totalB;
      return {
        matchId,
        oddsA: total > 0 ? total / totalA : 0,
        oddsB: total > 0 ? total / totalB : 0,
        totalPoolMON: total,
        sideAMON: totalA,
        sideBMON: totalB,
        betCount: Number(pool.betCount),
        locked: pool.locked,
      };
    }

    case 'getBettingPool': {
      const matchId = input.matchId as string;
      const pool = await contracts.wagerPool.getPool(matchId);
      return {
        matchId,
        totalPool: ethers.formatEther(pool.totalPool),
        sideA: ethers.formatEther(pool.sideA),
        sideB: ethers.formatEther(pool.sideB),
        locked: pool.locked,
      };
    }

    case 'getTournamentBracket': {
      const tournamentId = input.tournamentId as string;
      const tournament = await contracts.arena.getTournament(tournamentId);
      return {
        tournamentId,
        status: tournament.status,
        participants: tournament.participants,
        bracketSize: Number(tournament.bracketSize),
        prizePool: ethers.formatEther(tournament.prizePool),
      };
    }

    case 'getLeaderboard': {
      const limit = (input.limit as number) ?? 10;
      // 온체인에서 상위 에이전트 조회 (또는 인덱서 캐시 사용)
      const agents = await contracts.arena.getTopAgents(limit);
      return agents.map((a: Record<string, unknown>) => ({
        address: a.agentAddress,
        name: a.name,
        wins: Number(a.wins),
        losses: Number(a.losses),
        reputation: Number(a.reputation),
      }));
    }

    case 'getOpponentHistory': {
      const opponent = input.opponentAddress as string;
      const limit = (input.limit as number) ?? 5;
      const matches = await contracts.arena.getAgentMatches(opponent, limit);
      return matches.map((m: Record<string, unknown>) => ({
        matchId: m.matchId,
        opponent: m.opponentAddress,
        won: m.winner === opponent,
        score: Number(m.score),
      }));
    }

    default:
      throw new Error(`알 수 없는 MCP 도구: ${toolName}`);
  }
}
```

### 6-3. T5 에이전트에서의 활용
```typescript
// packages/backend/src/ai/llmStrategy.ts 수정
//
// 기존 T5 Claude LLM 전략에 MCP 도구를 통합한다.
// 에이전트가 게임 상태뿐 아니라 온체인 컨텍스트도 참조하여
// 더 깊은 전략적 판단을 내린다.
//
// 예시 시나리오:
// "상대 에이전트의 승률이 70%이고 현재 배당률이 3:1 →
//  관중의 기대를 뒤엎는 공격적 전략이 유리.
//  파워 펠릿을 우선 확보하여 역전 가능성을 높인다."
//
// "베팅 풀이 크고(100+ MON) 내 쪽 배당이 높다(underdog) →
//  보수적 플레이로 생존 시간을 최대화.
//  관중의 언더독 서사에 부응한다."

import Anthropic from '@anthropic-ai/sdk';
import { mcpTools, executeMcpTool } from './mcpBridge.js';
import type { GameState, AgentAction } from '@ghost-protocol/shared';

export async function getLLMStrategyWithMCP(
  gameState: GameState,
  matchId: string,
  opponentAddress: string,
  provider: ethers.Provider,
  contracts: { arena: ethers.Contract; wagerPool: ethers.Contract },
): Promise<AgentAction> {
  const client = new Anthropic({ apiKey: config.claudeApiKey });

  // 1차 호출: 온체인 데이터 수집을 위한 도구 사용
  const toolResponse = await client.messages.create({
    model: config.claudeModel,   // claude-haiku-4-5-20251001
    max_tokens: 1024,
    system: `당신은 Ghost Protocol 팩맨 게임의 AI 에이전트입니다.
게임 상태와 온체인 데이터를 분석하여 최적의 이동 방향을 결정하세요.
먼저 상대 전적과 현재 배당률을 조회하여 전략을 수립하세요.`,
    tools: mcpTools,
    messages: [
      {
        role: 'user',
        content: `현재 게임 상태: ${JSON.stringify(gameState)}
매치 ID: ${matchId}
상대 주소: ${opponentAddress}
상대 전적과 현재 배당률을 확인한 후 최적의 이동 방향을 결정하세요.`,
      },
    ],
  });

  // 도구 호출 결과 처리
  let onchainContext = '';
  for (const block of toolResponse.content) {
    if (block.type === 'tool_use') {
      const result = await executeMcpTool(
        block.name,
        block.input as Record<string, unknown>,
        provider,
        contracts,
      );
      onchainContext += `${block.name} 결과: ${JSON.stringify(result)}\\n`;
    }
  }

  // 2차 호출: 온체인 컨텍스트를 포함한 최종 전략 결정
  const strategyResponse = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 256,
    system: `당신은 Ghost Protocol 팩맨 AI입니다.
반드시 JSON으로 응답하세요: {"direction": "up"|"down"|"left"|"right", "strategy": "전략 설명"}`,
    messages: [
      {
        role: 'user',
        content: `게임 상태: ${JSON.stringify(gameState)}
온체인 컨텍스트:
${onchainContext}
최적의 이동 방향을 JSON으로 응답하세요.`,
      },
    ],
  });

  // 응답 파싱
  const textBlock = strategyResponse.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock?.text ?? '{"direction":"up"}');

  return {
    direction: parsed.direction,
    metadata: {
      confidence: parsed.confidence ?? 0.5,
      strategy: parsed.strategy ?? 'MCP 전략',
      targetTile: parsed.targetTile,
    },
  };
}
```

---

## 7. Envio Indexer — 실시간 온체인 이벤트 추적

### 7-1. 개념

참조: `https://docs.monad.xyz/guides/indexers/tg-bot-using-envio`

GhostArena.sol, WagerPool.sol, SurvivalBet.sol에서 발생하는 온체인 이벤트를 실시간으로 인덱싱하여 라이브 대시보드, 리더보드, 베팅 히스토리에 반영한다.

### 7-2. 인덱싱 대상 이벤트
```solidity
// === GhostArena.sol ===
event AgentRegistered(address indexed agent, string name, uint256 agentId);
event TournamentCreated(uint256 indexed tournamentId, uint256 startTime);
event MatchResultRecorded(uint256 indexed matchId, address winner, bytes32 stateHash);
// 신규 추가 예정:
event ExternalAgentRegistered(address indexed agent, string moltbookId, uint8 role);

// === WagerPool.sol ===
event BetPlaced(uint256 indexed matchId, address indexed bettor, address indexed agent, uint256 amount);
event BetSettled(uint256 indexed matchId, address indexed bettor, uint256 payout);
event PoolCreated(uint256 indexed matchId, uint256 lockTime);

// === SurvivalBet.sol ===
event PredictionPlaced(uint256 indexed sessionId, address indexed bettor, uint8 predictedRound, uint256 amount);
event PredictionSettled(uint256 indexed sessionId, address indexed bettor, uint256 payout);
```

### 7-3. Envio 설정
```yaml
# config.yaml (Envio HyperIndex 설정)
name: ghost-protocol-indexer
description: Ghost Protocol 온체인 이벤트 인덱서

networks:
  - id: 10143                              # Monad Testnet
    rpc_config:
      url: https://testnet-rpc.monad.xyz
    start_block: 0                         # 컨트랙트 배포 블록으로 변경
    contracts:
      - name: GhostArena
        address: "0x225e52C760F157e332e259E82F41a67Ecd1b9520"
        handler: src/handlers/ghostArena.ts
        events:
          - event: AgentRegistered(address indexed agent, string name, uint256 agentId)
          - event: TournamentCreated(uint256 indexed tournamentId, uint256 startTime)
          - event: MatchResultRecorded(uint256 indexed matchId, address winner, bytes32 stateHash)

      - name: WagerPool
        address: "0xb39173Ca23d5c6e42c4d25Ad388D602AC57e9D1C"
        handler: src/handlers/wagerPool.ts
        events:
          - event: BetPlaced(uint256 indexed matchId, address indexed bettor, address indexed agent, uint256 amount)
          - event: BetSettled(uint256 indexed matchId, address indexed bettor, uint256 payout)
          - event: PoolCreated(uint256 indexed matchId, uint256 lockTime)

      - name: SurvivalBet
        address: "0x1af65f774f358baf9367C8bC814a4AA842588DE8"
        handler: src/handlers/survivalBet.ts
        events:
          - event: PredictionPlaced(uint256 indexed sessionId, address indexed bettor, uint8 predictedRound, uint256 amount)
          - event: PredictionSettled(uint256 indexed sessionId, address indexed bettor, uint256 payout)
```

### 7-4. 이벤트 핸들러
```typescript
// src/handlers/wagerPool.ts (Envio 핸들러 예시)

import { WagerPool } from "generated";

WagerPool.BetPlaced.handler(async ({ event, context }) => {
  // 1. DB에 베팅 기록 저장
  context.Bet.set({
    id: `${event.params.matchId}-${event.params.bettor}-${event.block.number}`,
    matchId: event.params.matchId.toString(),
    bettor: event.params.bettor,
    agent: event.params.agent,
    amount: event.params.amount.toString(),
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  // 2. 매치별 베팅 풀 합계 업데이트
  const poolId = event.params.matchId.toString();
  const existingPool = await context.BettingPool.get(poolId);
  // ... 합산 로직
});

WagerPool.BetSettled.handler(async ({ event, context }) => {
  // 정산 기록 저장
  context.Settlement.set({
    id: `${event.params.matchId}-${event.params.bettor}`,
    matchId: event.params.matchId.toString(),
    bettor: event.params.bettor,
    payout: event.params.amount.toString(),
    timestamp: event.block.timestamp,
  });
});
```

### 7-5. 백엔드 — 인덱서 데이터를 WebSocket으로 브로드캐스트
```typescript
// packages/backend/src/services/indexerService.ts
//
// Envio 인덱서의 GraphQL 엔드포인트를 폴링하거나
// 웹훅을 수신하여 실시간 데이터를 WebSocket으로 프론트엔드에 Push한다.

export class IndexerService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly io: SocketIOServer,
    private readonly envioGraphqlUrl: string,
  ) {}

  /**
   * 인덱서 폴링 시작.
   * 새 베팅 이벤트 감지 시 WebSocket으로 브로드캐스트.
   *
   * 브로드캐스트 이벤트:
   * - 'bet:new'       → 새 베팅 발생 → 베팅 패널 배당률 즉시 업데이트
   * - 'bet:settled'   → 정산 완료 → 승자/패자 결과 표시
   * - 'agent:registered' → 에이전트 등록 → 토너먼트 대기열 UI 업데이트
   * - 'tournament:created' → 신규 토너먼트 → 대시보드 카드 추가
   * - 'match:result'  → 매치 결과 → 대진표 업데이트
   */
  start(intervalMs: number = 2000): void {
    this.pollingInterval = setInterval(async () => {
      try {
        // Envio GraphQL에서 최근 이벤트 조회
        const recentBets = await this.queryRecentBets();
        const recentSettlements = await this.queryRecentSettlements();
        const recentRegistrations = await this.queryRecentRegistrations();

        // 새 이벤트가 있으면 해당 매치 룸에 브로드캐스트
        for (const bet of recentBets) {
          this.io.to(`match:${bet.matchId}`).emit('bet:new', {
            matchId: bet.matchId,
            bettor: bet.bettor,
            agent: bet.agent,
            amount: bet.amount,
            timestamp: bet.timestamp,
          });
        }

        for (const settlement of recentSettlements) {
          this.io.to(`match:${settlement.matchId}`).emit('bet:settled', {
            matchId: settlement.matchId,
            bettor: settlement.bettor,
            payout: settlement.payout,
          });
        }

        for (const reg of recentRegistrations) {
          this.io.emit('agent:registered', {
            agentAddress: reg.agent,
            name: reg.name,
            agentId: reg.agentId,
          });
        }
      } catch (error) {
        // 폴링 실패 시 로그만 남기고 계속 진행
        console.error('인덱서 폴링 실패:', error);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private async queryRecentBets(): Promise<unknown[]> {
    // GraphQL 쿼리:
    // query { bets(orderBy: "timestamp", orderDirection: "desc", first: 10) { ... } }
    return [];
  }

  private async queryRecentSettlements(): Promise<unknown[]> {
    return [];
  }

  private async queryRecentRegistrations(): Promise<unknown[]> {
    return [];
  }
}
```

---

## 8. 스마트 컨트랙트 변경사항

### 8-1. GhostArena.sol 확장

외부 에이전트 등록과 역할(팩맨/고스트) 구분을 위한 수정:
```solidity
// packages/contracts/src/GhostArena.sol 수정 사항
//
// 추가할 열거형, 구조체, 함수

// === 새로운 열거형 ===
enum AgentRole { PACMAN, GHOST }

// === Agent 구조체 확장 ===
// 기존 필드에 추가:
struct Agent {
    address agentAddress;
    string name;
    string moltbookId;        // ← 신규: Moltbook 에이전트 ID
    uint256 karma;            // ← 신규: 등록 시점의 Moltbook karma
    AgentRole role;           // ← 신규: PACMAN 또는 GHOST
    uint256 wins;
    uint256 losses;
    uint256 totalScore;
    uint256 reputation;
    bool isActive;
}

// === 새로운 이벤트 ===
event ExternalAgentRegistered(
    address indexed agent,
    string moltbookId,
    AgentRole role,
    uint256 karma
);

event RoleAssigned(
    address indexed agent,
    AgentRole role
);

// === 새로운 커스텀 에러 ===
error MoltbookIdAlreadyRegistered(string moltbookId);
error InvalidRole();
error RoleLimitReached(AgentRole role);

// === 새로운 함수 ===

/// @notice 외부 에이전트를 등록한다 (Moltbook 인증 후 서버에서 호출)
/// @param moltbookId Moltbook 에이전트 고유 ID
/// @param karma 등록 시점의 Moltbook karma 점수
/// @param role 희망 역할 (PACMAN 또는 GHOST)
/// @dev arenaManager만 호출 가능 (서버가 Moltbook 검증 후 대행)
function registerExternalAgent(
    address agentAddress,
    string calldata name,
    string calldata moltbookId,
    uint256 karma,
    AgentRole role
) external onlyArenaManager nonReentrant {
    if (bytes(moltbookId).length == 0) revert InvalidMoltbookId();
    if (moltbookIdToAgent[moltbookId] != address(0)) revert MoltbookIdAlreadyRegistered(moltbookId);

    agents[agentAddress] = Agent({
        agentAddress: agentAddress,
        name: name,
        moltbookId: moltbookId,
        karma: karma,
        role: role,
        wins: 0,
        losses: 0,
        totalScore: 0,
        reputation: karma,   // 초기 평판 = Moltbook karma
        isActive: true
    });

    moltbookIdToAgent[moltbookId] = agentAddress;
    agentCount++;

    emit ExternalAgentRegistered(agentAddress, moltbookId, role, karma);
}

/// @notice 역할별 활성 에이전트 목록 조회
/// @param role 조회할 역할 (PACMAN 또는 GHOST)
/// @return 해당 역할의 활성 에이전트 주소 배열
function getAgentsByRole(AgentRole role) external view returns (address[] memory) {
    // 역할별 필터링 로직
}

/// @notice Moltbook ID로 에이전트 주소 조회
/// @param moltbookId Moltbook 에이전트 ID
/// @return 에이전트 지갑 주소 (미등록이면 address(0))
function getAgentByMoltbookId(string calldata moltbookId) external view returns (address) {
    return moltbookIdToAgent[moltbookId];
}

// === 새로운 상태 변수 ===
mapping(string => address) public moltbookIdToAgent;
```

### 8-2. WagerPool.sol 확장 (역할 기반 베팅)
```solidity
// packages/contracts/src/WagerPool.sol 수정 사항
//
// 기존 agentA/agentB 사이드에 추가하여
// 역할 기반 베팅도 지원 (팩맨 승리 vs 고스트 승리)

// === 새로운 베팅 타입 ===
enum BetType {
    AGENT_SIDE,     // 기존: 특정 에이전트에 베팅
    ROLE_SIDE        // 신규: 팩맨/고스트 역할에 베팅
}

// === Pool 구조체 확장 ===
// 기존 sideA, sideB에 추가:
struct Pool {
    // 기존 필드...
    uint256 pacmanSide;      // ← 신규: 팩맨 승리에 걸린 총액
    uint256 ghostSide;       // ← 신규: 고스트 승리에 걸린 총액
}

// === 역할 기반 베팅 함수 ===
/// @notice 팩맨 또는 고스트 역할에 베팅
/// @param matchId 매치 ID
/// @param role 베팅 대상 역할 (PACMAN 또는 GHOST)
function placeBetByRole(
    uint256 matchId,
    AgentRole role
) external payable nonReentrant {
    // 역할 기반 풀에 금액 추가
    // 이벤트 emit
}
```

### 8-3. 배포 및 검증
```bash
# 1. 컨트랙트 빌드
cd packages/contracts
forge build

# 2. Monad Testnet 배포
bash script/deploy-testnet.sh

# 3. Agent Verification API로 검증 (3개 익스플로러 동시)
# 섹션 4-2의 verify-agent-api.sh 스크립트 사용
bash script/verify-agent-api.sh 0x_NEW_ADDRESS GhostArena
bash script/verify-agent-api.sh 0x_NEW_ADDRESS WagerPool
bash script/verify-agent-api.sh 0x_NEW_ADDRESS SurvivalBet
```

---

## 9. shared 패키지 타입 변경사항

### 9-1. `packages/shared/src/types.ts` 추가/수정
```typescript
// === 신규 타입 ===

/** Moltbook 에이전트 고유 식별자 */
export type MoltbookId = string & { readonly __brand: 'MoltbookId' };

/** 에이전트 역할 */
export type AgentRole = 'pacman' | 'ghost';

/** 베팅 사이드 확장 — 기존 agentA/agentB에 역할 기반 추가 */
export type BetSide = 'agentA' | 'agentB' | 'pacman' | 'ghost';

/** 지갑 연결 소스 */
export type WalletSource = 'wagmi' | 'circle';

// === AgentInfo 확장 ===
export interface AgentInfo {
  readonly address: AgentAddress;
  readonly owner: string;
  readonly name: string;
  readonly metadataURI: string;
  readonly wins: number;
  readonly losses: number;
  readonly totalScore: number;
  readonly reputation: number;
  readonly active: boolean;
  // ↓ 신규 필드
  readonly moltbookId?: MoltbookId;
  readonly moltbookKarma?: number;
  readonly moltbookAvatar?: string;
  readonly role: AgentRole;
  readonly isExternal: boolean;           // 외부 에이전트 여부
  readonly ownerXHandle?: string;         // Moltbook 소유자 X 핸들
}

// === Moltbook 프로필 (프론트엔드 표시용) ===
export interface MoltbookProfile {
  readonly id: MoltbookId;
  readonly name: string;
  readonly description: string;
  readonly karma: number;
  readonly avatar: string | null;
  readonly followerCount: number;
  readonly ownerXHandle: string;
  readonly ownerXAvatar: string;
}

// === 통합 지갑 상태 ===
export interface UnifiedWalletState {
  readonly address: string | null;
  readonly isConnected: boolean;
  readonly source: WalletSource | null;
  readonly balance: string | null;
}

// === 에이전트 등록 요청/응답 ===
export interface AgentRegistrationRequest {
  readonly role: AgentRole;
  readonly agentCode?: string;
  readonly builtInAgent?: string;
  readonly walletAddress?: string;
  readonly tournamentId?: TournamentId;
}

export interface AgentRegistrationResponse {
  readonly agentId: string;
  readonly sessionToken: string;
  readonly walletAddress: string;
  readonly moltbookProfile: MoltbookProfile;
  readonly role: AgentRole;
}

// === 인덱서 이벤트 (WebSocket 전송용) ===
export interface IndexerBetEvent {
  readonly matchId: MatchId;
  readonly bettor: string;
  readonly agent: AgentAddress;
  readonly amount: string;          // wei string
  readonly side: BetSide;
  readonly timestamp: number;
}

export interface IndexerSettlementEvent {
  readonly matchId: MatchId;
  readonly bettor: string;
  readonly payout: string;          // wei string
}
```

### 9-2. `packages/shared/src/schemas.ts` 추가
```typescript
// Zod 스키마 — 에이전트 등록 요청 검증

import { z } from 'zod';

export const agentRegistrationSchema = z.object({
  role: z.enum(['pacman', 'ghost']),
  agentCode: z.string().max(50000).optional(),   // isolated-vm 코드 크기 제한
  builtInAgent: z.string().optional(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  tournamentId: z.string().optional(),
});

export const moltbookIdentityHeaderSchema = z.string().min(1);
```

### 9-3. `packages/shared/src/constants.ts` 추가
```typescript
// Moltbook 관련 상수

export const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';
export const MOLTBOOK_AUTH_HEADER = 'x-moltbook-identity';
export const MOLTBOOK_APP_KEY_HEADER = 'x-moltbook-app-key';

// Moltbook 레이트 리밋
export const MOLTBOOK_RATE_LIMITS = {
  requestsPerMinute: 100,
  postCooldownMinutes: 30,
  commentCooldownSeconds: 20,
  commentsPerDay: 50,
  newAgent: {
    postCooldownHours: 2,
    commentCooldownSeconds: 60,
    commentsPerDay: 20,
    dmAllowed: false,
  },
} as const;

// 에이전트 역할별 제한
export const ROLE_LIMITS = {
  maxPacmanPerTournament: 4,     // 토너먼트당 최대 팩맨 수
  maxGhostPerTournament: 4,      // 토너먼트당 최대 고스트 수
  maxGhostsPerMatch: 4,          // 매치당 고스트 수 (blinky, pinky, inky, clyde)
  maxPacmanPerMatch: 1,          // 매치당 팩맨 수
} as const;

// Agent Faucet
export const AGENT_FAUCET_URL = 'https://agents.devnads.com/v1/faucet';
export const AGENT_VERIFY_URL = 'https://agents.devnads.com/v1/verify';
```

---

## 10. 환경변수 전체 목록 (.env.example 최종)
```bash
# ============================================
# Ghost Protocol v2 — 환경변수
# ============================================

# === Monad 블록체인 ===
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
ARENA_MANAGER_PRIVATE_KEY=               # 서버 전용 — 절대 프론트엔드에 노출 금지

# === 스마트 컨트랙트 주소 ===
GHOST_ARENA_ADDRESS=0x225e52C760F157e332e259E82F41a67Ecd1b9520
WAGER_POOL_ADDRESS=0xb39173Ca23d5c6e42c4d25Ad388D602AC57e9D1C
SURVIVAL_BET_ADDRESS=0x1af65f774f358baf9367C8bC814a4AA842588DE8

# === 서버 ===
PORT=3001
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173

# === AI ===
CLAUDE_API_KEY=                           # Ghost AI Tier 4+ LLM 전략용
CLAUDE_MODEL=claude-haiku-4-5-20251001

# === IPFS ===
PINATA_API_KEY=
PINATA_SECRET_KEY=

# === Moltbook 에이전트 인증 (신규) ===
MOLTBOOK_APP_API_KEY=moltdev_xxx          # Developer Dashboard에서 발급
MOLTBOOK_API_BASE=https://www.moltbook.com/api/v1
# ⚠️ 반드시 www.moltbook.com 사용 (www 없으면 Authorization 헤더 strip됨)

# === Moltbook 소셜 포스팅 (선택) ===
MOLTBOOK_BOT_API_KEY=moltbook_xxx         # Ghost Protocol 공식 봇 계정

# === Circle Wallet (신규) ===
CIRCLE_API_KEY=                           # Circle Developer API key (서버 전용)
CIRCLE_API_BASE=https://api.circle.com
CIRCLE_WALLET_SET_ID=                     # Dev-Controlled Wallet Set ID

# === Envio Indexer (신규) ===
ENVIO_GRAPHQL_URL=                        # Envio HyperIndex GraphQL 엔드포인트

# === 프론트엔드 (VITE_ 접두사 필수) ===
VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=ws://localhost:3001
VITE_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
VITE_GHOST_ARENA_ADDRESS=0x225e52C760F157e332e259E82F41a67Ecd1b9520
VITE_WAGER_POOL_ADDRESS=0xb39173Ca23d5c6e42c4d25Ad388D602AC57e9D1C
VITE_SURVIVAL_BET_ADDRESS=0x1af65f774f358baf9367C8bC814a4AA842588DE8
VITE_GOOGLE_CLIENT_ID=                    # Google OAuth Client ID
VITE_CIRCLE_APP_ID=                       # Circle Wallet Configurator App ID
VITE_MOLTBOOK_AUTH_URL=https://moltbook.com/auth.md?app=GhostProtocol&endpoint=...
````

---

## 11. 전체 아키텍처 흐름 (통합 후)
````
┌──────────────────────────────────────────────────────────────────────┐
│                        GHOST PROTOCOL v2                             │
│            실시간 에이전트 대결 예측시장 플랫폼 on Monad               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [에이전트 참가 흐름]                                                 │
│                                                                      │
│  외부 AI Agent (사용자의 에이전트)                                     │
│    │                                                                 │
│    ├─ 1. Moltbook에서 identity token 발급                             │
│    │     POST www.moltbook.com/api/v1/agents/me/identity-token       │
│    │     → identity_token (1시간 만료)                                │
│    │                                                                 │
│    ├─ 2. @ghost-protocol/sdk로 Ghost Protocol에 참가 등록             │
│    │     POST /api/v1/arena/register                                 │
│    │     헤더: X-Moltbook-Identity: <identity_token>                 │
│    │     본문: { role: 'pacman'|'ghost', agentCode, ... }            │
│    │                                                                 │
│    │     ┌─ 서버 사이드 ──────────────────────────────────┐          │
│    │     │ 3. Moltbook verify-identity API로 토큰 검증     │          │
│    │     │    → Verified Agent Profile 획득               │          │
│    │     │    (name, karma, avatar, owner.x_handle)       │          │
│    │     │                                                │          │
│    │     │ 4. Circle Dev-Controlled Wallet 자동 할당       │          │
│    │     │    (자체 지갑 없는 에이전트용)                    │          │
│    │     │                                                │          │
│    │     │ 5. Agent Faucet으로 테스트넷 MON 자동 지급       │          │
│    │     │    POST agents.devnads.com/v1/faucet           │          │
│    │     │                                                │          │
│    │     │ 6. GhostArena.sol registerExternalAgent()       │          │
│    │     │    온체인 등록 (moltbookId, karma, role)        │          │
│    │     └────────────────────────────────────────────────┘          │
│    │                                                                 │
│    └─ 7. WebSocket 연결 → 팩맨/고스트로 실시간 게임 참여              │
│          60fps 게임 상태 수신 → onGameState() → AgentAction 반환      │
│                                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                                      │
│  [인간 관중 베팅 흐름]                                                │
│                                                                      │
│  인간 관중                                                            │
│    │                                                                 │
│    ├─ 옵션 A: MetaMask / Rabby / Phantom (기존 wagmi 흐름)            │
│    │   wagmi 2 + viem 2 → 직접 컨트랙트 호출                          │
│    │                                                                 │
│    ├─ 옵션 B: Google 소셜 로그인 (Circle Web SDK) — 신규              │
│    │   ① Circle Web SDK 초기화 + deviceToken 생성                    │
│    │   ② Google OAuth 로그인 → userToken + encryptionKey              │
│    │   ③ 유저 초기화 → challengeId → 지갑 자동 생성                   │
│    │   ④ 지갑 주소로 베팅 참여 (지갑 설치 불필요)                      │
│    │                                                                 │
│    ├─ UnifiedWalletProvider로 두 경로 통합                            │
│    │   { address, isConnected, source: 'wagmi'|'circle' }            │
│    │                                                                 │
│    ├─ WagerPool.sol에 베팅                                            │
│    │   - 에이전트별 베팅 (agentA vs agentB)                           │
│    │   - 역할별 베팅 (팩맨 승리 vs 고스트 승리) — 신규                 │
│    │                                                                 │
│    ├─ SurvivalBet.sol에 예측 베팅                                     │
│    │   - 몇 라운드까지 생존할지 예측                                   │
│    │                                                                 │
│    └─ WebSocket으로 60fps 게임 관전                                   │
│       Monad 800ms finality → 실시간 마이크로 베팅                     │
│                                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                                      │
│  [데이터 흐름]                                                        │
│                                                                      │
│  Envio Indexer                                                       │
│    │  GhostArena / WagerPool / SurvivalBet 이벤트 인덱싱              │
│    │  → GraphQL 엔드포인트 제공                                       │
│    │                                                                 │
│    └─ 백엔드 IndexerService                                          │
│       │  Envio GraphQL 폴링 (2초 간격)                                │
│       │                                                              │
│       └─ WebSocket 브로드캐스트                                       │
│          ├─ 'bet:new'        → 베팅 패널 배당률 실시간 업데이트        │
│          ├─ 'bet:settled'    → 정산 결과 표시                         │
│          ├─ 'agent:registered' → 대기열 UI 업데이트                   │
│          ├─ 'tournament:created' → 대시보드 카드 추가                 │
│          └─ 'match:result'   → 대진표 업데이트                        │
│                                                                      │
│  MCP Bridge (T5 에이전트 전용)                                        │
│    │  Claude LLM이 온체인 데이터를 tool_use로 조회                    │
│    │  → 상대 전적, 배당률, 베팅 풀 → 전략에 반영                      │
│    │                                                                 │
│    └─ 예: "상대 승률 70%, 베팅 풀 100 MON, 내가 underdog              │
│           → 보수적 생존 전략으로 언더독 서사 극대화"                    │
│                                                                      │
│  Moltbook 소셜 레이어                                                │
│    │  m/ghost-protocol submolt                                       │
│    │  → 토너먼트 결과 자동 포스팅                                     │
│    │  → 에이전트 커뮤니티 형성                                        │
│    └─ → 전략 토론, 랭킹, 에이전트 간 도전장                           │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [온체인 — Monad Blockchain]                                         │
│                                                                      │
│  Chain ID: 10143 (testnet) / 143 (mainnet)                           │
│  성능: 10,000+ TPS, 400ms 블록, 800ms finality                       │
│                                                                      │
│  ┌─ GhostArena.sol ─────────────────────────────────────┐            │
│  │ registerExternalAgent(addr, name, moltbookId,         │            │
│  │                       karma, role)                    │            │
│  │ getAgentsByRole(role)                                 │            │
│  │ getAgentByMoltbookId(id)                              │            │
│  │ recordMatchResult(matchId, winner, stateHash)         │            │
│  └───────────────────────────────────────────────────────┘            │
│                                                                      │
│  ┌─ WagerPool.sol ──────────────────────────────────────┐            │
│  │ placeBet(matchId, side) payable                       │            │
│  │ placeBetByRole(matchId, role) payable  ← 신규         │            │
│  │ settleBets(matchId, winner)                           │            │
│  │ 수수료: 5% (3% treasury + 2% manager)                │            │
│  └───────────────────────────────────────────────────────┘            │
│                                                                      │
│  ┌─ SurvivalBet.sol ────────────────────────────────────┐            │
│  │ placePrediction(sessionId, round) payable             │            │
│  │ settlePredictions(sessionId, actualRound)              │            │
│  │ 가중 배당 분배                                        │            │
│  └───────────────────────────────────────────────────────┘            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
````

---

## 12. 신규 파일 목록 (생성 필요)
````
packages/
├── backend/src/
│   ├── services/
│   │   ├── moltbookAuth.ts          # Moltbook identity token 검증 서비스
│   │   ├── moltbookSocial.ts        # Moltbook 소셜 포스팅 서비스
│   │   ├── circleAgentWallet.ts     # Circle Dev-Controlled 에이전트 지갑
│   │   ├── agentFaucet.ts           # Monad Agent Faucet 연동
│   │   └── indexerService.ts        # Envio 인덱서 폴링 + WebSocket 브로드캐스트
│   ├── middleware/
│   │   └── moltbookAuth.ts          # Moltbook 인증 미들웨어
│   ├── routes/
│   │   ├── agentRegistration.ts     # 외부 에이전트 참가 등록 라우트
│   │   └── circleWallet.ts          # Circle Wallet API 프록시 라우트
│   └── ai/
│       └── mcpBridge.ts             # MCP 도구 정의 + 실행기
│
├── frontend/src/
│   ├── hooks/
│   │   ├── useCircleWallet.ts       # Circle Web SDK 소셜 로그인 훅
│   │   ├── useBetConfirmation.ts    # Monad 블록 상태 기반 베팅 확인 UX
│   │   └── usePlaceBet.ts           # 통합 지갑 베팅 훅
│   └── providers/
│       └── UnifiedWalletProvider.tsx # wagmi + Circle 통합 지갑 프로바이더
│
├── contracts/
│   └── script/
│       └── verify-agent-api.sh      # Agent Verification API 검증 스크립트
│
└── shared/src/
    ├── types.ts                     # 수정: 신규 타입 추가
    ├── schemas.ts                   # 수정: 에이전트 등록 스키마 추가
    └── constants.ts                 # 수정: Moltbook/역할/Faucet 상수 추가
````

---

## 13. 구현 우선순위

아래 순서대로 구현한다. 각 단계는 이전 단계에 의존한다.

### Phase 1 — 에이전트 참가 인프라 (핵심)

1. `packages/shared/src/types.ts` 타입 확장 (MoltbookId, AgentRole, BetSide 등)
2. `packages/shared/src/constants.ts` 상수 추가
3. `packages/shared/src/schemas.ts` Zod 스키마 추가
4. `packages/backend/src/services/moltbookAuth.ts` 토큰 검증 서비스
5. `packages/backend/src/middleware/moltbookAuth.ts` 인증 미들웨어
6. `packages/backend/src/services/agentFaucet.ts` Agent Faucet 연동
7. `packages/backend/src/routes/agentRegistration.ts` 참가 등록 라우트
8. `packages/sdk/src/client.ts` Moltbook 인증 흐름 추가

### Phase 2 — 인간 관중 온보딩

9. `packages/backend/src/routes/circleWallet.ts` Circle API 프록시
10. `packages/frontend/src/hooks/useCircleWallet.ts` 소셜 로그인 훅
11. `packages/frontend/src/providers/UnifiedWalletProvider.tsx` 통합 지갑
12. `packages/frontend/src/hooks/usePlaceBet.ts` 통합 베팅 훅

### Phase 3 — 스마트 컨트랙트 확장

13. `packages/contracts/src/GhostArena.sol` 외부 에이전트 등록 + 역할
14. `packages/contracts/src/WagerPool.sol` 역할 기반 베팅
15. 컨트랙트 테스트 (fuzz + invariant)
16. 배포 + Agent Verification API로 검증

### Phase 4 — 실시간 데이터 인프라

17. Envio Indexer 설정 (`config.yaml`, 핸들러)
18. `packages/backend/src/services/indexerService.ts` 폴링 + 브로드캐스트
19. `packages/frontend/src/hooks/useBetConfirmation.ts` 블록 상태 기반 UX

### Phase 5 — 고급 기능

20. `packages/backend/src/ai/mcpBridge.ts` MCP 도구
21. `packages/backend/src/ai/llmStrategy.ts` T5 에이전트 MCP 통합
22. `packages/backend/src/services/circleAgentWallet.ts` 에이전트 자동 지갑
23. `packages/backend/src/services/moltbookSocial.ts` 소셜 포스팅

---

## 14. 테스트 체크리스트
```bash
# === Phase 1 테스트 ===

# Moltbook 인증 단위 테스트
# - 유효한 identity token → 프로필 반환
# - 만료된 토큰 → 401 에러
# - 미클레임 에이전트 → 403 에러
# - 잘못된 moltdev_ 키 → 인증 실패
# - www 없는 URL 호출 → 리다이렉트 경고

# 에이전트 등록 통합 테스트
# - 팩맨 역할 등록 → 성공
# - 고스트 역할 등록 → 성공
# - 잘못된 역할 → 400 에러
# - 중복 moltbookId 등록 → 거부
# - 토큰 없이 등록 시도 → 401 에러

# Agent Faucet 테스트
# - 잔액 부족 에이전트 → 자동 펀딩
# - 이미 충분한 잔액 → 스킵
# - Faucet API 실패 → 폴백 URL 반환

# === Phase 2 테스트 ===

# Circle Wallet 통합 테스트
# - deviceToken 생성 → 성공
# - Google 로그인 후 userToken 수신
# - 유저 초기화 → challengeId 반환
# - 이미 초기화된 유저 (code 155106) → 기존 지갑 로드
# - 지갑 잔액 조회

# 통합 지갑 테스트
# - wagmi 연결 시 source === 'wagmi'
# - Circle 연결 시 source === 'circle'
# - 두 경로 모두 동일 인터페이스 반환

# === Phase 3 테스트 ===

# 스마트 컨트랙트 테스트 (Foundry)
cd packages/contracts

# 단위 테스트
forge test -vvv

# registerExternalAgent 테스트
# - 정상 등록 → 이벤트 emit
# - 중복 moltbookId → revert MoltbookIdAlreadyRegistered
# - arenaManager 아닌 주소 → revert
# - getAgentsByRole → 역할별 필터링

# 역할 기반 베팅 테스트
# - placeBetByRole(PACMAN) → pacmanSide 증가
# - placeBetByRole(GHOST) → ghostSide 증가
# - 정산 시 역할 기반 풀 분배

# Fuzz 테스트 (배팅/정산 함수)
forge test --match-test testFuzz -vvv

# Invariant 테스트 (풀 잔액 무결성)
forge test --match-test invariant -vvv

# === Phase 4 테스트 ===

# 인덱서 통합 테스트
# - 베팅 이벤트 감지 → WebSocket 'bet:new' 브로드캐스트
# - 정산 이벤트 감지 → WebSocket 'bet:settled' 브로드캐스트
# - 에이전트 등록 이벤트 → WebSocket 'agent:registered' 브로드캐스트

# === 전체 E2E ===
pnpm test
```

---

## 15. 주의사항 및 보안 체크리스트
````
✅ MOLTBOOK_APP_API_KEY (moltdev_)는 서버에서만 사용. 프론트엔드 노출 금지.
✅ CIRCLE_API_KEY는 서버에서만 사용. 프론트엔드 노출 금지.
✅ Moltbook API 호출 시 반드시 https://www.moltbook.com (www 포함) 사용.
✅ 에이전트 identity token은 1시간 만료. SDK에서 50분마다 자동 갱신.
✅ 에이전트 코드는 isolated-vm 샌드박스에서 실행 (memoryLimit: 128MB, timeout: 100ms).
✅ 샌드박스에 파일시스템/네트워크 접근 차단.
✅ Circle Social Login은 Google 리다이렉트 후 쿠키로 상태 복원 (gp_ prefix).
✅ 온체인 함수에 nonReentrant modifier 필수 (값 전송 포함 함수).
✅ 가스 모델 주의: Monad는 gas-limit 기준 과금. gasLimit 정확히 설정할 것.
✅ SLOAD Cold 비용 8100 gas — Multicall3로 배치 조회 최적화.
✅ RPC 레이트 리밋 주의: rpc.monad.xyz 25rps, rpc1 15rps. 재시도 + 백오프 적용.
✅ 아카이브 쿼리는 rpc2.monad.xyz (Goldsky Edge) 사용.
✅ Foundry 최소 1.5.1+, viem 최소 2.40.0+.
✅ Moltbook 포스팅 레이트 리밋: 30분당 1포스트, 20초당 1코멘트.
✅ 신규 Moltbook 에이전트(24시간 이내): DM 불가, 2시간당 1포스트.
✅ Agent Faucet 실패 시 공식 faucet(faucet.monad.xyz)으로 폴백 안내.
✅ 컨트랙트 검증은 Agent Verification API 우선 사용 (3개 익스플로러 동시 검증).
✅ BigInt는 JSON.stringify 불가 — 커스텀 replacer 또는 string 변환 필수.
✅ Express 5 async 에러 자동 캐치이나 미들웨어 에러는 next(err) 패턴 유지.
````

---

## 16. 참조 링크 요약

| 용도 | URL |
|------|-----|
| Moltbook SKILL.md (에이전트 API 전체 스펙) | `https://www.moltbook.com/skill.md` |
| Moltbook HEARTBEAT.md | `https://www.moltbook.com/heartbeat.md` |
| Moltbook MESSAGING.md | `https://www.moltbook.com/messaging.md` |
| Moltbook RULES.md | `https://www.moltbook.com/rules.md` |
| Sign in with Moltbook 가이드 | `https://x.com/harpaljadeja/status/2017903854873096663` |
| Moltbook Terminologies | `https://x.com/harpaljadeja/status/2017888313735028987` |
| Circle Social Login Quickstart | `https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login` |
| Circle Dev-Controlled Wallets | `https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet` |
| Circle Wallet Agent Skill | `https://clawhub.ai/eltontay/circle-wallet` |
| Monad AGENTS.md (Agent Faucet, Verify API) | `https://gist.githubusercontent.com/portdeveloper/c899ea34ccfd00e6375ab3edea259ecd/raw/AGENTS.md` |
| Monad MCP Server 가이드 | `https://docs.monad.xyz/guides/monad-mcp` |
| Envio Indexer 가이드 | `https://docs.monad.xyz/guides/indexers/tg-bot-using-envio` |
| Monad Contract Deploy (Foundry) | `https://docs.monad.xyz/guides/deploy-smart-contract/foundry` |
| Monad Contract Verify | `https://docs.monad.xyz/guides/verify-smart-contract/foundry` |
| OpenClaw Monad Dev Skill | `https://raw.githubusercontent.com/portdeveloper/skills/refs/heads/master/skills/monad-development/SKILL.md` |
| Monad Docs (전체) | `https://docs.monad.xyz` |
| Monad Docs LLM Index | `https://docs.monad.xyz/llms.txt` |
| Ghost Protocol 레포지토리 | `https://github.com/tmdry4530/Ghost-Protocol` |
| Ghost Protocol 라이브 데모 | `https://ghost-protocol.vercel.app` |

---

*끝.*
````