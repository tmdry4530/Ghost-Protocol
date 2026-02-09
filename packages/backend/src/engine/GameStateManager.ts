/**
 * Ghost Protocol 게임 상태 관리자
 * 60FPS 결정론적 게임 루프를 구동하는 핵심 상태 머신.
 *
 * 책임:
 * - 매 틱(16.667ms)마다 게임 상태를 갱신
 * - MazeManager 와 PhysicsEngine 을 조율
 * - 점수, 생명, 라운드, 파워 모드, 과일 시스템 관리
 * - keccak256 상태 해시 생성 (온체인 검증용)
 */
import type {
  Direction,
  GhostId,
  GhostMode,
  GhostState,
  GameState,
  MazeData,
  MazeVariant,
  DifficultyTier,
  FruitInfo,
  PacmanState,
  Position,
  TierConfig,
} from '@ghost-protocol/shared';
import {
  TICK_RATE,
  BASE_PACMAN_SPEED,
  INITIAL_LIVES,
  EXTRA_LIFE_SCORE,
  REGULAR_PELLET_POINTS,
  POWER_PELLET_POINTS,
  GHOST_EAT_SCORES,
  FRUIT_POINTS_MIN,
  FRUIT_POINTS_MAX,
  FRUIT_SPAWN_THRESHOLDS,
  TIER_CONFIGS,
} from '@ghost-protocol/shared';
import { MazeManager } from './MazeManager.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import type { PhysicsEntity } from './PhysicsEngine.js';
import { keccak256, toUtf8Bytes } from 'ethers';
import { GhostAIController } from '../ai/GhostAIController.js';

// ===== xorshift128+ 의사 난수 생성기 =====

/**
 * 시드 기반 결정적 난수 생성기 (xorshift128+)
 * Math.random() 사용 금지 — 모든 난수는 이 생성기로 생성
 */
class Xorshift128Plus {
  private s0: number;
  private s1: number;

  constructor(seed: number) {
    this.s0 = seed | 0 || 1;
    this.s1 = (seed * 1812433253 + 1) | 0 || 7;
  }

  /** 0 이상 1 미만의 부동소수점 난수 반환 */
  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return ((this.s0 + this.s1) >>> 0) / 0x100000000;
  }

  /** min 이상 max 이하의 정수 난수 반환 */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// ===== 고스트 식별자 상수 =====

/** 고스트 ID 배열 (생성 순서) */
const GHOST_IDS: readonly GhostId[] = ['blinky', 'pinky', 'inky', 'clyde'];

/** 반대 방향 매핑 */
const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
} as const;

/** 가능한 이동 방향 배열 */
const ALL_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** 과일 지속 시간 (틱 단위, 약 10초) */
const FRUIT_DURATION_TICKS = 600;

/** 겁먹은 고스트 속도 배율 */
const FRIGHTENED_SPEED_MULTIPLIER = 0.5;

/** 먹힌 고스트 귀환 속도 배율 */
const EATEN_SPEED_MULTIPLIER = 2.0;

// ===== 내부 고스트 상태 =====

/** 변경 가능한 고스트 내부 상태 */
interface InternalGhostState {
  /** 고스트 식별자 */
  readonly id: GhostId;
  /** 물리 엔티티 */
  entity: PhysicsEntity;
  /** 현재 행동 모드 */
  mode: GhostMode;
  /** 고스트 하우스 내 스폰 위치 */
  readonly spawnPosition: Position;
}

// ===== 게임 설정 인터페이스 =====

/** GameStateManager 생성자 설정 */
export interface GameStateManagerConfig {
  /** 미로 변형 종류 */
  readonly variant: MazeVariant;
  /** 난수 시드 */
  readonly seed: number;
  /** 난이도 등급 */
  readonly difficulty: DifficultyTier;
}

// ===== GameStateManager 클래스 =====

/**
 * 게임 상태 관리자
 *
 * 60FPS 결정론적 게임 루프의 중심.
 * 매 틱마다 엔티티 이동, 충돌 판정, 점수 갱신, 모드 전환을 처리한다.
 */
export class GameStateManager {
  // --- 의존 모듈 ---
  private readonly mazeManager: MazeManager;
  private readonly physics: PhysicsEngine;
  private rng: Xorshift128Plus;

  // --- 설정 ---
  private readonly config: GameStateManagerConfig;
  private readonly tierConfig: TierConfig;

  // --- 미로 상태 ---
  private maze!: MazeData;
  private mutablePellets!: boolean[][];
  private mutablePowerPellets!: Position[];

  // --- 팩맨 상태 ---
  private pacmanEntity!: PhysicsEntity;
  private score = 0;
  private lives = INITIAL_LIVES;
  private extraLifeAwarded = false;

  // --- 고스트 상태 ---
  private ghosts!: InternalGhostState[];

  // --- 파워 모드 ---
  private powerActive = false;
  private powerTimer = 0;
  private ghostEatCombo = 0;

  // --- 과일 시스템 ---
  private fruitInfo: FruitInfo | null = null;
  private fruitTimer = 0;
  private pelletsEaten = 0;
  private fruitSpawnedFlags!: boolean[];

  // --- 라운드/틱 ---
  private round = 1;
  private currentTick = 0;
  private gameOver = false;

  // --- 상태 해시 ---
  private _stateHash = '';

  /** 고스트 AI 컨트롤러 */
  private aiController: GhostAIController;

  /**
   * 게임 상태 관리자 생성
   * @param config 미로 변형, 시드, 난이도 설정
   */
  constructor(config: GameStateManagerConfig) {
    this.config = config;
    this.mazeManager = new MazeManager();
    this.physics = new PhysicsEngine();
    this.rng = new Xorshift128Plus(config.seed);

    const tc = TIER_CONFIGS.get(config.difficulty);
    if (!tc) {
      throw new Error(`유효하지 않은 난이도 등급: ${String(config.difficulty)}`);
    }
    this.tierConfig = tc;

    this.aiController = new GhostAIController(1);

    this.initializeRound();
  }

  // ===== 공개 API =====

  /**
   * 한 틱(1/60초) 게임 상태 진행
   *
   * 처리 순서:
   * 1. 팩맨 방향 입력 적용
   * 2. 팩맨 이동
   * 3. 펠릿 수집 확인
   * 4. 고스트 AI 및 이동
   * 5. 충돌 판정
   * 6. 파워 모드 타이머
   * 7. 과일 타이머
   * 8. 라운드 종료 확인
   * 9. 상태 해시 갱신
   *
   * @param input 팩맨 이동 방향 (선택)
   * @returns 현재 틱의 읽기 전용 게임 상태
   */
  tick(input?: Direction): GameState {
    if (this.gameOver) {
      return this.getState();
    }

    this.currentTick++;

    // 1. 팩맨 방향 입력
    if (input) {
      this.physics.queueDirection(this.pacmanEntity, input);
    }

    // 2. 팩맨 이동
    this.physics.moveEntity(this.pacmanEntity, this.maze);

    // 3. 펠릿 수집
    this.handlePelletCollection();

    // 4. 고스트 AI + 이동
    this.updateGhosts();

    // 5. 충돌 판정
    this.handleCollisions();

    // 6. 파워 모드 타이머
    this.updatePowerMode();

    // 7. 과일 타이머
    this.updateFruit();

    // 8. 라운드 종료 (모든 펠릿 소진)
    this.checkRoundClear();

    // 9. 상태 해시
    this.updateStateHash();

    return this.getState();
  }

  /**
   * 현재 게임 상태의 읽기 전용 스냅샷 반환
   * @returns 불변 GameState 객체
   */
  getState(): GameState {
    const pacman: PacmanState = {
      x: this.pacmanEntity.tileX,
      y: this.pacmanEntity.tileY,
      direction: this.pacmanEntity.direction,
      score: this.score,
      lives: this.lives,
    };

    const ghosts: readonly GhostState[] = this.ghosts.map((g) => ({
      id: g.id,
      x: g.entity.tileX,
      y: g.entity.tileY,
      mode: g.mode,
    }));

    // 현재 펠릿/파워펠릿 상태를 반영한 MazeData 스냅샷
    const mazeSnapshot: MazeData = {
      width: this.maze.width,
      height: this.maze.height,
      walls: this.maze.walls,
      pellets: this.mutablePellets.map((row) => [...row]),
      powerPellets: [...this.mutablePowerPellets],
    };

    return {
      tick: this.currentTick,
      round: this.round,
      score: this.score,
      lives: this.lives,
      pacman,
      ghosts,
      maze: mazeSnapshot,
      powerActive: this.powerActive,
      powerTimeRemaining: this.powerTimer,
      fruitAvailable: this.fruitInfo,
      dying: this.lives <= 0,
    };
  }

  /**
   * 현재 틱의 keccak256 상태 해시 반환
   * @returns 0x 접두 hex 문자열
   */
  getStateHash(): string {
    return this._stateHash;
  }

  /**
   * 게임 오버 여부 반환
   * @returns 생명이 0이면 true
   */
  isGameOver(): boolean {
    return this.gameOver;
  }

  /**
   * 게임 초기 상태로 완전 재시작
   * 점수, 생명, 라운드 모두 초기화
   */
  reset(): void {
    this.score = 0;
    this.lives = INITIAL_LIVES;
    this.round = 1;
    this.currentTick = 0;
    this.gameOver = false;
    this.extraLifeAwarded = false;
    this.powerActive = false;
    this.powerTimer = 0;
    this.ghostEatCombo = 0;
    this.fruitInfo = null;
    this.fruitTimer = 0;
    this.pelletsEaten = 0;
    this._stateHash = '';

    // AI 컨트롤러 초기화
    this.aiController = new GhostAIController(1);

    // RNG를 원래 시드로 재초기화
    this.rng = new Xorshift128Plus(this.config.seed);

    this.initializeRound();
  }

  // ===== 초기화 =====

  /**
   * 현재 라운드의 미로/엔티티 초기화
   * 라운드 시작 시 및 reset() 시 호출
   */
  private initializeRound(): void {
    // 미로 생성
    this.maze = this.mazeManager.createMaze(this.config.variant, this.config.seed + this.round);

    // 펠릿 복사 (변경 가능)
    this.mutablePellets = this.maze.pellets.map((row) => [...row]);
    this.mutablePowerPellets = [...this.maze.powerPellets];

    // 과일 스폰 플래그 초기화
    this.fruitSpawnedFlags = FRUIT_SPAWN_THRESHOLDS.map(() => false);

    // 펠릿 카운트 초기화
    this.pelletsEaten = 0;
    this.fruitInfo = null;
    this.fruitTimer = 0;

    // 팩맨 초기화
    const pacmanSpawn = this.mazeManager.getPacmanSpawn(this.maze);
    this.pacmanEntity = this.createPacmanEntity(pacmanSpawn);

    // 고스트 초기화
    const ghostSpawns = this.mazeManager.getGhostSpawns(this.maze);
    this.ghosts = GHOST_IDS.map((id, index) => {
      const spawn = ghostSpawns[index];
      if (spawn === undefined) {
        throw new Error(`고스트 스폰 위치를 찾을 수 없습니다: ${String(index)}`);
      }
      return {
        id,
        entity: this.createGhostEntity(spawn),
        mode: 'scatter' as GhostMode,
        spawnPosition: spawn,
      };
    });

    // 파워 모드 초기화
    this.powerActive = false;
    this.powerTimer = 0;
    this.ghostEatCombo = 0;

    // AI 컨트롤러 라운드 리셋
    this.aiController.reset(this.round);
  }

  /**
   * 팩맨 PhysicsEntity 생성
   * @param spawn 스폰 위치
   */
  private createPacmanEntity(spawn: Position): PhysicsEntity {
    return {
      tileX: spawn.x,
      tileY: spawn.y,
      progress: 0,
      direction: 'left',
      nextDirection: null,
      speed: BASE_PACMAN_SPEED,
    };
  }

  /**
   * 고스트 PhysicsEntity 생성
   * @param spawn 스폰 위치
   */
  private createGhostEntity(spawn: Position): PhysicsEntity {
    return {
      tileX: spawn.x,
      tileY: spawn.y,
      progress: 0,
      direction: 'up',
      nextDirection: null,
      speed: BASE_PACMAN_SPEED * this.tierConfig.speedMultiplier,
    };
  }

  // ===== 펠릿 수집 =====

  /**
   * 팩맨의 현재 타일에서 펠릿 수집 처리
   * 일반 펠릿, 파워 펠릿, 과일 수집을 모두 확인
   */
  private handlePelletCollection(): void {
    const { tileX, tileY } = this.pacmanEntity;

    // 일반 펠릿 확인
    const pelletRow = this.mutablePellets[tileY];
    if (
      tileY >= 0 && tileY < this.maze.height &&
      tileX >= 0 && tileX < this.maze.width &&
      pelletRow !== undefined &&
      pelletRow[tileX] === true
    ) {
      pelletRow[tileX] = false;
      this.addScore(REGULAR_PELLET_POINTS);
      this.pelletsEaten++;
      this.checkFruitSpawn();
    }

    // 파워 펠릿 확인
    const ppIndex = this.mutablePowerPellets.findIndex(
      (p) => p.x === tileX && p.y === tileY,
    );
    if (ppIndex >= 0) {
      this.mutablePowerPellets.splice(ppIndex, 1);
      this.addScore(POWER_PELLET_POINTS);
      this.pelletsEaten++;
      this.activatePowerMode();
      this.checkFruitSpawn();
    }

    // 과일 수집 확인
    if (
      this.fruitInfo &&
      this.fruitInfo.x === tileX &&
      this.fruitInfo.y === tileY
    ) {
      this.addScore(this.fruitInfo.points);
      this.fruitInfo = null;
      this.fruitTimer = 0;
    }
  }

  // ===== 점수 관리 =====

  /**
   * 점수 추가 및 추가 생명 확인
   * @param points 추가할 점수
   */
  private addScore(points: number): void {
    const prevScore = this.score;
    this.score += points;

    // 10,000점 달성 시 추가 생명 (1회만)
    if (!this.extraLifeAwarded && prevScore < EXTRA_LIFE_SCORE && this.score >= EXTRA_LIFE_SCORE) {
      this.lives++;
      this.extraLifeAwarded = true;
    }
  }

  // ===== 파워 모드 =====

  /**
   * 파워 펠릿 획득 시 겁먹음 모드 활성화
   * 이미 겁먹은 상태면 타이머만 리셋
   */
  private activatePowerMode(): void {
    this.powerActive = true;
    this.powerTimer = this.tierConfig.powerPelletDuration * TICK_RATE;
    this.ghostEatCombo = 0;

    // 먹히지 않은 모든 고스트를 겁먹음 모드로 전환
    for (const ghost of this.ghosts) {
      if (ghost.mode !== 'eaten') {
        // 겁먹음 모드 진입 시 방향 반전 허용
        const currentDir = ghost.entity.direction;
        ghost.mode = 'frightened';
        ghost.entity.speed = BASE_PACMAN_SPEED * this.tierConfig.speedMultiplier * FRIGHTENED_SPEED_MULTIPLIER;
        // 방향 반전
        ghost.entity.direction = OPPOSITE_DIRECTION[currentDir];
        ghost.entity.progress = Math.max(0, 1.0 - ghost.entity.progress);
        ghost.entity.nextDirection = null;
      }
    }
  }

  /**
   * 파워 모드 타이머 갱신
   * 만료 시 모든 겁먹은 고스트를 추적 모드로 복귀
   */
  private updatePowerMode(): void {
    if (!this.powerActive) return;

    this.powerTimer--;

    if (this.powerTimer <= 0) {
      this.powerActive = false;
      this.powerTimer = 0;
      this.ghostEatCombo = 0;

      // 겁먹은 고스트를 추적 모드로 복귀
      for (const ghost of this.ghosts) {
        if (ghost.mode === 'frightened') {
          ghost.mode = 'chase';
          ghost.entity.speed = BASE_PACMAN_SPEED * this.tierConfig.speedMultiplier;
        }
      }
    }
  }

  // ===== 고스트 AI =====

  /**
   * 모든 고스트의 AI 및 이동 갱신
   * GhostAIController를 통해 성격 기반 방향 결정
   */
  private updateGhosts(): void {
    // AI 컨트롤러에서 방향 계산
    const ghostStates = this.ghosts.map((g) => ({
      id: g.id,
      x: g.entity.tileX,
      y: g.entity.tileY,
      mode: g.mode,
    }));

    const pacmanState = {
      x: this.pacmanEntity.tileX,
      y: this.pacmanEntity.tileY,
      direction: this.pacmanEntity.direction,
      score: this.score,
      lives: this.lives,
    };

    // 남은 펠릿 수 계산
    let remainingPellets = 0;
    for (const row of this.mutablePellets) {
      for (const cell of row) {
        if (cell) remainingPellets++;
      }
    }
    remainingPellets += this.mutablePowerPellets.length;

    const directions = this.aiController.getGhostDirections(
      ghostStates,
      pacmanState,
      this.maze,
      remainingPellets,
      () => this.rng.next(),
    );

    for (const ghost of this.ghosts) {
      if (ghost.mode === 'eaten') {
        this.updateEatenGhost(ghost);
      } else {
        this.updateActiveGhostWithAI(ghost, directions);
      }
    }
  }

  /**
   * AI 방향을 사용한 활성 고스트 갱신
   * 타일 경계 진입 시 AI 컨트롤러가 결정한 방향 적용
   */
  private updateActiveGhostWithAI(
    ghost: InternalGhostState,
    directions: Map<GhostId, Direction | null>,
  ): void {
    const { entity } = ghost;

    // 타일 경계에 있을 때 (progress ≈ 0) 새 방향 결정
    if (entity.progress < 0.01) {
      const aiDirection = directions.get(ghost.id);
      if (aiDirection !== null && aiDirection !== undefined) {
        // AI가 유효한 방향을 제시했는지 검증
        if (this.physics.canMove(entity.tileX, entity.tileY, aiDirection, this.maze)) {
          entity.direction = aiDirection;
          entity.nextDirection = null;
        } else {
          // AI 방향이 유효하지 않으면 기존 방향 유지 또는 유효 방향 선택
          const validDirs = this.getValidGhostDirections(entity);
          if (validDirs.length > 0) {
            const chosenIndex = this.rng.nextInt(0, validDirs.length - 1);
            const chosen = validDirs[chosenIndex];
            if (chosen !== undefined) {
              entity.direction = chosen;
              entity.nextDirection = null;
            }
          }
        }
      } else {
        // AI가 null을 반환하면 기존 랜덤 로직 폴백
        const validDirs = this.getValidGhostDirections(entity);
        if (validDirs.length > 0) {
          const chosenIndex = this.rng.nextInt(0, validDirs.length - 1);
          const chosen = validDirs[chosenIndex];
          if (chosen !== undefined) {
            entity.direction = chosen;
            entity.nextDirection = null;
          }
        }
      }
    }

    this.physics.moveEntity(entity, this.maze);
  }

  /**
   * 먹힌 고스트의 귀환 처리
   * 고스트 하우스까지 2배속으로 이동 후 리스폰
   */
  private updateEatenGhost(ghost: InternalGhostState): void {
    const { entity, spawnPosition } = ghost;

    // 스폰 위치 도착 확인
    if (entity.tileX === spawnPosition.x && entity.tileY === spawnPosition.y) {
      ghost.mode = 'chase';
      entity.speed = BASE_PACMAN_SPEED * this.tierConfig.speedMultiplier;
      entity.progress = 0;
      return;
    }

    // 스폰 방향으로 이동 (단순 맨해튼 방향)
    entity.speed = BASE_PACMAN_SPEED * EATEN_SPEED_MULTIPLIER;

    if (entity.progress < 0.01) {
      const dir = this.getDirectionToward(entity.tileX, entity.tileY, spawnPosition.x, spawnPosition.y, entity);
      entity.direction = dir;
      entity.nextDirection = null;
    }

    this.physics.moveEntity(entity, this.maze);
  }

  /**
   * 고스트가 선택 가능한 유효 방향 목록 반환
   * 역방향 제외 (겁먹음 모드 진입 시에만 역방향 허용, 이미 반전됨)
   */
  private getValidGhostDirections(entity: PhysicsEntity): Direction[] {
    const opposite = OPPOSITE_DIRECTION[entity.direction];
    const valid: Direction[] = [];

    for (const dir of ALL_DIRECTIONS) {
      if (dir === opposite) continue;
      if (this.physics.canMove(entity.tileX, entity.tileY, dir, this.maze)) {
        valid.push(dir);
      }
    }

    // 막다른 골목이면 역방향도 허용
    if (valid.length === 0) {
      if (this.physics.canMove(entity.tileX, entity.tileY, opposite, this.maze)) {
        valid.push(opposite);
      }
    }

    return valid;
  }

  /**
   * 목표 위치를 향한 최적 방향 반환 (먹힌 고스트 귀환용)
   * 이동 가능한 방향 중 목표에 가장 가까운 방향 선택
   */
  private getDirectionToward(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    entity: PhysicsEntity,
  ): Direction {
    const opposite = OPPOSITE_DIRECTION[entity.direction];
    let bestDir: Direction = entity.direction;
    let bestDist = Infinity;

    for (const dir of ALL_DIRECTIONS) {
      if (dir === opposite) continue;
      if (!this.physics.canMove(fromX, fromY, dir, this.maze)) continue;

      const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
      const nx = fromX + dx;
      const ny = fromY + dy;
      const dist = Math.abs(nx - toX) + Math.abs(ny - toY);

      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  // ===== 충돌 판정 =====

  /**
   * 팩맨-고스트 충돌 처리
   * 겁먹은 고스트 → 먹기 (점수 획득)
   * 일반 고스트 → 사망 (생명 차감)
   */
  private handleCollisions(): void {
    for (const ghost of this.ghosts) {
      if (ghost.mode === 'eaten') continue;

      if (this.physics.checkCollision(this.pacmanEntity, ghost.entity)) {
        if (ghost.mode === 'frightened') {
          this.eatGhost(ghost);
        } else {
          this.handlePacmanDeath();
          return; // 사망 시 즉시 중단
        }
      }
    }
  }

  /**
   * 겁먹은 고스트 먹기 처리
   * 콤보 점수: 200 → 400 → 800 → 1600
   */
  private eatGhost(ghost: InternalGhostState): void {
    const comboIndex = Math.min(this.ghostEatCombo, GHOST_EAT_SCORES.length - 1);
    const points = GHOST_EAT_SCORES[comboIndex];
    if (points !== undefined) {
      this.addScore(points);
    }
    this.ghostEatCombo++;

    ghost.mode = 'eaten';
    ghost.entity.speed = BASE_PACMAN_SPEED * EATEN_SPEED_MULTIPLIER;
  }

  /**
   * 팩맨 사망 처리
   * 생명 차감, 위치 리셋, 게임 오버 확인
   */
  private handlePacmanDeath(): void {
    this.lives--;

    if (this.lives <= 0) {
      this.gameOver = true;
      return;
    }

    // 팩맨 위치 리셋
    const pacmanSpawn = this.mazeManager.getPacmanSpawn(this.maze);
    this.pacmanEntity = this.createPacmanEntity(pacmanSpawn);

    // 고스트 위치 리셋
    const ghostSpawns = this.mazeManager.getGhostSpawns(this.maze);
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      const spawn = ghostSpawns[i];
      if (ghost !== undefined && spawn !== undefined) {
        ghost.entity = this.createGhostEntity(spawn);
        ghost.mode = 'scatter';
      }
    }

    // 파워 모드 해제
    this.powerActive = false;
    this.powerTimer = 0;
    this.ghostEatCombo = 0;
  }

  // ===== 과일 시스템 =====

  /**
   * 펠릿 섭취 수에 따른 과일 스폰 확인
   * 70개, 170개 도달 시 각각 1회 스폰
   */
  private checkFruitSpawn(): void {
    for (let i = 0; i < FRUIT_SPAWN_THRESHOLDS.length; i++) {
      const threshold = FRUIT_SPAWN_THRESHOLDS[i];
      const alreadySpawned = this.fruitSpawnedFlags[i];
      if (threshold !== undefined && alreadySpawned === false && this.pelletsEaten >= threshold) {
        this.fruitSpawnedFlags[i] = true;
        this.spawnFruit();
      }
    }
  }

  /**
   * 과일 생성
   * 고스트 하우스 아래 고정 위치에 생성
   * 점수는 시드 PRNG로 100~500 범위 무작위 결정
   */
  private spawnFruit(): void {
    // 이미 과일이 있으면 덮어쓰기
    const points = this.rng.nextInt(FRUIT_POINTS_MIN, FRUIT_POINTS_MAX);
    this.fruitInfo = {
      x: 14,
      y: 17, // 고스트 하우스 아래
      points,
    };
    this.fruitTimer = FRUIT_DURATION_TICKS;
  }

  /**
   * 과일 타이머 갱신
   * 600틱(~10초) 경과 시 소멸
   */
  private updateFruit(): void {
    if (!this.fruitInfo) return;

    this.fruitTimer--;
    if (this.fruitTimer <= 0) {
      this.fruitInfo = null;
      this.fruitTimer = 0;
    }
  }

  // ===== 라운드 진행 =====

  /**
   * 모든 펠릿 소진 시 다음 라운드로 진행
   * 미로 재생성, 위치 리셋, 점수/생명 유지
   */
  private checkRoundClear(): void {
    // 일반 펠릿 잔여 확인
    let hasRegularPellets = false;
    for (let y = 0; y < this.maze.height && !hasRegularPellets; y++) {
      const row = this.mutablePellets[y];
      if (row !== undefined) {
        for (let x = 0; x < this.maze.width && !hasRegularPellets; x++) {
          if (row[x] === true) {
            hasRegularPellets = true;
          }
        }
      }
    }

    // 파워 펠릿 잔여 확인
    if (!hasRegularPellets && this.mutablePowerPellets.length === 0) {
      this.round++;
      this.initializeRound();
    }
  }

  // ===== 상태 해시 =====

  /**
   * 현재 게임 상태의 keccak256 해시 생성
   * 온체인 검증 및 리플레이 무결성에 사용
   */
  private updateStateHash(): void {
    const stateString = [
      this.currentTick,
      this.round,
      this.score,
      this.lives,
      this.pacmanEntity.tileX,
      this.pacmanEntity.tileY,
      this.pacmanEntity.direction,
      this.powerActive ? 1 : 0,
      this.powerTimer,
      ...this.ghosts.flatMap((g) => [g.entity.tileX, g.entity.tileY, g.mode]),
    ].join(',');

    this._stateHash = keccak256(toUtf8Bytes(stateString));
  }
}
