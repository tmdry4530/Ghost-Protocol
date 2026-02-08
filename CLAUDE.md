# CLAUDE.md — Ghost Protocol

## Language Rules

- **Input**: All prompts and commands are written in English.
- **Output**: All responses, comments, commit messages, console logs, error messages, and code comments MUST be written in Korean (한국어).
- Code identifiers (variable names, function names, class names, etc.) remain in English.
- JSDoc / TSDoc descriptions → Korean.
- README.md → Korean (with English section headers where conventional).
- Git commit messages → Korean, following conventional commit format: `feat(scope): 한국어 설명`.

---

## Project Overview

Ghost Protocol is an AI-agent-powered Pac-Man arena on Monad blockchain for the Moltiverse Hackathon 2026 (Agent Track, Gaming Arena Bounty). It features two modes: Arena Mode (AI vs AI tournaments with wagering) and Survival Mode (human vs progressively smarter AI ghosts with prediction betting).

---

## Monorepo Structure (Turborepo)
```
ghost-protocol/
├── turbo.json
├── package.json                # Root workspace config
├── .env.example
├── CLAUDE.md                   # This file
├── packages/
│   ├── frontend/               # React + Vite + Phaser.js spectator UI
│   ├── backend/                # Node.js game server + WebSocket + REST API
│   ├── contracts/              # Foundry Solidity smart contracts (Monad)
│   ├── sdk/                    # @ghost-protocol/sdk — Agent development kit
│   └── shared/                 # Shared types, constants, utilities
├── docs/                       # Architecture docs (01-PRD ~ 06-Roadmap)
└── .github/                    # CI/CD workflows
```

---

## Pinned Dependency Versions (CRITICAL — DO NOT use different major versions)

All packages MUST use these exact major.minor versions. Before installing ANY dependency, check this list first. Using mismatched versions will cause build failures and runtime errors.

### Root / Shared

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| `turbo` | `^2.8.3` | Monorepo orchestration |
| `typescript` | `^5.7.x` | All packages share this version |
| `node` | `>=20.x` | Minimum Node.js version (engines field) |
| `pnpm` | `>=9.x` | Package manager (use pnpm, NOT npm/yarn) |

### packages/frontend

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| `react` | `^19.0.0` | React 19 |
| `react-dom` | `^19.0.0` | Must match react version |
| `vite` | `^6.x` | Build tool |
| `phaser` | `^3.90.0` | Game rendering engine — DO NOT use Phaser 4 |
| `wagmi` | `^2.14.x` | React hooks for Ethereum — use v2, NOT v3 (v3 has breaking changes with viem 2.x peer dep resolution in some setups; if v3 works cleanly with viem ^2.45 in testing, v3.4.2 is acceptable) |
| `viem` | `^2.45.1` | TypeScript Ethereum interface |
| `@tanstack/react-query` | `^5.90.x` | Required peer dep for wagmi |
| `tailwindcss` | `^4.x` | Utility-first CSS (v4 uses new engine) |
| `react-router-dom` | `^7.x` | Client-side routing |
| `tone` | `^15.1.22` | Web Audio synthesis for game sounds |
| `zustand` | `^5.x` | Lightweight state management |

### packages/backend

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| `express` | `^5.x` | HTTP server (Express 5 stable) |
| `socket.io` | `^4.8.3` | WebSocket server |
| `bullmq` | `^5.67.x` | Job queue for match scheduling |
| `ioredis` | `^5.x` | Redis client (required by BullMQ) |
| `ethers` | `^6.16.0` | Blockchain interaction from server |
| `isolated-vm` | `^6.0.2` | Agent sandboxing |
| `zod` | `^3.x` | Runtime schema validation |
| `helmet` | `^8.x` | Security headers |
| `cors` | `^2.x` | CORS middleware |
| `pino` | `^9.x` | Structured logging |

### packages/contracts (Foundry)

| Tool | Version | Notes |
|------|---------|-------|
| `foundry` (forge) | Latest via `foundryup` | Solidity toolchain |
| Solidity | `^0.8.24` | Compiler version in foundry.toml |
| OpenZeppelin | `@openzeppelin/contracts ^5.x` | ReentrancyGuard, Ownable, Pausable, ERC20 |

### packages/sdk

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| `ws` | `^8.x` | WebSocket client for agent connection |
| `ethers` | `^6.16.0` | Agent wallet signing |

### Compatibility Rules

1. **wagmi + viem**: wagmi v2 requires viem ^2.x. If using wagmi v3, confirm `pnpm ls viem` resolves to a single ^2.x version with no conflicts.
2. **React 19 + Phaser 3**: Phaser must be initialized via `useEffect` with cleanup. Do NOT render Phaser inside React's render cycle. Use a `ref` for the Phaser container div.
3. **BullMQ + ioredis**: BullMQ v5 requires ioredis v5. Do NOT use the `redis` package.
4. **Express 5**: Express 5 returns Promises from route handlers. All route handlers must be `async` and errors must be caught.
5. **TailwindCSS v4**: Uses the new `@import "tailwindcss"` syntax instead of `@tailwind` directives. Does NOT use `tailwind.config.js` — use CSS-based configuration.
6. **Socket.io v4**: Client package is `socket.io-client` (same major version).
7. **TypeScript strict mode**: All packages use `"strict": true` in tsconfig.json.

---

## Lint & Formatting Rules (MANDATORY)

### ESLint Configuration (All packages)

Use flat config format (`eslint.config.mjs`) with the following rules:
```js
// eslint.config.mjs (root)
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    rules: {
      // 에러 방지 핵심 규칙
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
    }
  }
);
```

### Key Lint Rules Explained

- **`no-explicit-any`**: NEVER use `any`. Use `unknown` + type guards or proper generic types.
- **`no-floating-promises`**: Every Promise must be `await`ed or explicitly handled with `.catch()`. This prevents silent failures in async WebSocket handlers and blockchain transactions.
- **`no-misused-promises`**: Do not pass async functions where sync callbacks are expected (common mistake with Express route handlers and event listeners).
- **`strict-boolean-expressions`**: Prevents truthy/falsy bugs with numbers, strings, and nullish values.

### Prettier Configuration
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf",
  "arrowParens": "always"
}
```

### Solidity Lint (contracts/)

Use `forge fmt` with default settings. Additionally:
- All public/external functions must have NatSpec `@notice` and `@param` comments (in Korean).
- All events must have `@notice` comments.
- State variables must have `@dev` comments explaining purpose.

---

## Code Architecture Conventions

### TypeScript Patterns

- Use `interface` for object shapes, `type` for unions/intersections.
- All exported functions must have explicit return types.
- Use `readonly` for arrays/objects that should not be mutated.
- Prefer `Map<K,V>` over `Record<string,V>` for runtime dictionaries.
- Use `branded types` for IDs: `type MatchId = string & { readonly __brand: 'MatchId' }`.
- Error handling: define custom error classes extending `Error`. Never throw raw strings.

### File Naming

- TypeScript files: `PascalCase.ts` for classes, `camelCase.ts` for utilities/hooks.
- React components: `PascalCase.tsx`.
- Test files: `*.test.ts` or `*.spec.ts` colocated with source.
- Solidity: `PascalCase.sol`.

### Import Order (enforced by ESLint)

1. Node built-ins (`node:path`, `node:crypto`)
2. External packages (`react`, `ethers`, `socket.io`)
3. Internal packages (`@ghost-protocol/shared`, `@ghost-protocol/sdk`)
4. Relative imports (`./utils`, `../components`)

Blank line between each group.

---

## Game Engine Specifics

### Deterministic State Machine

The game engine MUST be fully deterministic. Given the same initial state and sequence of inputs, it must produce identical results. This is critical for on-chain verification.

- Use seeded PRNG (not `Math.random()`). Seed from Monad block hash.
- All floating-point calculations must use fixed-point arithmetic or integer math to avoid platform-dependent rounding.
- Tick rate: exactly 60 ticks/second (16.667ms). Use a fixed timestep game loop, NOT variable delta time.

### State Hashing

Every game tick produces a state hash (`keccak256`). The hash includes: tick number, all entity positions (quantized to grid coordinates), score, lives, pellet state, ghost modes. This hash chain is used for on-chain verification.

---

## Smart Contract Rules

- Target Solidity `^0.8.24` with `--via-ir` optimization enabled.
- All external/public functions must have `nonReentrant` modifier where they transfer value.
- Use `pull` payment pattern (users claim, contract does not push).
- Every function that modifies state must emit an event.
- Use custom errors (not `require` strings) for gas efficiency: `error Unauthorized();`
- All monetary values in `wei` (uint256). No floating point.
- Arena Manager address is set in constructor and changeable only by owner (for key rotation).

---

## WebSocket Protocol

- All messages are JSON. Schema validated with `zod` on both server and client.
- Game state frames are sent at 60fps during active matches.
- Betting updates are sent on every new bet and at 1-second intervals for odds refresh.
- Client must handle reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s).
- Server tracks client rooms via Redis Pub/Sub for multi-instance scaling.

---

## Testing Requirements

- **Unit tests**: All pure functions, game engine logic, pathfinding, scoring. Use `vitest`.
- **Integration tests**: WebSocket flows, REST API endpoints. Use `supertest` + `vitest`.
- **Contract tests**: Foundry `forge test`. Must include fuzz tests for all betting/payout functions. Must include invariant tests for pool balance integrity.
- **Minimum coverage**: 80% line coverage for `backend` and `sdk` packages.

Run all tests before every commit:
```bash
turbo run test
```

---

## Environment Variables
```env
# .env.example

# Monad
MONAD_RPC_URL=https://testnet.monad.xyz/v1
MONAD_CHAIN_ID=10143
ARENA_MANAGER_PRIVATE_KEY=   # 서버 전용 — 절대 프론트엔드에 노출하지 말 것

# 스마트 컨트랙트 주소 (배포 후 채우기)
GHOST_ARENA_ADDRESS=
WAGER_POOL_ADDRESS=
SURVIVAL_BET_ADDRESS=

# 서버
PORT=3001
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173

# AI
CLAUDE_API_KEY=              # Ghost AI Tier 4+ LLM 전략용
CLAUDE_MODEL=claude-sonnet-4-20250514

# IPFS
PINATA_API_KEY=
PINATA_SECRET_KEY=

# 프론트엔드 (VITE_ 접두사 필수)
VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=ws://localhost:3001
VITE_MONAD_RPC_URL=https://testnet.monad.xyz/v1
VITE_GHOST_ARENA_ADDRESS=
VITE_WAGER_POOL_ADDRESS=
VITE_SURVIVAL_BET_ADDRESS=
```

---

## Git Workflow

- Branch naming: `feat/day1-game-engine`, `fix/ghost-ai-pathfinding`, `chore/deploy-scripts`
- Commit messages in Korean, conventional commit format.
- Squash merge to `main`.
- Tag releases: `v0.1.0-day1`, `v0.2.0-day2`, etc.

---

## Performance Budgets

| Metric | Target | Enforcement |
|--------|--------|-------------|
| Game tick | 16ms (60fps) | Server-side timer, log warnings if tick exceeds 20ms |
| WebSocket latency | < 100ms p95 | Monitor in backend logs |
| Bet confirmation | < 2s (Monad finality) | Measure on-chain timestamp delta |
| Frontend initial load | < 3s | Lighthouse CI check |
| Bundle size (frontend) | < 500KB gzipped (excluding Phaser) | Vite build analyzer |
| Agent action timeout | 100ms | Hard kill in AgentSandbox |

---

## Common Pitfalls to Avoid

1. **Phaser + React**: Never create Phaser.Game inside a React render. Use `useEffect` with a ref. Clean up with `game.destroy(true)` in the effect cleanup.
2. **BigInt in JSON**: `JSON.stringify` cannot serialize `BigInt`. Use a custom replacer or convert to string before serialization. This affects all on-chain values.
3. **Socket.io CORS**: Must explicitly set `cors: { origin: process.env.CORS_ORIGIN }` in Socket.io server options. Default is to block cross-origin.
4. **Foundry + OpenZeppelin**: Install via `forge install OpenZeppelin/openzeppelin-contracts` and set remappings in `remappings.txt`: `@openzeppelin/=lib/openzeppelin-contracts/`.
5. **BullMQ connection**: BullMQ requires a dedicated ioredis connection. Do NOT share the connection with other Redis usage (pub/sub conflicts).
6. **wagmi SSR**: wagmi v2 is client-only. Wrap providers in a client component if using any SSR framework.
7. **Express 5 error handling**: Async errors in route handlers are automatically caught. But middleware errors still need `next(err)` pattern.
8. **TailwindCSS v4 migration**: No `tailwind.config.js`. Use `@theme` directive in CSS for custom values. The `@apply` directive still works.
9. **Monad RPC**: Monad testnet may rate-limit. Implement retry with backoff for all RPC calls. Use `viem`'s built-in retry mechanisms.
10. **isolated-vm memory**: Set explicit memory limits (`memoryLimit: 128`) for each isolate. Default is unlimited and can crash the server.

---

## Security Checklist

- [ ] Game logic runs server-side only. Client receives rendered state.
- [ ] Agent sandbox has no filesystem/network access.
- [ ] All smart contract functions with value transfer have `nonReentrant`.
- [ ] Betting windows are time-locked. `lockBets()` is irreversible.
- [ ] Result submission restricted to Arena Manager verified address.
- [ ] All user input validated with zod schemas (both client and server).
- [ ] PRIVATE_KEY never appears in frontend code or client bundles.
- [ ] Rate limiting on all REST endpoints.
- [ ] WebSocket authentication via EIP-712 signature for betting actions.
- [ ] CORS configured to allow only the frontend origin.