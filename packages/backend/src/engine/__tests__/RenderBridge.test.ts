/**
 * RenderBridge 테스트
 *
 * 검증 항목:
 * - 전체 프레임 변환
 * - 델타 압축 (변경 사항만 추출)
 * - 직렬화/역직렬화
 * - 상태 초기화
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RenderBridge } from '../RenderBridge.js';
import type { GameState, PacmanState, GhostState, MazeData } from '@ghost-protocol/shared';

/**
 * 테스트용 미로 데이터 생성
 */
function createTestMaze(): MazeData {
  const width = 5;
  const height = 5;

  // 간단한 5x5 미로
  const walls: boolean[][] = [
    [true, true, true, true, true],
    [true, false, false, false, true],
    [true, false, true, false, true],
    [true, false, false, false, true],
    [true, true, true, true, true],
  ];

  const pellets: boolean[][] = [
    [false, false, false, false, false],
    [false, true, true, true, false],
    [false, true, false, true, false],
    [false, true, true, true, false],
    [false, false, false, false, false],
  ];

  return {
    width,
    height,
    walls,
    pellets,
    powerPellets: [
      { x: 1, y: 1 },
      { x: 3, y: 3 },
    ],
  };
}

/**
 * 테스트용 GameState 생성
 */
function createTestGameState(overrides?: Partial<GameState>): GameState {
  const pacman: PacmanState = {
    x: 1,
    y: 1,
    direction: 'right',
    score: 0,
    lives: 3,
  };

  const ghosts: GhostState[] = [
    { id: 'blinky', x: 3, y: 1, mode: 'chase' },
    { id: 'pinky', x: 1, y: 3, mode: 'scatter' },
    { id: 'inky', x: 3, y: 3, mode: 'chase' },
    { id: 'clyde', x: 2, y: 2, mode: 'scatter' },
  ];

  return {
    tick: 0,
    round: 1,
    score: 0,
    lives: 3,
    pacman,
    ghosts,
    maze: createTestMaze(),
    powerActive: false,
    powerTimeRemaining: 0,
    fruitAvailable: null,
    dying: false,
    ...overrides,
  };
}

describe('RenderBridge', () => {
  let bridge: RenderBridge;

  beforeEach(() => {
    bridge = new RenderBridge();
  });

  describe('toFrame', () => {
    it('GameState에서 렌더링용 필드만 추출해야 함', () => {
      const state = createTestGameState();
      const frame = bridge.toFrame(state);

      // 포함되어야 하는 필드
      expect(frame.tick).toBe(0);
      expect(frame.pacman).toEqual(state.pacman);
      expect(frame.ghosts).toEqual(state.ghosts);
      expect(frame.pellets).toEqual(state.maze.pellets);
      expect(frame.powerActive).toBe(false);
      expect(frame.powerTimeRemaining).toBe(0);

      // 포함되지 않아야 하는 필드 (round, fruitAvailable 등)
      expect((frame as unknown as GameState).round).toBeUndefined();
      expect((frame as unknown as GameState).maze).toBeUndefined();
    });

    it('이전 프레임을 내부적으로 저장해야 함', () => {
      const state = createTestGameState();
      bridge.toFrame(state);

      // 델타 계산이 가능한지 확인 (previousFrame이 null이 아니면 됨)
      const state2 = createTestGameState({
        tick: 1,
        pacman: { ...state.pacman, x: 2 },
      });
      const delta = bridge.toDelta(state2);

      expect(delta).not.toBeNull();
      expect(delta?.tick).toBe(1);
    });
  });

  describe('toDelta', () => {
    it('이전 프레임이 없으면 null을 반환해야 함', () => {
      const state = createTestGameState();
      const delta = bridge.toDelta(state);

      expect(delta).toBeNull();
    });

    it('변경 사항이 없으면 tick만 포함한 객체를 반환해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const state2 = createTestGameState({ tick: 1 }); // 동일한 상태, tick만 증가
      const delta = bridge.toDelta(state2);

      // 실제로는 tick이 증가했으므로 변경 없음으로 판단될 수 있음
      // 하지만 tick은 항상 포함되므로 최소한 tick은 있어야 함
      expect(delta).toBeDefined();
      expect(delta?.tick).toBe(1);
    });

    it('팩맨 이동 시 pacman 필드를 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const state2 = createTestGameState({
        tick: 1,
        pacman: { ...state1.pacman, x: 2, y: 1 },
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.pacman).toBeDefined();
      expect(delta?.pacman?.x).toBe(2);
      expect(delta?.pacman?.y).toBe(1);
    });

    it('점수 변경 시 score 필드를 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const state2 = createTestGameState({
        tick: 1,
        pacman: { ...state1.pacman, score: 10 },
        score: 10,
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.score).toBe(10);
    });

    it('생명 변경 시 lives 필드를 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const state2 = createTestGameState({
        tick: 1,
        pacman: { ...state1.pacman, lives: 2 },
        lives: 2,
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.lives).toBe(2);
    });

    it('고스트 위치 변경 시 변경된 고스트만 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const ghosts = [...state1.ghosts];
      const firstGhost = ghosts[0];
      if (firstGhost) {
        ghosts[0] = { ...firstGhost, x: 4, y: 1 }; // blinky만 이동
      }

      const state2 = createTestGameState({
        tick: 1,
        ghosts,
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.ghosts).toBeDefined();
      expect(delta?.ghosts?.length).toBeGreaterThan(0);
      expect(delta?.ghosts?.some((g) => g.id === 'blinky')).toBe(true);
    });

    it('고스트 모드 변경 시 해당 고스트를 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const ghosts = [...state1.ghosts];
      const secondGhost = ghosts[1];
      if (secondGhost) {
        ghosts[1] = { ...secondGhost, mode: 'frightened' }; // pinky 모드 변경
      }

      const state2 = createTestGameState({
        tick: 1,
        ghosts,
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.ghosts).toBeDefined();
      expect(delta?.ghosts?.some((g) => g.id === 'pinky')).toBe(true);
    });

    it('펠릿이 먹히면 pelletsEaten에 위치를 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      const maze = createTestMaze();
      const newPellets = maze.pellets.map((row) => [...row]);
      const targetRow = newPellets[1];
      if (targetRow) {
        targetRow[1] = false; // (1, 1) 위치 펠릿 먹음
      }

      const state2 = createTestGameState({
        tick: 1,
        maze: { ...maze, pellets: newPellets },
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.pelletsEaten).toBeDefined();
      expect(delta?.pelletsEaten).toContainEqual({ x: 1, y: 1 });
    });

    it('파워 상태 변경 시 powerActive를 포함해야 함', () => {
      const state1 = createTestGameState({ tick: 0, powerActive: false });
      bridge.toFrame(state1);

      const state2 = createTestGameState({
        tick: 1,
        powerActive: true,
        powerTimeRemaining: 60,
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.powerActive).toBe(true);
      expect(delta?.powerTimeRemaining).toBe(60);
    });

    it('파워 시간 감소 시 powerTimeRemaining을 포함해야 함', () => {
      const state1 = createTestGameState({
        tick: 0,
        powerActive: true,
        powerTimeRemaining: 60,
      });
      bridge.toFrame(state1);

      const state2 = createTestGameState({
        tick: 1,
        powerActive: true,
        powerTimeRemaining: 59,
      });
      const delta = bridge.toDelta(state2);

      expect(delta?.powerTimeRemaining).toBe(59);
    });
  });

  describe('toFullSync', () => {
    it('전체 GameState를 그대로 반환해야 함', () => {
      const state = createTestGameState();
      const fullSync = bridge.toFullSync(state);

      expect(fullSync).toEqual(state);
      expect(fullSync.round).toBe(1);
      expect(fullSync.maze).toBeDefined();
      expect(fullSync.fruitAvailable).toBeNull();
    });
  });

  describe('serialize & deserialize', () => {
    it('GameState를 JSON 문자열로 직렬화해야 함', () => {
      const state = createTestGameState();
      const serialized = bridge.serialize(state);

      expect(typeof serialized).toBe('string');
      expect(() => JSON.parse(serialized) as unknown).not.toThrow();
    });

    it('JSON 문자열을 GameStateFrame으로 역직렬화해야 함', () => {
      const state = createTestGameState();
      const frame = bridge.toFrame(state);
      const serialized = JSON.stringify(frame);

      const deserialized = bridge.deserialize(serialized);

      expect(deserialized).toEqual(frame);
      expect(deserialized.tick).toBe(frame.tick);
      expect(deserialized.pacman).toEqual(frame.pacman);
      expect(deserialized.ghosts).toEqual(frame.ghosts);
    });

    it('직렬화 후 역직렬화하면 원본과 동일해야 함', () => {
      const state = createTestGameState();
      const frame = bridge.toFrame(state);

      const serialized = bridge.serialize(state);
      const deserialized = bridge.deserialize(serialized);

      // GameState를 직렬화했지만 deserialize는 GameStateFrame으로 캐스팅
      // 따라서 포함된 필드만 비교
      expect(deserialized.tick).toBe(frame.tick);
      expect(deserialized.pacman).toEqual(frame.pacman);
      expect(deserialized.ghosts).toEqual(frame.ghosts);
    });
  });

  describe('reset', () => {
    it('이전 프레임 참조를 제거해야 함', () => {
      const state1 = createTestGameState({ tick: 0 });
      bridge.toFrame(state1);

      // reset 호출
      bridge.reset();

      // 이제 toDelta가 null을 반환해야 함
      const state2 = createTestGameState({ tick: 1 });
      const delta = bridge.toDelta(state2);

      expect(delta).toBeNull();
    });
  });

  describe('연속 프레임 처리', () => {
    it('여러 프레임을 순차적으로 처리하면 각각 올바른 델타를 생성해야 함', () => {
      // 프레임 1: 초기 상태
      const state1 = createTestGameState({ tick: 0 });
      const frame1 = bridge.toFrame(state1);
      expect(frame1.tick).toBe(0);

      // 프레임 2: 팩맨 이동
      const state2 = createTestGameState({
        tick: 1,
        pacman: { ...state1.pacman, x: 2, y: 1 },
      });
      const delta2 = bridge.toDelta(state2);
      expect(delta2?.tick).toBe(1);
      expect(delta2?.pacman?.x).toBe(2);

      // 프레임 3: 고스트 이동
      const ghosts = [...state2.ghosts];
      const firstGhost = ghosts[0];
      if (firstGhost) {
        ghosts[0] = { ...firstGhost, x: 4, y: 1 };
      }
      const state3 = createTestGameState({
        tick: 2,
        pacman: state2.pacman,
        ghosts,
      });
      const delta3 = bridge.toDelta(state3);
      expect(delta3?.tick).toBe(2);
      expect(delta3?.ghosts).toBeDefined();
      expect(delta3?.pacman).toBeUndefined(); // 팩맨은 변경 없음

      // 프레임 4: 펠릿 먹음
      const maze = createTestMaze();
      const newPellets = maze.pellets.map((row) => [...row]);
      const pelletRow = newPellets[1];
      if (pelletRow) {
        pelletRow[2] = false;
      }
      const state4 = createTestGameState({
        tick: 3,
        pacman: { ...state3.pacman, x: 2, y: 1, score: 10 },
        ghosts: state3.ghosts,
        maze: { ...maze, pellets: newPellets },
        score: 10,
      });
      const delta4 = bridge.toDelta(state4);
      expect(delta4?.tick).toBe(3);
      expect(delta4?.pelletsEaten).toContainEqual({ x: 2, y: 1 });
      expect(delta4?.score).toBe(10);
    });
  });
});
