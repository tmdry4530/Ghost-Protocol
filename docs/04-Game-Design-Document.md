# GHOST PROTOCOL — Game Design Document

> Mechanics, AI Behavior, Maze Design & Player Experience
> Version 1.0 · February 2026 · Chamdom

---

## 1. Game Concept

Ghost Protocol reimagines classic Pac-Man as a competitive platform for AI agents and human players. The core gameplay loop is preserved—navigate a maze, eat pellets, avoid ghosts, use power-ups—but layered with autonomous AI opponents, progressive difficulty, and real-time economic stakes through on-chain wagering.

The game targets two audiences simultaneously: AI developers who want to build and compete with Pac-Man-playing agents, and spectators who want to watch, bet on, and participate in the action. The Pac-Man format was chosen specifically because it is universally understood, visually legible at a glance, and produces clear win/loss outcomes ideal for wagering.

---

## 2. Core Mechanics

### 2.1 Movement

All entities move on a grid-based system. The maze is divided into a 28x31 tile grid (classic Pac-Man dimensions). Movement is tile-to-tile with smooth interpolation for visual rendering. Direction changes are queued and executed at the next tile boundary, matching the original game's feel.

Speed is measured in tiles per second. Base Pac-Man speed is 8 tiles/second. Ghost speed varies by difficulty tier and individual ghost personality. Cornering behavior follows the original: Pac-Man can "cut corners" by pre-turning, giving skilled players a slight speed advantage.

### 2.2 Pellets & Scoring

| Item | Points | Count per Maze | Effect |
|---|---|---|---|
| Regular Pellet | 10 | 240 | Score only |
| Power Pellet | 50 | 4 | Enables ghost eating for 8 seconds (decreases per round) |
| Fruit Bonus | 100–500 | 1–2 per round | Spawns at center after 70/170 pellets eaten |
| Ghost Eat (1st) | 200 | — | First ghost eaten during power-up |
| Ghost Eat (2nd) | 400 | — | Second ghost eaten (doubles each) |
| Ghost Eat (3rd) | 800 | — | Third ghost eaten |
| Ghost Eat (4th) | 1600 | — | Fourth ghost eaten (maximum combo) |

### 2.3 Lives & Round Progression

Each session starts with 3 lives. An extra life is awarded at 10,000 points (one time only). When all pellets are eaten, the round is completed and the next round begins with a fresh maze. In Arena Mode, the match ends after a fixed number of rounds (3) or when all lives are lost, whichever comes first. In Survival Mode, rounds continue indefinitely until all lives are lost.

### 2.4 Ghost Tunnel

The maze includes a tunnel on each side that wraps around to the opposite side. Ghosts slow to 50% speed in the tunnel, giving Pac-Man a tactical escape route. This is a critical element for skilled play and creates interesting decision points for both human players and AI agents.

---

## 3. Ghost AI Design

### 3.1 Ghost Personalities (Base Behavior)

Following the classic Pac-Man design, each ghost has a unique personality that defines its targeting strategy. These base behaviors are active at all difficulty levels, with additional intelligence layers added at higher tiers.

| Ghost | Name | Base Strategy | Personality |
|---|---|---|---|
| 🔴 Red | Blinky | Targets Pac-Man's current tile directly. Always chases. Speed increases as pellets are eaten. | Aggressive pursuer |
| 🩷 Pink | Pinky | Targets 4 tiles ahead of Pac-Man's facing direction. Attempts to ambush. | Ambusher |
| 🔵 Blue | Inky | Targets a position calculated using both Blinky's position and Pac-Man's position. Unpredictable. | Flanker |
| 🟠 Orange | Clyde | Chases when far from Pac-Man (>8 tiles), retreats to corner when close. Creates gaps in coverage. | Unpredictable |

### 3.2 Difficulty Tier System

Ghost intelligence scales across 9+ rounds in Survival Mode. Each tier adds new behavioral capabilities on top of base personalities.

#### Tier 1: Casual (Rounds 1–2)

- Ghosts follow base personality patterns with reduced accuracy.
- Scatter mode lasts longer (7 seconds vs 5 seconds chase). Ghosts spend more time patrolling corners.
- Speed: 75% of Pac-Man speed. Player has clear speed advantage.
- No coordination between ghosts. Each ghost acts independently.
- Power pellet frightened duration: 8 seconds (generous escape window).

#### Tier 2: Moderate (Rounds 3–4)

- Chase mode extended (7 seconds chase, 5 seconds scatter).
- Speed: 85% of Pac-Man speed. Speed advantage narrows.
- Basic cut-off behavior: ghosts will take shorter paths when player reverses direction.
- Blinky enters "Cruise Elroy" mode earlier (speeds up when fewer pellets remain).
- Power pellet duration reduced to 6 seconds.

#### Tier 3: Hard (Rounds 5–6)

- Chase mode dominant (8 seconds chase, 3 seconds scatter).
- Speed: 95% of Pac-Man speed. Nearly equal speed.
- Coordinated pincer movements: Blinky and Pinky actively create pincer traps.
- Power-up denial: Inky patrols near power pellets to discourage access.
- Player pattern recognition: ghosts remember the last 10 turns the player made and bias predictions.
- Power pellet duration: 4 seconds.

#### Tier 4: Extreme (Rounds 7–8)

- Near-permanent chase mode (9 seconds chase, 1 second scatter).
- Speed: 100% of Pac-Man speed. No speed advantage.
- LLM-augmented strategy: Claude API analyzes the game state every 2 seconds and suggests tactical adjustments.
- Predictive trapping: ghosts predict Pac-Man's destination based on available pellet clusters and pre-position.
- Formation play: ghosts maintain optimal coverage formations, dynamically adjusting to player position.
- Power pellet duration: 2 seconds (barely usable).

#### Tier 5: Impossible (Rounds 9+)

- Permanent chase mode. No scatter at all.
- Speed: 105% of Pac-Man speed. Ghosts are faster.
- Full LLM reasoning every tick: real-time strategic analysis with historical pattern data.
- Zero-mistake pathfinding: ghosts always take the optimal path.
- Active learning: ghosts adapt to the player's escape patterns within the round.
- Power pellet duration: 1 second (essentially useless).
- This tier is designed to be nearly unbeatable. Reaching Round 9+ is a significant achievement worthy of leaderboard recognition.

---

## 4. Maze Design

### 4.1 Maze Variants

Ghost Protocol ships with 5 maze variants to prevent memorization and keep matches fresh. Each maze follows the classic Pac-Man layout principles (single connected space, ghost house in center, 4 power pellet positions, 2 tunnels) but with different corridor arrangements.

| Maze | Theme | Characteristics | Best For |
|---|---|---|---|
| Classic | Original layout | Standard 28x31, balanced paths, familiar feel | Learning, casual play |
| Labyrinth | Complex corridors | More dead ends, longer paths, fewer open areas | Strategic AI, survival |
| Speedway | Wide open | Wider corridors, fewer walls, fast-paced | Aggressive play, exciting spectating |
| Fortress | Defensive | Clustered walls near ghost house, tight center | Defensive strategies |
| Random | Procedural | Generated per match from seed (deterministic) | Tournament variety |

### 4.2 Procedural Generation (Random Maze)

Random mazes are generated from a seed value that is committed on-chain before the match. This ensures the maze is unpredictable but verifiable. The generation algorithm enforces Pac-Man layout rules: full connectivity, ghost house placement, power pellet positions, tunnel locations, and minimum pellet count (200+). The seed is derived from the Monad block hash at bet lock time, making it tamper-proof.

---

## 5. Arena Mode Game Rules

### 5.1 Match Format

- 2 agents per match, playing on mirrored mazes (identical layout, independent game states).
- Each agent plays 3 rounds. Total score across all rounds determines the winner.
- If an agent loses all lives before Round 3, their score is finalized at that point.
- Tie-breaker: agent who completed more rounds wins. If still tied, agent with more pellets eaten wins.
- Time limit: 3 minutes per round. If time expires, remaining pellets are not scored.

### 5.2 Tournament Format

- Single elimination bracket. 8 or 16 agents per tournament.
- Seeding based on agent reputation (ELO). Top seed faces lowest seed.
- Bracket progression is automatic after each match settles.
- Tournament winner receives the prize pool. Runner-up receives nothing (winner-take-all for simplicity).
- Matches within the same bracket round can run concurrently.

---

## 6. Survival Mode Game Rules

- Single human player vs 4 AI ghost agents.
- Unlimited rounds. Game ends when all 3 lives are lost.
- Difficulty increases per round (see Ghost AI Difficulty Tiers).
- Extra life at 10,000 points (once).
- Each round completion is a verifiable on-chain achievement.
- Session is recorded for replay (IPFS storage).
- Leaderboard tracks: highest round reached, highest total score, longest single life.

---

## 7. Visual Design Direction

Ghost Protocol uses a neon-retro aesthetic: dark backgrounds with bright, glowing game elements. The maze walls glow with a soft purple/blue neon. Pellets are bright yellow dots. Ghosts retain their classic colors (red, pink, blue, orange) with a subtle glow effect. The spectator UI uses a dark theme with the Ghost Protocol violet as the primary accent color.

The visual priority is readability: spectators must be able to instantly understand the game state, which ghost is where, and how much danger the player/agent is in. Score, lives, round number, and current difficulty tier are always visible in a minimal HUD overlay.

During Survival Mode, a tension meter visually indicates the current difficulty tier. As difficulty increases, the background subtly shifts from cool blue to warm red, creating an instinctive sense of escalating danger for spectators. Ghost eyes glow brighter at higher tiers.

---

## 8. Audio Design

Audio is optional but enhances the spectator experience. Classic Pac-Man sound effects (waka-waka, ghost eat, death, fruit pickup) are recreated in a synthesized style. Background music shifts tempo with difficulty tier: relaxed chiptune in early rounds, increasingly intense electronic beats in later rounds. All audio is generated using Tone.js to avoid licensing issues.

Audio can be muted by default for spectators, with a prominent unmute button. The key audio priority is notification sounds for betting events: bet placed, bet locked, match result, payout received.
