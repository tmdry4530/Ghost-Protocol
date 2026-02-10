#!/usr/bin/env npx tsx
/**
 * OpenClaw → Ghost Protocol Bridge
 *
 * Connects your OpenClaw agent to the Ghost Protocol arena.
 * Run this on your VPS alongside OpenClaw.
 *
 * Usage:
 *   npx tsx openclaw-bridge.ts
 *
 * Environment Variables:
 *   GHOST_SERVER_URL  - Ghost Protocol server (e.g., https://your-server.ngrok-free.dev)
 *   AGENT_NAME        - Agent display name (default: OpenClaw-Agent)
 *   DIFFICULTY         - Ghost AI difficulty 1~5 (default: 3)
 */

import { ChallengeClient, GhostAgent, pathfind, nearestPellet, dangerZone, escapePaths } from '@ghost-protocol/sdk';
import type { GameState, AgentAction } from '@ghost-protocol/shared';

const SERVER_URL = process.env.GHOST_SERVER_URL ?? 'http://localhost:3001';
const AGENT_NAME = process.env.AGENT_NAME ?? 'OpenClaw-Agent';
const DIFFICULTY = Math.min(5, Math.max(1, Number(process.env.DIFFICULTY ?? '3'))) as 1 | 2 | 3 | 4 | 5;

/**
 * OpenClaw Bridge Agent
 *
 * Strategy: Safety-first + greedy pellet collection
 * 1. Danger detection (radius 5 tiles)
 * 2. Hunt frightened ghosts in power mode
 * 3. Collect nearest pellet (greedy algorithm)
 * 4. Fallback: maintain current direction
 */
class OpenClawBridgeAgent extends GhostAgent {
  private tickCount = 0;

  constructor() {
    super(AGENT_NAME);
  }

  onGameState(state: GameState): AgentAction {
    this.tickCount++;
    const { pacman, ghosts, maze } = state;

    // Strategy 1: Danger zone check (radius 5 tiles)
    const inDanger = dangerZone(pacman, ghosts, 5);

    if (inDanger) {
      const safeDirs = escapePaths(pacman, ghosts, maze);
      if (safeDirs.length > 0) {
        const target = nearestPellet(pacman, maze);
        if (target) {
          let bestDir = safeDirs[0];
          let bestDist = Infinity;
          const vectors: Record<string, { dx: number; dy: number }> = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
          };
          for (const dir of safeDirs) {
            const v = vectors[dir];
            if (v) {
              const d = Math.abs(pacman.x + v.dx - target.x) + Math.abs(pacman.y + v.dy - target.y);
              if (d < bestDist) { bestDist = d; bestDir = dir; }
            }
          }
          return { direction: bestDir as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.7, strategy: 'escape_with_pellet' } };
        }
        return { direction: safeDirs[0] as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.6, strategy: 'escape' } };
      }
    }

    // Strategy 2: Hunt frightened ghosts in power mode
    if (state.powerActive) {
      const frightened = ghosts.filter(g => g.mode === 'frightened');
      if (frightened.length > 0) {
        let closest = frightened[0];
        let closestDist = Infinity;
        for (const g of frightened) {
          const d = Math.abs(pacman.x - g.x) + Math.abs(pacman.y - g.y);
          if (d < closestDist) { closestDist = d; closest = g; }
        }
        if (closest) {
          const path = pathfind(pacman, closest, maze);
          if (path.length > 0) {
            return { direction: path[0] as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.9, strategy: 'hunt_ghost' } };
          }
        }
      }
    }

    // Strategy 3: Collect nearest pellet (greedy)
    const target = nearestPellet(pacman, maze);
    if (target) {
      const path = pathfind(pacman, target, maze);
      if (path.length > 0) {
        return { direction: path[0] as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.85, strategy: 'collect_pellet', targetTile: target } };
      }
    }

    // Strategy 4: Fallback - maintain current direction
    return { direction: pacman.direction as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.3, strategy: 'fallback' } };
  }

  onMatchStart(matchId: string): void {
    console.log(`\n[MATCH START] ${matchId}`);
    console.log(`  Agent: ${AGENT_NAME}`);
    console.log(`  Server: ${SERVER_URL}`);
    console.log(`  Difficulty: ${String(DIFFICULTY)}\n`);
    this.tickCount = 0;
  }

  onMatchEnd(result: { matchId: string; won: boolean; finalScore: number }): void {
    const emoji = result.won ? 'WIN' : 'LOSS';
    console.log(`\n[MATCH END] ${emoji}`);
    console.log(`  Result: ${result.won ? 'Victory' : 'Defeat'}`);
    console.log(`  Score: ${String(result.finalScore)}`);
    console.log(`  Ticks played: ${String(this.tickCount)}\n`);
  }

  onRoundStart(round: number): void {
    console.log(`[ROUND] Round ${String(round)} started`);
  }

  onError(error: Error): void {
    console.error(`[ERROR] ${error.message}`);
  }
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  OpenClaw -> Ghost Protocol Bridge');
  console.log('========================================');
  console.log(`\n  Server: ${SERVER_URL}`);
  console.log(`  Agent: ${AGENT_NAME}`);
  console.log(`  Difficulty: ${String(DIFFICULTY)}`);
  console.log('');

  const agent = new OpenClawBridgeAgent();

  const client = new ChallengeClient({
    serverUrl: SERVER_URL,
    agent,
    difficulty: DIFFICULTY,
    ngrokBypass: true,
  });

  try {
    console.log('[CONNECTING] Creating challenge and connecting...\n');
    const result = await client.play();

    console.log('\n========================================');
    console.log(`  FINAL RESULT: ${result.winner.toUpperCase()} WINS`);
    console.log(`  SCORE: ${String(result.score)}`);
    console.log('========================================\n');
  } catch (err) {
    console.error('[FATAL]', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Disconnecting...');
    client.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    client.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
