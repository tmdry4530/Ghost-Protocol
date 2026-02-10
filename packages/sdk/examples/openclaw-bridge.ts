#!/usr/bin/env npx tsx
/**
 * OpenClaw → Ghost Protocol Bridge
 *
 * OpenClaw 에이전트를 Ghost Protocol 아레나에 연결합니다.
 * VPS에서 OpenClaw와 함께 실행하세요.
 *
 * 사용법:
 *   npx tsx openclaw-bridge.ts
 *
 * 환경 변수:
 *   GHOST_SERVER_URL  - Ghost Protocol WebSocket 서버 (기본값: ws://localhost:3001)
 *   AGENT_NAME        - 에이전트 표시 이름 (기본값: OpenClaw-Agent)
 */

import { AgentClient, GhostAgent, pathfind, nearestPellet, dangerZone, escapePaths } from '@ghost-protocol/sdk';
import type { GameState, AgentAction, AgentAddress } from '@ghost-protocol/shared';

const SERVER_URL = process.env.GHOST_SERVER_URL ?? 'ws://localhost:3001';
const AGENT_NAME = process.env.AGENT_NAME ?? 'OpenClaw-Agent';

/**
 * 이름으로부터 결정론적 에이전트 주소 생성
 */
function generateAddress(name: string): AgentAddress {
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  const hex = Math.abs(hash).toString(16).padStart(40, '0').slice(0, 40);
  return `0x${hex}` as AgentAddress;
}

/**
 * OpenClaw Bridge Agent
 *
 * 전략: 안전 우선 + 탐욕적 펠릿 수집
 * 1. 위험 감지 (반경 5타일)
 * 2. 파워 모드 시 겁먹은 고스트 추적
 * 3. 가장 가까운 펠릿 수집 (탐욕 알고리즘)
 * 4. 폴백: 현재 방향 유지
 */
class OpenClawBridgeAgent extends GhostAgent {
  private tickCount = 0;

  constructor() {
    super(AGENT_NAME);
  }

  onGameState(state: GameState): AgentAction {
    this.tickCount++;
    const { pacman, ghosts, maze } = state;

    // 전략 1: 위험 지역 체크 (반경 5타일)
    const inDanger = dangerZone(pacman, ghosts, 5);

    if (inDanger) {
      // 탈출 모드
      const safeDirs = escapePaths(pacman, ghosts, maze);
      if (safeDirs.length > 0) {
        // 펠릿에 가장 가까운 탈출 방향 선택
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

    // 전략 2: 파워 모드 활성화 시 겁먹은 고스트 추적
    if (state.powerActive) {
      const frightened = ghosts.filter(g => g.mode === 'frightened');
      if (frightened.length > 0) {
        // 가장 가까운 겁먹은 고스트 찾기
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

    // 전략 3: 가장 가까운 펠릿 수집 (탐욕 알고리즘)
    const target = nearestPellet(pacman, maze);
    if (target) {
      const path = pathfind(pacman, target, maze);
      if (path.length > 0) {
        return { direction: path[0] as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.85, strategy: 'collect_pellet', targetTile: target } };
      }
    }

    // 전략 4: 폴백 - 현재 방향 유지
    return { direction: pacman.direction as 'up' | 'down' | 'left' | 'right', metadata: { confidence: 0.3, strategy: 'fallback' } };
  }

  onMatchStart(matchId: string): void {
    console.log(`\n🎮 매치 시작: ${matchId}`);
    console.log(`   에이전트: ${AGENT_NAME}`);
    console.log(`   서버: ${SERVER_URL}\n`);
    this.tickCount = 0;
  }

  onMatchEnd(result: { matchId: string; won: boolean; finalScore: number }): void {
    const emoji = result.won ? '🏆' : '💀';
    console.log(`\n${emoji} 매치 종료!`);
    console.log(`   결과: ${result.won ? '승리' : '패배'}`);
    console.log(`   점수: ${result.finalScore}`);
    console.log(`   플레이 틱 수: ${this.tickCount}\n`);
  }

  onRoundStart(round: number): void {
    console.log(`📍 라운드 ${round} 시작`);
  }

  onError(error: Error): void {
    console.error(`❌ 에러: ${error.message}`);
  }
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  OpenClaw → Ghost Protocol Bridge    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n🔗 서버: ${SERVER_URL}`);
  console.log(`🤖 에이전트: ${AGENT_NAME}`);

  const agent = new OpenClawBridgeAgent();
  const address = generateAddress(AGENT_NAME);
  console.log(`📍 주소: ${address}\n`);

  const client = new AgentClient({
    serverUrl: SERVER_URL,
    agent,
    agentAddress: address,
    autoReconnect: true,
    maxReconnectAttempts: 10,
  });

  try {
    await client.connect();
    console.log('✅ Ghost Protocol 서버에 연결되었습니다!');
    console.log('⏳ 매치 할당 대기 중...\n');
  } catch (err) {
    console.error('❌ 연결 실패:', err);
    process.exit(1);
  }

  // 우아한 종료 처리
  process.on('SIGINT', () => {
    console.log('\n👋 연결 해제 중...');
    client.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    client.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
