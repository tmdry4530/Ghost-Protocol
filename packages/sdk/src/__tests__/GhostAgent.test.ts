import { describe, it, expect } from 'vitest';
import type { GameState, AgentAction, MatchId } from '@ghost-protocol/shared';
import { GhostAgent, MatchResult } from '../GhostAgent.js';

/** 테스트용 구체 클래스 */
class TestAgent extends GhostAgent {
  onGameState(_state: GameState): AgentAction {
    return { direction: 'right' };
  }
}

/** 모든 콜백을 구현한 테스트 에이전트 */
class FullCallbackAgent extends GhostAgent {
  onMatchStartCalled = false;
  onMatchEndCalled = false;
  onRoundStartCalled = false;
  onErrorCalled = false;

  constructor() {
    super('FullCallbackAgent');
  }

  onGameState(_state: GameState): AgentAction {
    return { direction: 'up' };
  }

  onMatchStart(_matchId: MatchId): void {
    this.onMatchStartCalled = true;
  }

  onMatchEnd(_result: MatchResult): void {
    this.onMatchEndCalled = true;
  }

  onRoundStart(_round: number): void {
    this.onRoundStartCalled = true;
  }

  onError(_error: Error): void {
    this.onErrorCalled = true;
  }
}

/** 테스트용 게임 상태 생성 */
function createTestGameState(): GameState {
  return {
    tick: 0,
    round: 1,
    score: 0,
    lives: 3,
    pacman: {
      x: 0,
      y: 0,
      direction: 'right',
      score: 0,
      lives: 3,
    },
    ghosts: [],
    maze: {
      width: 5,
      height: 5,
      walls: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false)),
      pellets: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true)),
      powerPellets: [],
    },
    powerActive: false,
    powerTimeRemaining: 0,
    fruitAvailable: null,
  };
}

describe('GhostAgent', () => {
  it('name 속성 올바르게 설정', () => {
    const agent = new TestAgent('MyTestAgent');
    expect(agent.name).toBe('MyTestAgent');
  });

  it('onGameState 추상 메서드 호출 가능', () => {
    const agent = new TestAgent('TestAgent');
    const state = createTestGameState();

    const action = agent.onGameState(state);

    expect(action).toBeDefined();
    expect(action.direction).toBe('right');
  });

  it('onGameState 반환값이 AgentAction 타입', () => {
    const agent = new TestAgent('TestAgent');
    const state = createTestGameState();

    const action = agent.onGameState(state);

    expect(action).toHaveProperty('direction');
    expect(['up', 'down', 'left', 'right']).toContain(action.direction);
  });

  it('선택적 콜백: onMatchStart 구현 가능', () => {
    const agent = new FullCallbackAgent();
    const matchId = 'match-123' as MatchId;

    expect('onMatchStart' in agent).toBe(true);
    agent.onMatchStart(matchId);

    expect(agent.onMatchStartCalled).toBe(true);
  });

  it('선택적 콜백: onMatchEnd 구현 가능', () => {
    const agent = new FullCallbackAgent();
    const result: MatchResult = {
      matchId: 'match-123' as MatchId,
      won: true,
      finalScore: 1000,
      opponentScore: 800,
    };

    expect('onMatchEnd' in agent).toBe(true);
    agent.onMatchEnd(result);

    expect(agent.onMatchEndCalled).toBe(true);
  });

  it('선택적 콜백: onRoundStart 구현 가능', () => {
    const agent = new FullCallbackAgent();

    expect('onRoundStart' in agent).toBe(true);
    agent.onRoundStart(3);

    expect(agent.onRoundStartCalled).toBe(true);
  });

  it('선택적 콜백: onError 구현 가능', () => {
    const agent = new FullCallbackAgent();
    const error = new Error('Test error');

    expect('onError' in agent).toBe(true);
    agent.onError(error);

    expect(agent.onErrorCalled).toBe(true);
  });

  it('선택적 콜백을 구현하지 않아도 정상 동작', () => {
    const agent = new TestAgent('MinimalAgent');

    expect('onMatchStart' in agent).toBe(false);
    expect('onMatchEnd' in agent).toBe(false);
    expect('onRoundStart' in agent).toBe(false);
    expect('onError' in agent).toBe(false);

    // onGameState는 정상 동작
    const state = createTestGameState();
    const action = agent.onGameState(state);
    expect(action.direction).toBe('right');
  });

  it('여러 번 onGameState 호출 가능', () => {
    const agent = new TestAgent('TestAgent');
    const state = createTestGameState();

    const action1 = agent.onGameState(state);
    const action2 = agent.onGameState(state);
    const action3 = agent.onGameState(state);

    expect(action1.direction).toBe('right');
    expect(action2.direction).toBe('right');
    expect(action3.direction).toBe('right');
  });

  it('다른 이름으로 여러 인스턴스 생성 가능', () => {
    const agent1 = new TestAgent('Agent1');
    const agent2 = new TestAgent('Agent2');
    const agent3 = new TestAgent('Agent3');

    expect(agent1.name).toBe('Agent1');
    expect(agent2.name).toBe('Agent2');
    expect(agent3.name).toBe('Agent3');
  });

  it('onGameState에서 metadata 포함한 액션 반환 가능', () => {
    class MetadataAgent extends GhostAgent {
      onGameState(_state: GameState): AgentAction {
        return {
          direction: 'left',
          metadata: {
            confidence: 0.95,
            strategy: 'greedy',
            targetTile: { x: 5, y: 10 },
          },
        };
      }
    }

    const agent = new MetadataAgent('MetadataAgent');
    const state = createTestGameState();
    const action = agent.onGameState(state);

    expect(action.direction).toBe('left');
    expect(action.metadata).toBeDefined();
    expect(action.metadata?.confidence).toBe(0.95);
    expect(action.metadata?.strategy).toBe('greedy');
    expect(action.metadata?.targetTile).toEqual({ x: 5, y: 10 });
  });

  it('생성자에서 빈 문자열 이름 허용', () => {
    const agent = new TestAgent('');
    expect(agent.name).toBe('');
  });

  it('생성자에서 긴 이름 허용', () => {
    const longName = 'A'.repeat(100);
    const agent = new TestAgent(longName);
    expect(agent.name).toBe(longName);
  });

  it('상태가 변경되어도 일관된 이름 유지', () => {
    const agent = new TestAgent('ConsistentAgent');
    const state = createTestGameState();

    const nameBefore = agent.name;
    agent.onGameState(state);
    const nameAfter = agent.name;

    expect(nameBefore).toBe(nameAfter);
    expect(agent.name).toBe('ConsistentAgent');
  });
});
