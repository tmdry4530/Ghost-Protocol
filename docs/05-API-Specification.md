# GHOST PROTOCOL — API Specification

> REST Endpoints, WebSocket Events & Agent SDK
> Version 1.0 · February 2026 · Chamdom

---

## 1. API Overview

Ghost Protocol exposes three API surfaces: a REST API for CRUD operations and queries, a WebSocket API for real-time game state and betting updates, and an Agent SDK for developers building Pac-Man playing agents. All APIs use JSON for request/response bodies. Authentication for player actions requires a connected wallet signature (EIP-712).

| API Surface | Protocol | Base URL | Auth |
|---|---|---|---|
| REST API | HTTPS | `/api/v1/*` | Wallet signature (EIP-712) |
| WebSocket API | WSS | `/ws` | Optional (wallet for betting) |
| Agent SDK | npm package | `@ghost-protocol/sdk` | Agent private key |

---

## 2. REST API Endpoints

### 2.1 Tournaments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/tournaments` | List all tournaments. Query params: `status` (active\|completed\|upcoming), `page`, `limit` |
| GET | `/api/v1/tournaments/:id` | Get tournament details including bracket, matches, and prize pool |
| GET | `/api/v1/tournaments/:id/bracket` | Get current bracket state with match results and upcoming matchups |
| POST | `/api/v1/tournaments` | Create tournament (Arena Manager only). Body: `{ participants, bracketSize }` |

### 2.2 Matches

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/matches` | List matches. Query params: `status`, `tournamentId`, `agentAddress`, `page`, `limit` |
| GET | `/api/v1/matches/:id` | Get match details: agents, scores, bets, game log hash, replay URI |
| GET | `/api/v1/matches/:id/replay` | Get replay data (redirects to IPFS) |
| GET | `/api/v1/matches/live` | List currently active matches with WebSocket room IDs |

### 2.3 Survival Sessions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/survival` | List survival sessions. Query params: `status`, `playerAddress`, `page`, `limit` |
| GET | `/api/v1/survival/:id` | Get session details: player, current round, predictions, status |
| POST | `/api/v1/survival/join` | Join survival queue. Requires wallet signature and entry fee tx hash. |
| GET | `/api/v1/survival/leaderboard` | Top survival records: highest round, highest score, longest life |

### 2.4 Agents

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/agents` | List registered agents. Query params: `sortBy` (reputation\|wins), `active`, `page` |
| GET | `/api/v1/agents/:address` | Agent profile: stats, match history, reputation score |
| POST | `/api/v1/agents/register` | Register agent. Body: `{ name, metadataURI, registrationTxHash }` |
| GET | `/api/v1/agents/:address/matches` | Match history for a specific agent |

### 2.5 Betting

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/bets/match/:matchId` | Get betting pool info: total pool, side A/B totals, odds, status |
| GET | `/api/v1/bets/survival/:sessionId` | Get survival predictions: pool size, prediction distribution by round |
| GET | `/api/v1/bets/my` | List current user's active and historical bets (requires wallet auth) |
| GET | `/api/v1/bets/my/:matchId` | Get user's bet details for a specific match |

---

## 3. WebSocket API

The WebSocket API provides real-time updates for game state, betting, and tournament progression. Clients connect to `/ws` and subscribe to specific rooms based on their interests.

### 3.1 Connection & Rooms

| Room | Subscribe Event | Description |
|---|---|---|
| `match:{matchId}` | `join_match` | Live game state updates for a specific match (60 FPS state frames) |
| `survival:{sessionId}` | `join_survival` | Live survival session updates |
| `tournament:{tournamentId}` | `join_tournament` | Bracket progression, match completions, next matchups |
| `betting:{matchId}` | `join_betting` | Real-time betting pool updates, odds changes, settlement notifications |
| `lobby` | `join_lobby` | Global feed: new tournaments, match starts, big wins, records broken |

### 3.2 Server-to-Client Events

| Event | Payload |
|---|---|
| `game_state` | `{ tick, pacman: { x, y, dir, score, lives }, ghosts: [{ id, x, y, mode }], pellets: [...], powerActive }` |
| `round_start` | `{ round, difficulty, mazeId, ghostSpeed, powerDuration }` |
| `round_end` | `{ round, score, livesRemaining, nextDifficulty }` |
| `match_result` | `{ matchId, winner, scoreA, scoreB, gameLogHash }` |
| `bet_update` | `{ matchId, poolTotal, sideA, sideB, oddsA, oddsB, betCount }` |
| `bet_locked` | `{ matchId, finalPool, finalOdds }` |
| `bet_settled` | `{ matchId, winner, yourPayout (if authed) }` |
| `survival_eliminated` | `{ sessionId, finalRound, totalScore, isRecord }` |
| `tournament_advance` | `{ tournamentId, round, matchups: [...] }` |

### 3.3 Client-to-Server Events

| Event | Payload |
|---|---|
| `player_input` | `{ sessionId, direction: 'up'\|'down'\|'left'\|'right', tick }` (Survival Mode human player) |
| `agent_action` | `{ matchId, agentAddress, direction, tick, signature }` (Arena Mode agent) |

---

## 4. Agent SDK (`@ghost-protocol/sdk`)

The Agent SDK is an npm package that provides a standardized interface for developing Pac-Man playing agents. Agents receive game state each tick and must return an action within 100ms.

### 4.1 Installation & Setup

```bash
npm install @ghost-protocol/sdk
```

```typescript
import { GhostAgent, GameState, Action } from '@ghost-protocol/sdk';

class MyAgent extends GhostAgent {
  onGameState(state: GameState): Action {
    // Your strategy logic here
    return { direction: 'right' };
  }
}
```

### 4.2 GameState Interface

```typescript
interface GameState {
  tick: number;
  round: number;
  score: number;
  lives: number;
  pacman: { x: number; y: number; direction: Direction };
  ghosts: Array<{
    id: 'blinky' | 'pinky' | 'inky' | 'clyde';
    x: number; y: number;
    mode: 'chase' | 'scatter' | 'frightened' | 'eaten';
  }>;
  maze: {
    width: number; height: number;
    walls: boolean[][];
    pellets: boolean[][];
    powerPellets: Array<{ x: number; y: number }>;
  };
  powerActive: boolean;
  powerTimeRemaining: number;
  fruitAvailable: { x: number; y: number; points: number } | null;
}
```

### 4.3 Action Interface

```typescript
interface Action {
  direction: 'up' | 'down' | 'left' | 'right';
  metadata?: {  // optional, for analytics
    confidence: number;
    strategy: string;
    targetTile?: { x: number; y: number };
  };
}
```

### 4.4 Helper Utilities

| Utility | Description |
|---|---|
| `pathfind(from, to, maze)` | A* pathfinding between two tiles. Returns array of directions. |
| `nearestPellet(position, maze)` | Finds the nearest uneaten pellet. Returns tile coordinates. |
| `ghostDistance(pacman, ghost)` | Manhattan distance to a specific ghost. |
| `dangerZone(pacman, ghosts, radius)` | Returns true if any non-frightened ghost is within radius tiles. |
| `escapePaths(pacman, ghosts, maze)` | Returns safe directions (no ghost within 3 tiles in that direction). |
| `pelletCluster(maze, minSize)` | Finds clusters of adjacent pellets for efficient collection routes. |

### 4.5 Agent Registration Flow

1. Develop and test your agent locally using the SDK's built-in simulator.
2. Deploy your agent code to a server or serverless function with a WebSocket endpoint.
3. Call `registerAgent()` on the GhostArena smart contract with your agent's name and metadata URI.
4. Configure your agent's WebSocket URL in the Ghost Protocol dashboard.
5. The Arena Manager will automatically include your agent in tournament matchmaking based on its reputation score.

---

## 5. Rate Limits & Quotas

| Endpoint | Rate Limit | Note |
|---|---|---|
| REST API (read) | 100 requests/minute | Per IP address |
| REST API (write) | 20 requests/minute | Per wallet address |
| WebSocket connections | 5 concurrent rooms | Per connection |
| Agent actions | 1 action per tick (16ms) | Enforced server-side |
| Player input | 1 input per tick (16ms) | Client-side throttle + server validation |

---

## 6. Error Codes

| Code | Name | Description |
|---|---|---|
| 400 | BAD_REQUEST | Invalid request parameters or body format |
| 401 | UNAUTHORIZED | Missing or invalid wallet signature |
| 403 | FORBIDDEN | Action not permitted (e.g., non-arena-manager trying to submit results) |
| 404 | NOT_FOUND | Resource not found (match, tournament, agent, session) |
| 409 | CONFLICT | Duplicate action (e.g., already registered agent, already placed bet) |
| 429 | RATE_LIMITED | Too many requests. Retry after X seconds. |
| 503 | GAME_IN_PROGRESS | Cannot modify (e.g., betting window closed, match already started) |
