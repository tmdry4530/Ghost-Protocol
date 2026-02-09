/**
 * AgentSandbox 단위 테스트
 *
 * 에이전트 샌드박스의 모든 핵심 동작을 검증한다.
 * 정상 실행, 타임아웃, 잘못된 반환값, 구문 오류, 메모리 제한,
 * 보안 차단, 리소스 해제, 연속 실행 등을 포괄적으로 테스트한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AgentSandbox } from '../AgentSandbox.js';
import type { GameState } from '@ghost-protocol/shared';

// ===== 테스트 헬퍼 =====

/** 최소 유효 GameState를 생성하는 헬퍼 함수 */
function createTestGameState(): GameState {
  return {
    tick: 0,
    round: 1,
    score: 0,
    lives: 3,
    pacman: { x: 14, y: 23, direction: 'right', score: 0, lives: 3 },
    ghosts: [],
    maze: {
      width: 28,
      height: 31,
      walls: Array.from({ length: 31 }, () =>
        Array.from({ length: 28 }, () => false),
      ),
      pellets: Array.from({ length: 31 }, () =>
        Array.from({ length: 28 }, () => true),
      ),
      powerPellets: [
        { x: 1, y: 3 },
        { x: 26, y: 3 },
        { x: 1, y: 23 },
        { x: 26, y: 23 },
      ],
    },
    powerActive: false,
    powerTimeRemaining: 0,
    fruitAvailable: null,
    dying: false,
  };
}

/** 유효한 에이전트 코드 (항상 'up' 반환) */
const VALID_AGENT_CODE = `
  function onGameState(state) {
    return { direction: 'up' };
  }
`;

/** 상태 기반 에이전트 코드 (팩맨 위치에 따라 방향 결정) */
const STATEFUL_AGENT_CODE = `
  function onGameState(state) {
    if (state.pacman.x < 14) {
      return { direction: 'right' };
    }
    return { direction: 'left' };
  }
`;

/** 무한 루프 에이전트 코드 (타임아웃 테스트용) */
const INFINITE_LOOP_CODE = `
  function onGameState(state) {
    while (true) {}
    return { direction: 'up' };
  }
`;

/** 잘못된 반환값 에이전트 코드 */
const INVALID_RETURN_CODE = `
  function onGameState(state) {
    return { direction: 'invalid_direction' };
  }
`;

/** null 반환 에이전트 코드 */
const NULL_RETURN_CODE = `
  function onGameState(state) {
    return null;
  }
`;

/** 숫자 반환 에이전트 코드 */
const NUMBER_RETURN_CODE = `
  function onGameState(state) {
    return 42;
  }
`;

/** 구문 오류 에이전트 코드 */
const SYNTAX_ERROR_CODE = `
  function onGameState(state {
    return { direction: 'up' };
  }
`;

/** onGameState 함수가 없는 코드 */
const MISSING_FUNCTION_CODE = `
  var x = 42;
`;

/** 메모리 대량 할당 에이전트 코드 */
const MEMORY_HOG_CODE = `
  function onGameState(state) {
    var arr = [];
    for (var i = 0; i < 100000000; i++) {
      arr.push(new Array(100000).fill('x'));
    }
    return { direction: 'up' };
  }
`;

/** require 시도 에이전트 코드 */
const REQUIRE_FS_CODE = `
  function onGameState(state) {
    var fs = require('fs');
    return { direction: 'up' };
  }
`;

/** 전역 fetch 시도 에이전트 코드 */
const FETCH_CODE = `
  function onGameState(state) {
    fetch('http://example.com');
    return { direction: 'up' };
  }
`;

/** process 접근 시도 에이전트 코드 */
const PROCESS_ACCESS_CODE = `
  function onGameState(state) {
    process.exit(1);
    return { direction: 'up' };
  }
`;

// ===== 테스트 시작 =====

describe('AgentSandbox', () => {
  let sandbox: AgentSandbox | undefined;

  afterEach(() => {
    // 매 테스트 후 샌드박스 리소스 정리
    sandbox?.dispose();
  });

  // ===== 정상 실행 =====

  describe('정상 실행', () => {
    it('유효한 에이전트 코드 로드 후 GameState 전달 시 유효한 AgentAction을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'test-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      expect(action).not.toBeNull();
      expect(action?.direction).toBe('up');
    });

    it('상태 기반 에이전트가 GameState에 따라 다른 방향을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(STATEFUL_AGENT_CODE, 'stateful-agent');

      // pacman.x가 14인 기본 상태 → 'left' 반환
      const state1 = createTestGameState();
      const action1 = await sandbox.executeAction(state1);
      expect(action1?.direction).toBe('left');

      // pacman.x를 5로 변경 → 'right' 반환
      const state2: GameState = {
        ...createTestGameState(),
        pacman: { ...createTestGameState().pacman, x: 5 },
      };
      const action2 = await sandbox.executeAction(state2);
      expect(action2?.direction).toBe('right');
    });
  });

  // ===== 타임아웃 =====

  describe('100ms 타임아웃', () => {
    it('무한 루프 에이전트 코드 실행 시 null을 반환해야 한다 (턴 몰수)', async () => {
      sandbox = new AgentSandbox({ timeoutMs: 100 });
      await sandbox.loadAgent(INFINITE_LOOP_CODE, 'infinite-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      expect(action).toBeNull();
    });
  });

  // ===== 잘못된 반환값 =====

  describe('잘못된 반환값', () => {
    it('유효하지 않은 direction 값 반환 시 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(INVALID_RETURN_CODE, 'invalid-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      expect(action).toBeNull();
    });

    it('null 반환 시 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(NULL_RETURN_CODE, 'null-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      expect(action).toBeNull();
    });

    it('숫자 반환 시 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(NUMBER_RETURN_CODE, 'number-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      expect(action).toBeNull();
    });
  });

  // ===== 구문 오류 =====

  describe('구문 오류', () => {
    it('잘못된 JavaScript 코드로 loadAgent 호출 시 에러가 발생해야 한다', async () => {
      sandbox = new AgentSandbox();

      await expect(
        sandbox.loadAgent(SYNTAX_ERROR_CODE, 'syntax-error-agent'),
      ).rejects.toThrow();
    });

    it('onGameState 함수가 없는 코드로 loadAgent 호출 시 에러가 발생해야 한다', async () => {
      sandbox = new AgentSandbox();

      await expect(
        sandbox.loadAgent(MISSING_FUNCTION_CODE, 'missing-fn-agent'),
      ).rejects.toThrow('onGameState');
    });
  });

  // ===== 메모리 제한 =====

  describe('메모리 제한', () => {
    it('대량 메모리 할당 시 에러 처리 후 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox({ memoryLimitMB: 8 });
      await sandbox.loadAgent(MEMORY_HOG_CODE, 'memory-hog-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      // 메모리 초과 시 에러가 발생하고 null 반환
      expect(action).toBeNull();
    });
  });

  // ===== 보안: 파일시스템 접근 차단 =====

  describe('파일시스템 접근 차단', () => {
    it('require("fs") 시도 시 에러 처리 후 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(REQUIRE_FS_CODE, 'fs-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      // require가 정의되지 않아 에러 → null
      expect(action).toBeNull();
    });
  });

  // ===== 보안: 네트워크 접근 차단 =====

  describe('네트워크 접근 차단', () => {
    it('fetch 시도 시 에러 처리 후 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(FETCH_CODE, 'fetch-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      // fetch가 정의되지 않아 에러 → null
      expect(action).toBeNull();
    });

    it('process 접근 시도 시 에러 처리 후 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(PROCESS_ACCESS_CODE, 'process-agent');

      const state = createTestGameState();
      const action = await sandbox.executeAction(state);

      // process가 정의되지 않아 에러 → null
      expect(action).toBeNull();
    });
  });

  // ===== dispose 후 재사용 불가 =====

  describe('dispose 후 재사용 불가', () => {
    it('dispose 후 executeAction 호출 시 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'disposable-agent');

      // 정상 동작 확인
      const action1 = await sandbox.executeAction(createTestGameState());
      expect(action1).not.toBeNull();

      // 리소스 해제
      sandbox.dispose();

      // dispose 후 실행 시도 → null
      const action2 = await sandbox.executeAction(createTestGameState());
      expect(action2).toBeNull();
    });

    it('dispose 후 loadAgent 호출 시 에러가 발생해야 한다', async () => {
      sandbox = new AgentSandbox();
      sandbox.dispose();

      await expect(
        sandbox.loadAgent(VALID_AGENT_CODE, 'reuse-agent'),
      ).rejects.toThrow('이미 해제');
    });

    it('dispose를 여러 번 호출해도 에러가 발생하지 않아야 한다', () => {
      sandbox = new AgentSandbox();
      sandbox.dispose();
      sandbox.dispose();
      sandbox.dispose();
      // 에러 없이 완료되면 성공
    });
  });

  // ===== getMemoryUsage =====

  describe('getMemoryUsage', () => {
    it('에이전트 로드 후 메모리 사용량이 0보다 커야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'memory-test-agent');

      const usage = sandbox.getMemoryUsage();
      expect(usage).toBeGreaterThan(0);
    });

    it('에이전트 로드 전 메모리 사용량이 0이어야 한다', () => {
      sandbox = new AgentSandbox();
      const usage = sandbox.getMemoryUsage();
      expect(usage).toBe(0);
    });

    it('dispose 후 메모리 사용량이 0이어야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'memory-dispose-agent');
      sandbox.dispose();

      const usage = sandbox.getMemoryUsage();
      expect(usage).toBe(0);
    });
  });

  // ===== agentName =====

  describe('agentName', () => {
    it('로드 전에는 null을 반환해야 한다', () => {
      sandbox = new AgentSandbox();
      expect(sandbox.agentName).toBeNull();
    });

    it('로드 후에는 에이전트 이름을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'named-agent');
      expect(sandbox.agentName).toBe('named-agent');
    });

    it('dispose 후에는 null을 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'disposed-named-agent');
      expect(sandbox.agentName).toBe('disposed-named-agent');

      sandbox.dispose();
      expect(sandbox.agentName).toBeNull();
    });
  });

  // ===== 연속 실행 =====

  describe('연속 실행', () => {
    it('여러 번 executeAction 호출 시 일관된 결과를 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(VALID_AGENT_CODE, 'consistent-agent');

      const state = createTestGameState();
      const results: (string | undefined)[] = [];

      for (let i = 0; i < 10; i++) {
        const action = await sandbox.executeAction(state);
        results.push(action?.direction);
      }

      // 모든 결과가 'up'이어야 함
      for (const dir of results) {
        expect(dir).toBe('up');
      }
    });

    it('다른 GameState로 연속 실행 시 각각 올바른 결과를 반환해야 한다', async () => {
      sandbox = new AgentSandbox();
      await sandbox.loadAgent(STATEFUL_AGENT_CODE, 'multi-state-agent');

      // x=14 → left
      const action1 = await sandbox.executeAction(createTestGameState());
      expect(action1?.direction).toBe('left');

      // x=5 → right
      const state2: GameState = {
        ...createTestGameState(),
        pacman: { ...createTestGameState().pacman, x: 5 },
      };
      const action2 = await sandbox.executeAction(state2);
      expect(action2?.direction).toBe('right');

      // x=14 → left (다시)
      const action3 = await sandbox.executeAction(createTestGameState());
      expect(action3?.direction).toBe('left');
    });
  });

  // ===== 에이전트 재로드 =====

  describe('에이전트 재로드', () => {
    it('다른 에이전트 코드를 재로드할 수 있어야 한다', async () => {
      sandbox = new AgentSandbox();

      // 첫 번째 에이전트 로드 ('up' 반환)
      await sandbox.loadAgent(VALID_AGENT_CODE, 'first-agent');
      const action1 = await sandbox.executeAction(createTestGameState());
      expect(action1?.direction).toBe('up');

      // 다른 에이전트로 재로드 ('left' 반환)
      const leftAgentCode = `
        function onGameState(state) {
          return { direction: 'left' };
        }
      `;
      await sandbox.loadAgent(leftAgentCode, 'second-agent');
      const action2 = await sandbox.executeAction(createTestGameState());
      expect(action2?.direction).toBe('left');

      expect(sandbox.agentName).toBe('second-agent');
    });
  });

  // ===== 설정 검증 =====

  describe('설정 검증', () => {
    it('기본 설정으로 생성할 수 있어야 한다', () => {
      sandbox = new AgentSandbox();
      expect(sandbox.agentName).toBeNull();
    });

    it('커스텀 메모리 제한으로 생성할 수 있어야 한다', async () => {
      sandbox = new AgentSandbox({ memoryLimitMB: 64 });
      await sandbox.loadAgent(VALID_AGENT_CODE, 'custom-memory-agent');

      const action = await sandbox.executeAction(createTestGameState());
      expect(action?.direction).toBe('up');
    });

    it('커스텀 타임아웃으로 생성할 수 있어야 한다', async () => {
      sandbox = new AgentSandbox({ timeoutMs: 200 });
      await sandbox.loadAgent(VALID_AGENT_CODE, 'custom-timeout-agent');

      const action = await sandbox.executeAction(createTestGameState());
      expect(action?.direction).toBe('up');
    });
  });
});
