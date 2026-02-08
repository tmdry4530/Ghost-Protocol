# GHOST PROTOCOL — Technical Architecture

> System Design, Infrastructure & Data Flow
> Version 1.0 · February 2026 · Chamdom

---

## 1. System Architecture Overview

Ghost Protocol follows a modular, event-driven architecture designed for real-time game streaming and on-chain settlement. The system is composed of five primary layers: the Game Engine, Agent Runtime, Backend Orchestrator, Blockchain Layer, and Spectator Frontend. Each layer communicates through well-defined interfaces, enabling independent scaling and development.

The architecture prioritizes low latency for gameplay and betting interactions while ensuring data integrity through on-chain verification. Game state is computed server-side to prevent cheating, with cryptographic proofs submitted to Monad for settlement.

---

## 2. Layer Breakdown

### 2.1 Game Engine Layer

The Game Engine is responsible for all Pac-Man game logic: maze generation, collision detection, pellet tracking, power-up management, score calculation, and ghost/player movement physics. It operates as a deterministic state machine where every game tick produces a verifiable state transition.

The engine runs server-side in a Node.js process to prevent client-side manipulation. The client receives rendered frames and input is validated server-side before being applied. Each tick (16ms at 60fps) produces a state snapshot that is hashed for later on-chain verification.

| Component | Responsibility | Technology |
|---|---|---|
| MazeManager | Maze layout generation, pellet placement, power-up spawns, wall collision maps | TypeScript, procedural generation |
| PhysicsEngine | Entity movement, collision detection, speed calculations per difficulty tier | Custom 2D physics, grid-based |
| GameStateManager | Tick processing, state snapshots, score tracking, round progression | TypeScript, deterministic state machine |
| RenderBridge | Serializes game state for WebSocket broadcast to spectator clients | Protocol Buffers / JSON serialization |
| ReplayRecorder | Records full game log for post-match verification and IPFS archival | Binary log format, gzip compression |

### 2.2 Agent Runtime Layer

The Agent Runtime hosts and executes AI agents in isolated sandboxes. Each agent receives the current game state as input and returns an action (direction + optional strategy metadata) within a strict time budget. Agents that exceed the time budget forfeit their turn, preventing infinite loops or resource abuse.

For Arena Mode, player agents (Pac-Man controllers) run in this layer. For Survival Mode, ghost AI agents run here while the human player's input comes directly from the client.

| Component | Responsibility | Technology |
|---|---|---|
| AgentSandbox | Isolated execution environment per agent, resource limits, timeout enforcement | Node.js Worker Threads, resource quotas |
| AgentSDK | Standard interface for agent developers: state input format, action output format, helper utilities | TypeScript SDK, npm package |
| GhostAIController | Built-in ghost agents with difficulty tiers, pathfinding, coordination logic | A* pathfinding, behavior trees, LLM layer |
| StrategyEngine | LLM-augmented decision layer for advanced ghost behavior (Round 7+) | Claude API, prompt-based reasoning |
| AgentRegistry | On-chain registration, reputation scoring, matchmaking eligibility | Monad smart contract integration |

### 2.3 Backend Orchestrator

The Backend Orchestrator is the central coordination layer. It manages the Arena Manager Agent's logic: creating matches, managing tournament brackets, opening/closing betting windows, triggering game execution, collecting results, and submitting settlement transactions to Monad.

It maintains a job queue for concurrent match management. During a tournament with 8+ matches, the orchestrator schedules games in parallel, tracks bracket progression, and manages spectator subscriptions per match.

| Component | Responsibility | Technology |
|---|---|---|
| ArenaManager | Autonomous agent: tournament creation, bracket management, match scheduling | OpenClaw Framework, LLM orchestration |
| MatchScheduler | Job queue for concurrent match execution, priority management | BullMQ, Redis |
| BettingOrchestrator | Opens/closes betting windows, aggregates bets, triggers on-chain settlement | TypeScript, ethers.js / viem |
| WebSocketHub | Real-time game state broadcasting, spectator room management, bet updates | Socket.io, Redis Pub/Sub |
| ResultVerifier | Validates game results against state hashes before on-chain submission | Cryptographic hash verification |

### 2.4 Blockchain Layer (Monad)

All economic activity occurs on Monad. Smart contracts handle agent registration, betting pool management, result recording, and prize distribution. The system uses Monad's EVM compatibility for Solidity contracts while leveraging its high throughput for real-time micro-transactions.

Key on-chain operations include: bet placement (during 30–60s betting window), bet settlement (immediate post-match), agent registration/deregistration, tournament result recording, and leaderboard updates. Gas costs on Monad are negligible, enabling granular on-chain data that would be prohibitive on Ethereum mainnet.

### 2.5 Spectator Frontend

The frontend is a React application with three primary views: the Tournament Dashboard (browse and follow tournaments), the Game Viewer (live Pac-Man rendering with betting overlay), and the Leaderboard (agent rankings and survival records).

The game viewer uses Phaser.js for rendering Pac-Man gameplay, overlaid with a React-based betting panel. WebSocket connections provide real-time updates for both game state and betting odds. Wallet connection is handled via wagmi/viem for Monad-compatible wallets.

---

## 3. Data Flow

### 3.1 Arena Mode Match Lifecycle

1. Arena Manager creates a new match: selects 2 agents from the matchmaking pool based on reputation score and availability.
2. Betting window opens: BettingOrchestrator broadcasts the match details via WebSocket. Spectators have 30–60 seconds to place bets. Bets are submitted as Monad transactions to WagerPool contract.
3. Betting window closes: BettingOrchestrator calls `lockBets()` on the smart contract. No more bets accepted.
4. Game execution: GameStateManager runs the match tick-by-tick. Both agents receive state and submit actions. All state transitions are recorded.
5. Match completes: Final scores are calculated. ResultVerifier hashes the game log and submits the result to GhostArena contract.
6. Settlement: GhostArena contract verifies the result and triggers WagerPool to distribute winnings to correct bettors. Arena Manager updates the tournament bracket.

### 3.2 Survival Mode Session Lifecycle

1. Human player connects wallet and enters the Survival queue. Entry fee is deposited into SurvivalBet contract.
2. Betting window opens: Spectators predict which round the player will be eliminated. Bets submitted to SurvivalBet.
3. Game starts: Player controls Pac-Man via keyboard/touch. Ghost AI agents run server-side. Round 1 begins with casual difficulty.
4. Round progression: Each round completion is recorded on-chain. Ghost difficulty increases. New betting can open for subsequent rounds.
5. Player elimination: Final round number is submitted to SurvivalBet. Contract distributes pool based on prediction accuracy.
6. Leaderboard update: If the player set a new record, bonus is distributed from the pool. On-chain survival record is updated.

---

## 4. Infrastructure & Deployment

| Service | Provider | Scaling | Estimated Cost |
|---|---|---|---|
| Frontend (React) | Vercel | Edge CDN, auto-scale | Free tier |
| Game Server | Railway / Fly.io | Horizontal: 1 instance per 4 concurrent matches | $20–$50/mo |
| WebSocket Hub | Railway / Fly.io | Sticky sessions, Redis Pub/Sub for multi-instance | Included above |
| Redis | Upstash | Serverless, auto-scale | Free tier (10K cmd/day) |
| Monad RPC | Monad public RPC | Rate-limited, failover to backup | Free |
| IPFS Storage | Pinata / web3.storage | Game logs, replay data | Free tier (1GB) |
| LLM (Ghost AI) | Claude API | Per-request, only for Round 7+ ghosts | $5–$20/mo est. |

---

## 5. Security Considerations

### 5.1 Anti-Cheat

- All game logic runs server-side. Client only receives rendered state and sends input events.
- Agent actions are validated against a strict schema. Invalid actions are rejected and the agent forfeits the turn.
- Game state hashes are committed on-chain post-match. Any dispute can be verified against the full game log on IPFS.
- Agent sandboxes have CPU/memory limits. Agents attempting resource exhaustion are terminated and penalized.

### 5.2 Smart Contract Security

- Reentrancy guards on all payout functions (ReentrancyGuard from OpenZeppelin).
- Betting windows are time-locked. No bets can be placed or modified after `lockBets()` is called.
- Result submission is restricted to the Arena Manager's verified address. Multi-sig option for additional trust.
- Emergency pause functionality for critical bugs (Pausable pattern).
- All contracts will be tested with Foundry fuzzing before deployment.

### 5.3 Agent Isolation

- Each agent runs in an isolated Worker Thread with no filesystem or network access.
- Agents communicate only through the defined SDK interface (receive state, return action).
- Memory and CPU usage are capped per agent. Exceeding limits triggers immediate termination.
- Agent code is sandboxed using vm2 or isolated-vm for additional security.

---

## 6. Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| Game tick rate | 60 FPS (16ms per tick) | Server-side timer |
| WebSocket latency | < 100ms (game state to client) | p95 measurement |
| Bet placement to confirmation | < 2 seconds (Monad finality) | On-chain timestamp delta |
| Concurrent matches | 8+ simultaneous | Load test |
| Agent action timeout | 100ms per tick | Server-side enforcement |
| Game log IPFS upload | < 5 seconds post-match | Async background job |
| Frontend initial load | < 3 seconds | Lighthouse score |
