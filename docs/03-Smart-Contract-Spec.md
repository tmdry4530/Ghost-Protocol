# GHOST PROTOCOL — Smart Contract Specification

> On-chain Contracts, Interfaces & Economic Design
> Version 1.0 · February 2026 · Chamdom

---

## 1. Contract Overview

Ghost Protocol's on-chain layer consists of four Solidity smart contracts deployed on Monad. These contracts manage agent identity, tournament lifecycle, wagering mechanics, and survival mode economics. All contracts are EVM-compatible and leverage OpenZeppelin libraries for security patterns.

| Contract | Purpose | Key Patterns |
|---|---|---|
| GhostArena.sol | Tournament management, match results, agent registry, bracket progression | Ownable, Pausable, ReentrancyGuard |
| WagerPool.sol | Arena Mode betting pools, odds calculation, automated payout settlement | ReentrancyGuard, pull-payment |
| SurvivalBet.sol | Survival Mode prediction market, round-based betting, accuracy-weighted payouts | ReentrancyGuard, pull-payment |
| GhostToken.sol | Optional: platform utility token for governance and fee discounts (Agent+Token track pivot) | ERC-20, Ownable |

---

## 2. GhostArena.sol

The core contract managing the competitive ecosystem. It handles agent registration, tournament creation, match recording, and result verification.

### 2.1 State Variables

```solidity
mapping(address => Agent) public agents;
mapping(uint256 => Tournament) public tournaments;
mapping(uint256 => Match) public matches;
uint256 public nextTournamentId;
uint256 public nextMatchId;
address public arenaManager; // authorized result submitter
uint256 public registrationFee = 0.01 ether;
```

### 2.2 Structs

```solidity
struct Agent {
    address owner;
    string name;
    string metadataURI; // IPFS link to agent description
    uint256 wins;
    uint256 losses;
    uint256 totalScore;
    uint256 reputation; // ELO-style rating
    bool active;
}

struct Tournament {
    uint256 id;
    address[] participants;
    uint8 bracketSize; // 8 or 16
    uint256 prizePool;
    TournamentStatus status;
    uint256 createdAt;
}

struct Match {
    uint256 id;
    uint256 tournamentId;
    address agentA;
    address agentB;
    uint256 scoreA;
    uint256 scoreB;
    address winner;
    bytes32 gameLogHash; // keccak256 of full game log
    string replayURI; // IPFS link
    MatchStatus status;
}
```

### 2.3 Key Functions

| Function | Parameters | Description |
|---|---|---|
| `registerAgent()` | name, metadataURI | Register a new agent with deposit. Emits AgentRegistered event. |
| `createTournament()` | participants[], bracketSize | Arena Manager only. Creates bracket and initializes matches. |
| `submitResult()` | matchId, scoreA, scoreB, winner, gameLogHash, replayURI | Arena Manager only. Records verified match result. |
| `advanceBracket()` | tournamentId | Arena Manager only. Progresses winners to next bracket round. |
| `claimPrize()` | tournamentId | Tournament winner claims prize pool. |
| `deactivateAgent()` | agentAddress | Agent owner withdraws from active pool. |
| `updateReputation()` | agentAddress, newRating | Arena Manager only. Updates ELO after match. |

### 2.4 Events

```solidity
event AgentRegistered(address indexed agent, string name);
event TournamentCreated(uint256 indexed id, uint8 bracketSize);
event MatchCompleted(uint256 indexed matchId, address winner, uint256 scoreA, uint256 scoreB);
event TournamentCompleted(uint256 indexed id, address champion);
event PrizeClaimed(uint256 indexed tournamentId, address winner, uint256 amount);
```

---

## 3. WagerPool.sol

Manages parimutuel betting pools for Arena Mode matches. Each match gets an independent pool. Bettors choose a side (Agent A or Agent B), and winnings are distributed proportionally after the match.

### 3.1 Betting Mechanics

The system uses a parimutuel model rather than fixed odds. All bets on the winning side split the total pool (minus fees) proportional to their bet size. This eliminates the need for a bookmaker and ensures the platform is always solvent.

| Parameter | Value |
|---|---|
| Minimum bet | 0.001 MON (Monad native token) |
| Maximum bet | 10 MON per match (prevents whale manipulation) |
| Betting window | 30–60 seconds before match start |
| Platform fee | 5% of total pool (3% treasury + 2% arena manager) |
| Settlement | Automatic on match result submission |
| Refund policy | Full refund if match is cancelled or voided |

### 3.2 Key Functions

```solidity
function placeBet(uint256 matchId, Side side) external payable;
function lockBets(uint256 matchId) external onlyArenaManager;
function settleBets(uint256 matchId, Side winner) external onlyArenaManager;
function claimWinnings(uint256 matchId) external;
function refund(uint256 matchId) external; // if match voided
```

### 3.3 Payout Calculation

```
totalPool = sideA_total + sideB_total
fee = totalPool * 5 / 100
distributablePool = totalPool - fee
userPayout = (userBet / winningSide_total) * distributablePool
```

---

## 4. SurvivalBet.sol

A prediction market contract for Survival Mode. Spectators predict which round the human player will be eliminated. Payouts are weighted by prediction accuracy: exact round predictions receive the highest share, adjacent rounds receive partial payouts.

### 4.1 Prediction Tiers

| Prediction Accuracy | Payout Weight | Example |
|---|---|---|
| Exact round | 3x weight | Predicted Round 5, player eliminated Round 5 |
| ±1 round | 2x weight | Predicted Round 5, player eliminated Round 4 or 6 |
| ±2 rounds | 1x weight | Predicted Round 5, player eliminated Round 3 or 7 |
| 3+ rounds off | 0x (loss) | Predicted Round 5, player eliminated Round 1 or 9 |

### 4.2 Key Functions

```solidity
function createSession(address player) external onlyArenaManager returns (uint256);
function placePrediction(uint256 sessionId, uint8 predictedRound) external payable;
function recordRoundSurvived(uint256 sessionId, uint8 round) external onlyArenaManager;
function settleSession(uint256 sessionId, uint8 eliminationRound) external onlyArenaManager;
function claimPayout(uint256 sessionId) external;
```

### 4.3 Player Incentives

The human player pays an entry fee to start a Survival session. This fee is added to the spectator betting pool. If the player survives past the median prediction, they receive a survival bonus (10% of the pool). If they set a new all-time record, they receive an additional record bonus (5% of the pool). This incentivizes skilled players to attempt record runs, which drives spectator engagement.

---

## 5. Fee Structure & Economic Model

| Fee Source | Rate | Treasury | Arena Manager |
|---|---|---|---|
| Arena Mode bets | 5% of pool | 3% | 2% |
| Survival Mode bets | 5% of pool | 3% | 2% |
| Agent registration | 0.01 MON flat | 100% | 0% |
| Survival entry fee | 0.005 MON flat | Added to pool | — |

Revenue flows to two destinations: the protocol treasury (controlled by a multisig) and the Arena Manager agent (as an operational incentive). The Arena Manager's 2% fee incentivizes it to create engaging matches and maintain high spectator activity, aligning autonomous agent behavior with platform health.

---

## 6. Deployment Plan

1. Deploy GhostArena.sol to Monad testnet. Verify contract on block explorer.
2. Deploy WagerPool.sol with GhostArena address as constructor parameter.
3. Deploy SurvivalBet.sol with GhostArena address as constructor parameter.
4. Register Arena Manager address in GhostArena as authorized submitter.
5. Register 3–5 built-in agents for initial Arena Mode testing.
6. Run end-to-end test: create tournament, execute matches, settle bets.
7. Deploy to Monad mainnet after testnet validation (post-hackathon).

---

## 7. Testing Strategy

| Test Type | Scope | Tool |
|---|---|---|
| Unit tests | Individual contract functions, edge cases, access control | Foundry (forge test) |
| Fuzz testing | Random input testing for betting/settlement functions | Foundry fuzzing |
| Integration tests | Full match lifecycle: register → bet → play → settle → claim | Hardhat + custom scripts |
| Gas profiling | Measure gas costs per operation, optimize hot paths | Foundry gas reports |
| Invariant tests | Pool balance invariants, no funds locked, correct fee distribution | Foundry invariant testing |
