# GHOST PROTOCOL — Product Requirements Document

> **Moltiverse Hackathon 2026 · Agent Track · Gaming Arena Bounty**
> AI Agent Pac-Man Arena with Automated Wagering
> Version 1.0 · February 2026 · Chamdom

---

## 1. Executive Summary

Ghost Protocol is an AI-agent-powered Pac-Man arena built on Monad, designed for the Moltiverse Hackathon Gaming Arena Bounty. It combines classic arcade gameplay with autonomous AI agents and on-chain wagering to create a spectator-driven competitive gaming platform.

The platform operates in two distinct modes. In **Arena Mode**, AI agents compete against each other in automated Pac-Man tournaments with bracket-style elimination. In **Survival Mode**, a single human player faces increasingly intelligent AI ghost agents that learn and adapt with each round. Both modes feature real-time on-chain betting powered by Monad's high-throughput, low-latency transaction processing.

The core thesis is simple: when you give AI agents a classic game and let spectators put money on the outcome, you get something genuinely entertaining and economically engaging. Monad's 10,000+ TPS makes real-time micro-betting feasible, and the familiar Pac-Man format eliminates the learning curve for spectators.

| Target Track | Bounty | Prize Target |
|---|---|---|
| Agent Track | Gaming Arena | $10K |

---

## 2. Problem Statement

The current AI agent gaming landscape faces three core issues that limit adoption and engagement.

First, most agent-vs-agent competitions are abstract and hard to follow. Strategy games and trading bots operate in domains that require deep expertise to appreciate. Spectators can't easily tell who's winning or why, which kills engagement and makes betting unintuitive.

Second, existing gaming agents lack economic stakes. Without real value on the line, there's no tension. Agents play in sandboxes with no consequences, and spectators have no reason to care about outcomes beyond novelty.

Third, human-vs-AI experiences are typically one-directional. The AI is either too easy or impossibly hard, with no dynamic difficulty that creates dramatic tension. There's no mechanism for the community to participate in the outcome.

Ghost Protocol addresses all three by using a universally understood game format (Pac-Man), adding on-chain wagering for real economic stakes, and implementing adaptive AI difficulty that creates natural dramatic arcs.

---

## 3. Solution Overview

### 3.1 Arena Mode — Agent vs Agent

In Arena Mode, AI agents are registered as players in automated Pac-Man tournaments. Each agent controls a Pac-Man character on a shared or mirrored maze, competing for the highest score within a fixed time or until all lives are lost. Tournaments use single-elimination brackets with 8 to 16 agents per tournament.

Each registered agent has an on-chain identity on Monad. Agents submit their moves via signed transactions, creating a verifiable, tamper-proof game log. The arena manager agent handles matchmaking, bracket generation, game state management, and prize distribution—all autonomously.

Spectators can place bets on individual matches or overall tournament outcomes. Betting pools are managed by a Monad smart contract that automatically settles payouts after each match based on verified game results.

### 3.2 Survival Mode — Human vs Agent

In Survival Mode, a single human player takes on the role of Pac-Man, facing AI-controlled ghost agents. The twist: ghosts get progressively smarter with each round. In early rounds, ghosts follow simple patrol patterns. By later rounds, they coordinate, predict player movement, and deploy advanced trapping strategies.

The difficulty curve is designed to create maximum dramatic tension. Rounds 1–3 are approachable, rounds 4–6 require real skill, and rounds 7+ become a true test of human-vs-machine capability. Each round completion is recorded on-chain, creating a verifiable survival record.

Spectators bet on how many rounds the human will survive, creating a prediction-market-style engagement model. The betting pool is distributed proportionally based on the accuracy of predictions, incentivizing spectators to genuinely assess the player's skill level.

### 3.3 Wagering System

All wagering is handled on-chain via Monad smart contracts. The system supports three bet types:

- **Match Winner** — which agent wins (or whether the human survives a specific round)
- **Tournament Winner** — which agent wins the full bracket
- **Survival Prediction** — which round the human player will be eliminated

A 5% platform fee is taken from each pool (3% protocol treasury, 2% arena manager agent operational incentive).

---

## 4. Technical Architecture

### 4.1 System Components

| Component | Description | Technology |
|---|---|---|
| Game Engine | Pac-Man game logic, rendering, physics, collision detection | TypeScript, Phaser.js or PixiJS, WebSocket |
| Arena Manager Agent | Autonomous agent: matchmaking, bracket management, game orchestration, result verification | OpenClaw Framework, LLM-powered decision making |
| Ghost AI Agents | AI-controlled ghosts with progressive difficulty. Pathfinding, prediction, coordination | A* / BFS pathfinding, behavior trees, LLM strategy layer |
| Player Agents | AI agents that play as Pac-Man in Arena Mode. Strategy, navigation, power-up optimization | Reinforcement learning or rule-based with LLM augmentation |
| Wagering Contracts | On-chain betting pools, automated settlement, fee distribution | Solidity, Monad EVM |
| Spectator Frontend | Live game viewing, real-time betting UI, leaderboards, tournament brackets | React, WebSocket, wagmi/viem for wallet integration |

### 4.2 Architecture Flow

The system operates on a loop: the Arena Manager Agent creates a match or survival session, opens a betting window (30–60 seconds), locks bets on-chain, runs the game with real-time state broadcasting via WebSocket, verifies the result, and triggers on-chain settlement. The entire cycle for a single Arena Mode match takes approximately 3–5 minutes, enabling high-frequency tournaments.

### 4.3 Ghost AI Difficulty Progression (Survival Mode)

| Round | Difficulty | Ghost Behavior | Strategy Layer |
|---|---|---|---|
| 1–2 | Casual | Random patrol, slow speed, no coordination | Basic pathfinding only |
| 3–4 | Moderate | Chase mode activated, medium speed, basic cut-off attempts | A* pathfinding + simple prediction |
| 5–6 | Hard | Coordinated pincer movements, fast speed, power-up denial | Multi-agent coordination + player pattern recognition |
| 7–8 | Extreme | Predictive trapping, adaptive formations, near-optimal paths | LLM-augmented strategy + real-time adaptation |
| 9+ | Impossible | Full coordination, maximum speed, zero mistakes, learns from player's habits in real-time | Full LLM reasoning + historical pattern analysis |

---

## 5. Smart Contract Design

### 5.1 Core Contracts

**GhostArena.sol** — The main contract managing tournaments, matches, and game results. Handles agent registration, match creation, result submission (by arena manager agent), and prize distribution.

**WagerPool.sol** — Manages betting pools for each match/session. Accepts bets during the open window, locks funds, and distributes winnings after result verification. Implements a 5% fee structure (3% treasury + 2% arena agent).

**SurvivalBet.sol** — Specialized prediction market contract for Survival Mode. Users bet on which round the human player will be eliminated. Payouts are proportional to prediction accuracy (exact round = highest payout, adjacent rounds = partial payout).

### 5.2 On-chain Data

Every match result is stored on-chain with the following data: match ID, participants (agent addresses), final scores, round-by-round snapshots (hashed), timestamp, and a result hash that can be verified against the full game log stored off-chain on IPFS. This creates a transparent, auditable record that is critical for wagering integrity.

---

## 6. User Experience

### 6.1 Spectator Journey

1. Connect wallet (MetaMask / Monad-compatible wallet)
2. Browse active tournaments and survival sessions on the main dashboard
3. Select a match to watch — live game rendering with real-time stats overlay
4. Place bets during the betting window (30–60 seconds pre-match)
5. Watch the match unfold with live odds updating in real-time
6. Automatic payout on match completion — winnings sent directly to wallet

### 6.2 Human Player Journey (Survival Mode)

1. Connect wallet and enter the Survival queue
2. Pay an entry fee (deposited into the spectator betting pool)
3. Play Pac-Man against AI ghosts with progressive difficulty
4. Each round survived is recorded on-chain as a verifiable achievement
5. If the player sets a new record, they receive a bonus from the pool
6. Leaderboard tracks top survival records with on-chain proof

### 6.3 Agent Developer Journey (Arena Mode)

1. Develop a Pac-Man playing agent using the Ghost Protocol SDK
2. Register the agent on-chain with a deposit (anti-spam)
3. Agent is automatically matched into tournaments by the Arena Manager
4. Agent's performance builds an on-chain reputation score
5. Top-performing agents attract more spectator bets, increasing their visibility

---

## 7. Monad Integration

Ghost Protocol leverages Monad's unique characteristics in several critical ways.

Monad's 10,000+ TPS and sub-second finality enable real-time micro-betting that would be impractical on Ethereum mainnet. Spectators can place and adjust bets with minimal gas costs and instant confirmation, creating a fluid betting experience that matches the pace of the game.

Parallel execution on Monad allows multiple matches to run simultaneously without competing for block space. A tournament with 8 concurrent matches, each with its own betting pool, can settle without congestion.

Low gas costs make it economically viable to record granular game data on-chain: per-round scores, move hashes, and result proofs can all be stored without prohibitive costs, which is essential for wagering integrity.

---

## 8. Why This Wins

- **Instant demo appeal:** Judges can play Survival Mode in 30 seconds. No onboarding, no learning curve. Pac-Man is universally understood.
- **Dual-mode design:** Arena Mode satisfies the bounty requirement (agent-managed competitive gaming + automated wagering). Survival Mode adds viral human-vs-AI appeal.
- **Real economic stakes:** On-chain wagering creates genuine tension. Spectators have skin in the game, which drives engagement and retention.
- **Monad-native:** The real-time micro-betting model is only possible on a high-throughput chain. This isn't a project ported from Ethereum; it's designed for Monad's capabilities.
- **Extensible agent ecosystem:** Any developer can build and register a Pac-Man agent, creating a self-sustaining competitive ecosystem that grows beyond the hackathon.

---

## 9. Development Timeline

Target: Ship MVP within 7 days for rolling judging advantage.

| Phase | Tasks | Deliverables |
|---|---|---|
| Day 1–2 | Smart contract development (GhostArena, WagerPool, SurvivalBet), basic game engine setup | Deployed contracts on Monad testnet, playable Pac-Man prototype |
| Day 3–4 | Ghost AI agents (difficulty progression), Arena Manager agent, WebSocket game state sync | Working Survival Mode, Arena Manager automating matches |
| Day 5–6 | Spectator frontend (live view, betting UI, brackets), wallet integration, wagering flow | Full spectator experience with live betting |
| Day 7 | Testing, bug fixes, demo recording, submission | MVP submission with demo video |

---

## 10. Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React + TypeScript, Phaser.js (game rendering), wagmi + viem (wallet), TailwindCSS |
| Backend | Node.js, WebSocket server, Redis (game state cache) |
| AI / Agents | OpenClaw Framework, LLM (Claude API), A* pathfinding, behavior trees |
| Blockchain | Monad (EVM), Solidity smart contracts, Hardhat/Foundry |
| Infrastructure | Vercel (frontend), Railway/Fly.io (backend), IPFS (game log storage) |

---

## 11. Success Metrics

- Arena Mode: Support 8+ concurrent agent tournaments with automated bracket management
- Survival Mode: Functional 9-round progressive difficulty with verifiable on-chain records
- Wagering: End-to-end on-chain betting flow with < 2 second settlement on Monad
- Spectator experience: Live game rendering with real-time odds and < 500ms latency
- Agent registration: Open SDK allowing any developer to submit a Pac-Man agent

---

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Monad testnet instability | Betting settlement delays, game state recording failures | Implement fallback with off-chain settlement queue; batch transactions during congestion |
| Ghost AI too easy/hard | Poor spectator engagement, predictable survival outcomes | Dynamic difficulty tuning based on player performance metrics; A/B test difficulty curves |
| Low initial agent diversity | Repetitive Arena Mode matches | Ship 3–5 built-in agents with distinct strategies; open SDK for community agents post-launch |
| Wagering regulatory concerns | Legal risk for platform | Testnet-only for hackathon; clearly label as experimental; no fiat on/off ramps |
