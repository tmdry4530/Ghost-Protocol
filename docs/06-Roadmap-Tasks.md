# GHOST PROTOCOL — Roadmap & Task Breakdown

> 7-Day Sprint Plan, Task Dependencies & Submission Checklist
> Version 1.0 · February 2026 · Chamdom

---

## 1. Hackathon Strategy

Moltiverse uses rolling judging, meaning early submissions get early review. Our strategy is to ship a functional MVP by Day 7, targeting the first wave of winners. The priority order is: **working game > on-chain wagering > polished UI > advanced AI**. A simple but functional demo beats a complex but broken one.

The critical path is: Game Engine (Day 1–2) → Smart Contracts (Day 2–3) → Ghost AI (Day 3–4) → Frontend + Wagering Integration (Day 5–6) → Polish + Submit (Day 7). Parallel tracks can overlap where dependencies allow.

---

## 2. Day-by-Day Sprint Plan

### Day 1: Foundation

> **Goal:** Playable Pac-Man in browser + project scaffolding

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 1.1 | Project setup: monorepo (Turborepo), React + TypeScript frontend, Node.js backend | 1h | P0 |
| 1.2 | Pac-Man game engine: maze rendering, entity movement, collision detection | 4h | P0 |
| 1.3 | Pellet system, scoring, lives, round progression | 2h | P0 |
| 1.4 | Basic ghost movement (random patrol, no AI yet) | 1h | P0 |
| 1.5 | Keyboard input handling for human player | 0.5h | P0 |
| 1.6 | Game loop: 60fps tick, state management, round reset | 1.5h | P0 |

**✅ Day 1 Deliverable:** Single-player Pac-Man playable in browser with basic ghost movement.

---

### Day 2: Smart Contracts + Server-side Game

> **Goal:** Deployed contracts on Monad testnet + server-authoritative game

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 2.1 | GhostArena.sol: agent registry, match struct, result submission | 3h | P0 |
| 2.2 | WagerPool.sol: betting pool, lock/settle/claim functions | 3h | P0 |
| 2.3 | Deploy to Monad testnet, verify contracts | 1h | P0 |
| 2.4 | Move game engine to server-side, WebSocket state broadcast | 2h | P0 |
| 2.5 | Client-side rendering from WebSocket state (Phaser.js) | 1h | P1 |

**✅ Day 2 Deliverable:** Contracts deployed on Monad testnet. Game runs server-side with WebSocket sync.

---

### Day 3: Ghost AI + Arena Mode

> **Goal:** Functional ghost AI with difficulty tiers + Arena Mode agent framework

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 3.1 | Ghost personalities: Blinky (chase), Pinky (ambush), Inky (flank), Clyde (random) | 3h | P0 |
| 3.2 | A* pathfinding implementation for ghost navigation | 1.5h | P0 |
| 3.3 | Difficulty tier system: speed, scatter/chase timing, coordination | 2h | P0 |
| 3.4 | Agent SDK: GameState interface, Action interface, agent sandbox | 2h | P1 |
| 3.5 | Build 2 sample player agents (greedy pellet collector, safety-first) | 1.5h | P1 |

**✅ Day 3 Deliverable:** Smart ghost AI with 4 personalities. Survival Mode playable with difficulty scaling. Agent SDK ready.

---

### Day 4: Arena Manager + Tournament System

> **Goal:** Autonomous Arena Manager running tournaments

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 4.1 | Arena Manager agent: tournament creation, bracket generation | 2h | P0 |
| 4.2 | Match scheduler: concurrent match execution, result collection | 2h | P0 |
| 4.3 | Bracket progression: winner advancement, next matchup creation | 1.5h | P0 |
| 4.4 | On-chain result submission: Arena Manager signs and submits to GhostArena | 1.5h | P0 |
| 4.5 | SurvivalBet.sol: prediction market for survival mode | 2h | P1 |
| 4.6 | Build 2 more sample agents (aggressive hunter, LLM-assisted) | 1h | P2 |

**✅ Day 4 Deliverable:** Arena Manager autonomously running agent tournaments with on-chain results.

---

### Day 5: Frontend + Betting Integration

> **Goal:** Spectator frontend with live betting flow

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 5.1 | Tournament dashboard: list tournaments, browse matches, bracket view | 2h | P0 |
| 5.2 | Live game viewer: Phaser.js rendering from WebSocket state | 2.5h | P0 |
| 5.3 | Wallet connection: wagmi + viem setup for Monad | 1h | P0 |
| 5.4 | Betting panel: place bet UI, pool display, odds calculation | 2h | P0 |
| 5.5 | Bet placement flow: UI → transaction → confirmation → pool update | 2h | P0 |
| 5.6 | Survival Mode UI: player controls, round indicator, difficulty display | 1.5h | P1 |

**✅ Day 5 Deliverable:** Full spectator experience with live game viewing and on-chain betting.

---

### Day 6: Polish + Advanced Features

> **Goal:** End-to-end flows working, UI polish, leaderboard

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 6.1 | Payout flow: bet settlement, claim winnings UI, transaction confirmation | 2h | P0 |
| 6.2 | Leaderboard: agent rankings (ELO), survival records, top bettors | 1.5h | P1 |
| 6.3 | LLM-augmented ghost AI for Tier 4+ (Claude API integration) | 2h | P1 |
| 6.4 | Survival Mode prediction betting: round prediction UI + SurvivalBet integration | 2h | P1 |
| 6.5 | UI polish: animations, transitions, loading states, error handling | 2h | P1 |
| 6.6 | Mobile responsive layout for spectator view | 1h | P2 |

**✅ Day 6 Deliverable:** Complete product with both modes, betting, payouts, and leaderboard.

---

### Day 7: Testing + Submission

> **Goal:** Bug-free demo, recorded video, submission complete

| # | Task | Est. Hours | Priority |
|---|---|---|---|
| 7.1 | End-to-end testing: full tournament lifecycle, survival session, betting/payout | 2h | P0 |
| 7.2 | Bug fixes and edge case handling | 2h | P0 |
| 7.3 | Demo video recording: 2–3 min walkthrough of both modes | 1.5h | P0 |
| 7.4 | README and documentation: setup guide, architecture overview, SDK docs | 1.5h | P0 |
| 7.5 | Deploy frontend to Vercel, backend to Railway | 1h | P0 |
| 7.6 | Submit via Moltiverse submission form | 0.5h | P0 |

**✅ Day 7 Deliverable:** Submitted project with live demo URL and recorded walkthrough video.

---

## 3. Priority Framework

| Priority | Definition | Examples |
|---|---|---|
| **P0** | Must have for submission. Without this, the project doesn't work. | Game engine, smart contracts, basic UI, at least 1 game mode |
| **P1** | Should have. Significantly improves quality and chances of winning. | Both game modes, advanced ghost AI, full betting flow, leaderboard |
| **P2** | Nice to have. Differentiators that impress but aren't critical. | Mobile UI, LLM ghosts, procedural mazes, audio, extra agents |

---

## 4. Submission Checklist

### 4.1 Required Deliverables

- [ ] Live demo URL (Vercel frontend + Railway backend)
- [ ] GitHub repository with clear README
- [ ] Demo video (2–3 minutes) showing both modes and betting flow
- [ ] Deployed smart contracts on Monad testnet with verified source
- [ ] Submission form completed on Moltiverse platform

### 4.2 README Must Include

- [ ] Project overview and problem statement
- [ ] Architecture diagram
- [ ] Monad integration details (which operations are on-chain and why)
- [ ] Setup instructions for local development
- [ ] Smart contract addresses on Monad testnet
- [ ] Agent SDK documentation and example agent
- [ ] Demo video link
- [ ] Team information

### 4.3 Demo Video Script

1. **Intro (15s):** Project name, tagline, what it does
2. **Arena Mode demo (45s):** Show a tournament bracket, watch a live agent-vs-agent match, show betting flow
3. **Survival Mode demo (45s):** Play a few rounds, show difficulty escalation, show spectator prediction betting
4. **On-chain proof (20s):** Show Monad block explorer with match results, bet settlements, agent registrations
5. **Tech highlights (15s):** Architecture overview, Monad integration, Agent SDK
6. **Closing (10s):** Future vision, team

---

## 5. Risk Management

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Game engine takes longer than 1 day | Medium | Delays everything | Use existing Pac-Man library as base, customize from there |
| Monad testnet down during demo | Low | Can't show on-chain features | Record on-chain interactions in video beforehand; have fallback mock mode |
| Ghost AI not fun/balanced | Medium | Poor demo experience | Test difficulty curve with real players Day 4–5; tune aggressively |
| WebSocket scaling issues | Low | Laggy spectator experience | Start with single-instance; only scale if needed for demo |
| Solo dev burnout | High | Reduced quality Days 5–7 | Strict 10h/day limit; P0 only if behind schedule; sleep > features |

---

## 6. Judging Criteria Alignment

Based on the Moltiverse hackathon page and Gaming Arena bounty requirements, here is how Ghost Protocol maps to likely judging criteria.

| Criteria | How We Score | Evidence |
|---|---|---|
| Agent autonomy | Arena Manager runs tournaments without human intervention | Autonomous bracket creation, matchmaking, settlement |
| Monad integration | Real-time micro-betting, per-round on-chain data, low-cost settlement | WagerPool + SurvivalBet contracts leveraging Monad TPS |
| Gaming + wagering | Two game modes with three bet types | Arena betting, survival predictions, tournament winner bets |
| Technical quality | Server-authoritative, anti-cheat, cryptographic proofs | Architecture docs, verified contracts, game log hashes |
| Demo appeal | Universal game format, playable in 30 seconds | Judges can play Survival Mode live; Arena Mode runs automatically |
| Innovation | Human vs increasingly intelligent AI + economic stakes | Adaptive difficulty with LLM augmentation + on-chain survival records |
