/**
 * 로컬 게임 엔진 — 브라우저 전용 팩맨 시뮬레이션
 *
 * 백엔드나 Node.js 의존성 없이 프론트엔드에서 완전히 자체 실행되는
 * 팩맨 게임 엔진. 결정론적 PRNG를 사용하여 동일한 시드로
 * 동일한 결과를 재현할 수 있음.
 */

import type {
  Direction,
  GhostId,
  GhostMode,
  MazeVariant,
  DifficultyTier,
  Position,
  GhostState,
  MazeData,
  GameState,
  FruitInfo,
  TierConfig,
} from '@ghost-protocol/shared';

import {
  MAZE_WIDTH,
  MAZE_HEIGHT,
  TICK_RATE,
  BASE_PACMAN_SPEED,
  INITIAL_LIVES,
  REGULAR_PELLET_POINTS,
  POWER_PELLET_POINTS,
  GHOST_EAT_SCORES,
  EXTRA_LIFE_SCORE,
  TIER_CONFIGS,
  FRUIT_SPAWN_THRESHOLDS,
  FRUIT_POINTS_MIN,
  FRUIT_POINTS_MAX,
} from '@ghost-protocol/shared';

// ===== 방향 보조 상수 =====

/** 방향별 타일 이동 벡터 */
const DIRECTION_VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 반대 방향 매핑 */
const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** 모든 이동 방향 목록 */
const ALL_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

// ===== 스폰 위치 =====

/** 팩맨 초기 스폰 위치 */
const PACMAN_SPAWN: Position = { x: 14, y: 23 };

/** 각 고스트의 초기 스폰 위치 */
const GHOST_SPAWNS: Record<GhostId, Position> = {
  blinky: { x: 14, y: 11 },
  pinky: { x: 12, y: 14 },
  inky: { x: 14, y: 14 },
  clyde: { x: 16, y: 14 },
};

/** 고스트 ID 목록 */
const GHOST_IDS: readonly GhostId[] = ['blinky', 'pinky', 'inky', 'clyde'];

/** 터널 통과 Y 좌표 */
const TUNNEL_Y = 14;

/** 과일 표시 지속 시간 (틱) */
const FRUIT_DISPLAY_TICKS = 600;

/** 과일 스폰 위치 (미로 중앙 하단) */
const FRUIT_SPAWN_POSITION: Position = { x: 14, y: 17 };

// ===== 클래식 미로 템플릿 =====

/** 28x31 클래식 팩맨 미로 문자열 템플릿 */
const CLASSIC_MAZE: string[] = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #GGGGGG# ##.######',
  'T     .   #GGGGGG#   .     T',
  '######.## #GGGGGG# ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

// ===== Xorshift128Plus PRNG =====

/**
 * 결정론적 의사난수 생성기 (Xorshift128+)
 *
 * 시드 기반으로 동일한 난수 시퀀스를 생성하여
 * 게임 재현성을 보장함.
 */
class Xorshift128Plus {
  /** 내부 상태 A (64비트를 두 개의 32비트로 분할) */
  private s0High: number;
  private s0Low: number;
  /** 내부 상태 B */
  private s1High: number;
  private s1Low: number;

  /**
   * PRNG 초기화
   * @param seed - 시드 값 (정수)
   */
  constructor(seed: number) {
    // 시드로부터 초기 상태를 생성 (splitmix32 기반)
    seed = seed | 0;
    this.s0High = this.splitmix32(seed);
    this.s0Low = this.splitmix32(this.s0High);
    this.s1High = this.splitmix32(this.s0Low);
    this.s1Low = this.splitmix32(this.s1High);

    // 상태가 모두 0이면 기본값 설정
    if (this.s0High === 0 && this.s0Low === 0 && this.s1High === 0 && this.s1Low === 0) {
      this.s0High = 1;
    }
  }

  /**
   * Splitmix32 해시 함수 — 시드 확산용
   * @param state - 입력 상태
   * @returns 해시된 32비트 정수
   */
  private splitmix32(state: number): number {
    state = (state + 0x9e3779b9) | 0;
    state = Math.imul(state ^ (state >>> 16), 0x85ebca6b);
    state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35);
    return (state ^ (state >>> 16)) | 0;
  }

  /**
   * 다음 난수 생성 (0 이상 1 미만)
   * @returns 0.0 ~ 1.0 사이 부동소수점 난수
   */
  next(): number {
    // 간소화된 xorshift — 32비트 연산으로 충분
    let s1 = this.s0High;
    const s0 = this.s1High;
    this.s0High = s0;
    s1 ^= (s1 << 23) | 0;
    s1 ^= (s1 >>> 17) | 0;
    s1 ^= s0;
    s1 ^= (s0 >>> 26) | 0;
    this.s1High = s1;

    // 0~1 사이 값으로 변환 (양수 보장)
    return ((this.s0High + this.s1High) >>> 0) / 0x100000000;
  }

  /**
   * 범위 내 정수 난수 생성
   * @param min - 최솟값 (포함)
   * @param max - 최댓값 (포함)
   * @returns min ~ max 사이 정수
   */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

// ===== LocalMaze 클래스 =====

/** 미로 타일 문자 해석 결과 */
interface ParsedTile {
  /** 벽 여부 */
  isWall: boolean;
  /** 일반 펠릿 존재 여부 */
  hasPellet: boolean;
  /** 파워 펠릿 존재 여부 */
  hasPowerPellet: boolean;
}

/**
 * 미로 관리 유틸리티
 *
 * 문자열 템플릿을 MazeData로 파싱하고
 * 벽 충돌 및 이동 가능 여부를 판별함.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace LocalMaze {
  /**
   * 단일 미로 문자를 타일 정보로 해석
   * @param ch - 미로 템플릿 문자
   * @returns 해석된 타일 정보
   */
  export function parseTileChar(ch: string): ParsedTile {
    switch (ch) {
      case '#':
        return { isWall: true, hasPellet: false, hasPowerPellet: false };
      case '.':
        return { isWall: false, hasPellet: true, hasPowerPellet: false };
      case 'o':
        return { isWall: false, hasPellet: false, hasPowerPellet: true };
      case 'G':
      case '-':
        // 고스트 하우스 내부 — 벽도 펠릿도 아님
        return { isWall: false, hasPellet: false, hasPowerPellet: false };
      case 'T':
        // 터널 입구 — 통과 가능
        return { isWall: false, hasPellet: false, hasPowerPellet: false };
      case ' ':
        // 빈 공간 (미로 외부 또는 통로)
        return { isWall: false, hasPellet: false, hasPowerPellet: false };
      default:
        return { isWall: true, hasPellet: false, hasPowerPellet: false };
    }
  }

  /**
   * 문자열 미로 템플릿을 MazeData 구조체로 변환
   * @param template - 미로 문자열 배열 (행 단위)
   * @returns 파싱된 미로 데이터
   */
  export function parse(template: string[]): MazeData {
    const walls: boolean[][] = [];
    const pellets: boolean[][] = [];
    const powerPellets: Position[] = [];

    for (let y = 0; y < MAZE_HEIGHT; y++) {
      const wallRow: boolean[] = [];
      const pelletRow: boolean[] = [];
      const row = template[y];

      for (let x = 0; x < MAZE_WIDTH; x++) {
        const ch = row?.[x] ?? '#';
        const tile = LocalMaze.parseTileChar(ch);

        wallRow.push(tile.isWall);
        pelletRow.push(tile.hasPellet);

        if (tile.hasPowerPellet) {
          powerPellets.push({ x, y });
          // 파워 펠릿 위치에도 펠릿 플래그 설정 (수집 추적용)
          pelletRow[pelletRow.length - 1] = true;
        }
      }

      walls.push(wallRow);
      pellets.push(pelletRow);
    }

    return {
      width: MAZE_WIDTH,
      height: MAZE_HEIGHT,
      walls,
      pellets,
      powerPellets,
    };
  }

  /**
   * 해당 좌표가 벽인지 확인
   * @param maze - 미로 데이터
   * @param x - X 좌표
   * @param y - Y 좌표
   * @returns 벽이면 true
   */
  export function isWall(maze: MazeData, x: number, y: number): boolean {
    // 범위 밖은 터널 통과 허용 (좌우)
    if (y === TUNNEL_Y && (x < 0 || x >= MAZE_WIDTH)) {
      return false;
    }
    if (x < 0 || x >= MAZE_WIDTH || y < 0 || y >= MAZE_HEIGHT) {
      return true;
    }
    const row = maze.walls[y];
    if (row === undefined) {
      return true;
    }
    return row[x] ?? true;
  }

  /**
   * 현재 위치에서 특정 방향으로 이동 가능한지 확인
   * @param maze - 미로 데이터
   * @param x - 현재 X 좌표
   * @param y - 현재 Y 좌표
   * @param dir - 이동 방향
   * @returns 이동 가능하면 true
   */
  export function canMove(maze: MazeData, x: number, y: number, dir: Direction): boolean {
    const vec = DIRECTION_VECTORS[dir];
    const nx = x + vec.x;
    const ny = y + vec.y;
    return !LocalMaze.isWall(maze, nx, ny);
  }
}

// ===== 내부 엔티티 상태 인터페이스 =====

/** 팩맨 내부 이동 상태 */
interface PacmanInternal {
  /** 현재 타일 X 좌표 */
  tileX: number;
  /** 현재 타일 Y 좌표 */
  tileY: number;
  /** 타일 간 이동 진행도 (0.0 ~ 1.0) */
  progress: number;
  /** 현재 이동 방향 */
  direction: Direction;
  /** 입력 대기 중인 다음 방향 */
  nextDirection: Direction;
  /** 이동 속도 (타일/초) */
  speed: number;
}

/** 고스트 내부 이동 상태 */
interface GhostInternal {
  /** 고스트 식별자 */
  id: GhostId;
  /** 현재 타일 X 좌표 */
  tileX: number;
  /** 현재 타일 Y 좌표 */
  tileY: number;
  /** 타일 간 이동 진행도 (0.0 ~ 1.0) */
  progress: number;
  /** 현재 이동 방향 */
  direction: Direction;
  /** 다음 이동 방향 */
  nextDirection: Direction;
  /** 이동 속도 (타일/초) */
  speed: number;
  /** 현재 행동 모드 */
  mode: GhostMode;
}

// ===== LocalGameEngine 클래스 =====

/**
 * 로컬 게임 엔진
 *
 * 브라우저에서 완전히 자체 실행되는 팩맨 게임 엔진.
 * 매 틱(1/60초)마다 tick()을 호출하여 게임을 진행하고
 * GameState를 반환함.
 *
 * @example
 * ```typescript
 * const engine = new LocalGameEngine('classic', 1, 42);
 * const state = engine.tick('left');
 * console.log(state.score);
 * ```
 */
export class LocalGameEngine {
  // ===== 게임 진행 상태 =====

  /** 현재 틱 카운터 */
  private tickCount: number = 0;

  /** 현재 라운드 번호 */
  private round: number = 1;

  /** 누적 점수 */
  private score: number = 0;

  /** 남은 생명 수 */
  private lives: number = INITIAL_LIVES;

  /** 게임 종료 플래그 */
  private gameOverFlag: boolean = false;

  // ===== 엔티티 상태 =====

  /** 팩맨 내부 상태 */
  private pacman: PacmanInternal;

  /** 고스트 내부 상태 배열 */
  private ghosts: GhostInternal[];

  // ===== 미로 상태 =====

  /** 파싱된 원본 미로 데이터 (불변) */
  private readonly baseMaze: MazeData;

  /** 현재 미로 벽 데이터 (참조용, 라운드 간 불변) */
  private maze: MazeData;

  /** 변경 가능한 펠릿 배열 (수집 시 false로 변경) */
  private mutablePellets: boolean[][];

  /** 남아 있는 파워 펠릿 위치 목록 */
  private remainingPowerPellets: Position[];

  // ===== 파워 펠릿 상태 =====

  /** 파워 모드 활성 여부 */
  private powerActive: boolean = false;

  /** 파워 모드 남은 시간 (틱) */
  private powerTimeRemaining: number = 0;

  /** 현재 파워 모드의 연속 고스트 처치 콤보 */
  private ghostEatCombo: number = 0;

  // ===== 과일 상태 =====

  /** 현재 과일 정보 (없으면 null) */
  private fruitInfo: FruitInfo | null = null;

  /** 과일 표시 남은 시간 (틱) */
  private fruitTimer: number = 0;

  // ===== 수집 추적 =====

  /** 이번 라운드에서 먹은 펠릿 수 */
  private pelletsEaten: number = 0;

  /** 이번 라운드의 전체 펠릿 수 */
  private totalPelletsInRound: number = 0;

  /** 추가 생명 수여 여부 */
  private extraLifeAwarded: boolean = false;

  /** 과일 스폰 완료된 임계값 인덱스 추적 */
  private fruitSpawnIndex: number = 0;

  /** 사망 애니메이션 중 플래그 */
  private isDying: boolean = false;

  /** 사망 일시정지 남은 틱 수 */
  private deathPauseTicks: number = 0;

  // ===== 난이도 설정 =====

  /** 현재 난이도 설정 */
  private readonly tierConfig: TierConfig;

  /** 파워 펠릿 지속 시간 (틱) */
  private readonly powerDurationTicks: number;

  // ===== 난수 생성기 =====

  /** 결정론적 PRNG 인스턴스 */
  private rng: Xorshift128Plus;

  /** 초기 시드 값 (리셋용) */
  private readonly initialSeed: number;

  /**
   * 로컬 게임 엔진 생성
   * @param _variant - 미로 변형 (현재 'classic'만 지원)
   * @param difficulty - 난이도 등급 (기본: 1)
   * @param seed - PRNG 시드 (기본: 현재 시각)
   */
  constructor(_variant: MazeVariant = 'classic', difficulty: DifficultyTier = 1, seed?: number) {
    this.initialSeed = seed ?? Date.now();
    this.rng = new Xorshift128Plus(this.initialSeed);

    // 난이도 설정 로드
    const config = TIER_CONFIGS.get(difficulty);
    if (config === undefined) {
      throw new Error(`유효하지 않은 난이도 등급: ${String(difficulty)}`);
    }
    this.tierConfig = config;

    // 파워 펠릿 지속 시간 계산 (초 → 틱)
    this.powerDurationTicks = this.tierConfig.powerPelletDuration * TICK_RATE;

    // 미로 파싱 및 초기화
    this.baseMaze = LocalMaze.parse(CLASSIC_MAZE);
    this.maze = this.baseMaze;
    this.mutablePellets = this.clonePellets(this.baseMaze.pellets);
    this.remainingPowerPellets = [...this.baseMaze.powerPellets];
    this.totalPelletsInRound = this.countPellets();

    // 엔티티 초기화
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
  }

  // ===== 공개 API =====

  /**
   * 게임 한 틱 진행
   *
   * 60fps 기준으로 매 프레임 호출해야 함.
   * 선택적으로 방향 입력을 전달하여 팩맨을 조작.
   *
   * @param input - 팩맨 이동 방향 입력 (선택사항)
   * @returns 현재 게임 상태
   */
  tick(input?: Direction): GameState {
    if (this.gameOverFlag) {
      return this.getState();
    }

    // 사망 일시정지 — 게임 멈춤, 카운트다운 후 위치 리셋
    if (this.isDying && !this.gameOverFlag) {
      this.deathPauseTicks--;
      if (this.deathPauseTicks <= 0) {
        this.isDying = false;
        this.resetPositions();
      }
      return this.getState();
    }

    // 1. 틱 카운터 증가
    this.tickCount++;

    // 2. 팩맨 방향 입력 처리
    if (input !== undefined) {
      this.handleInput(input);
    }

    // 3. 팩맨 이동
    this.movePacman();

    // 4. 펠릿 수집 확인
    this.checkPelletCollection();

    // 5. 고스트 이동
    this.moveGhosts();

    // 6. 팩맨-고스트 충돌 확인
    this.checkCollisions();

    // 7. 파워 모드 타이머 갱신
    this.updatePowerTimer();

    // 8. 과일 로직
    this.updateFruit();

    // 9. 라운드 클리어 확인
    this.checkRoundClear();

    // 10. 추가 생명 확인
    this.checkExtraLife();

    return this.getState();
  }

  /**
   * 현재 게임 상태를 GameState 객체로 반환
   * @returns 현재 게임 상태
   */
  getState(): GameState {
    return {
      tick: this.tickCount,
      round: this.round,
      score: this.score,
      lives: this.lives,
      pacman: {
        x: this.pacman.tileX,
        y: this.pacman.tileY,
        direction: this.pacman.direction,
        score: this.score,
        lives: this.lives,
      },
      ghosts: this.ghosts.map(
        (g): GhostState => ({
          id: g.id,
          x: g.tileX,
          y: g.tileY,
          mode: g.mode,
        }),
      ),
      maze: {
        width: MAZE_WIDTH,
        height: MAZE_HEIGHT,
        walls: this.maze.walls,
        pellets: this.mutablePellets,
        powerPellets: this.remainingPowerPellets,
      },
      powerActive: this.powerActive,
      powerTimeRemaining: this.powerTimeRemaining,
      fruitAvailable: this.fruitInfo,
      dying: this.isDying,
    };
  }

  /**
   * 게임 종료 여부 확인
   * @returns 게임이 종료되었으면 true
   */
  isGameOver(): boolean {
    return this.gameOverFlag;
  }

  /**
   * 게임을 초기 상태로 리셋
   *
   * 시드를 재사용하여 동일한 난수 시퀀스로 재시작.
   */
  reset(): void {
    this.tickCount = 0;
    this.round = 1;
    this.score = 0;
    this.lives = INITIAL_LIVES;
    this.gameOverFlag = false;
    this.powerActive = false;
    this.powerTimeRemaining = 0;
    this.ghostEatCombo = 0;
    this.fruitInfo = null;
    this.fruitTimer = 0;
    this.pelletsEaten = 0;
    this.fruitSpawnIndex = 0;
    this.extraLifeAwarded = false;
    this.isDying = false;
    this.deathPauseTicks = 0;

    this.rng = new Xorshift128Plus(this.initialSeed);
    this.mutablePellets = this.clonePellets(this.baseMaze.pellets);
    this.remainingPowerPellets = [...this.baseMaze.powerPellets];
    this.totalPelletsInRound = this.countPellets();
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
  }

  // ===== 엔티티 생성 =====

  /**
   * 팩맨 초기 상태 생성
   * @returns 팩맨 내부 상태
   */
  private createPacman(): PacmanInternal {
    return {
      tileX: PACMAN_SPAWN.x,
      tileY: PACMAN_SPAWN.y,
      progress: 0,
      direction: 'left',
      nextDirection: 'left',
      speed: BASE_PACMAN_SPEED,
    };
  }

  /**
   * 모든 고스트의 초기 상태 생성
   * @returns 고스트 내부 상태 배열
   */
  private createGhosts(): GhostInternal[] {
    return GHOST_IDS.map((id): GhostInternal => {
      const spawn = GHOST_SPAWNS[id];
      return {
        id,
        tileX: spawn.x,
        tileY: spawn.y,
        progress: 0,
        direction: 'up',
        nextDirection: 'up',
        speed: BASE_PACMAN_SPEED * 0.9 * this.tierConfig.speedMultiplier,
        mode: 'chase',
      };
    });
  }

  // ===== 입력 처리 =====

  /**
   * 팩맨 방향 입력 처리
   *
   * 반대 방향 입력 시 즉시 반전하고,
   * 그 외에는 다음 타일 도달 시 적용할 방향으로 대기.
   *
   * @param dir - 입력된 이동 방향
   */
  private handleInput(dir: Direction): void {
    if (dir === OPPOSITE[this.pacman.direction]) {
      // 반대 방향: 즉시 반전, 진행도 반전
      this.pacman.direction = dir;
      this.pacman.nextDirection = dir;
      this.pacman.progress = Math.max(0, 1.0 - this.pacman.progress);
    } else {
      // 그 외: 다음 타일 경계에서 적용
      this.pacman.nextDirection = dir;
    }
  }

  // ===== 팩맨 이동 =====

  /**
   * 팩맨 이동 처리
   *
   * 그리드 기반 이동으로, progress가 1.0에 도달하면
   * 다음 타일로 진입하고 대기 방향을 적용.
   */
  private movePacman(): void {
    const moveAmount = this.pacman.speed / TICK_RATE;

    // 현재 방향으로 이동 가능한지 먼저 확인
    if (
      !LocalMaze.canMove(this.maze, this.pacman.tileX, this.pacman.tileY, this.pacman.direction)
    ) {
      // 벽에 막혔으면 대기 방향 시도
      if (
        LocalMaze.canMove(
          this.maze,
          this.pacman.tileX,
          this.pacman.tileY,
          this.pacman.nextDirection,
        )
      ) {
        this.pacman.direction = this.pacman.nextDirection;
        this.pacman.progress = 0;
      } else {
        // 아무 방향도 이동 불가 — 대기
        return;
      }
    }

    this.pacman.progress += moveAmount;

    if (this.pacman.progress >= 1.0) {
      // 다음 타일로 진입
      const vec = DIRECTION_VECTORS[this.pacman.direction];
      this.pacman.tileX += vec.x;
      this.pacman.tileY += vec.y;

      // 터널 래핑 처리
      this.pacman.tileX = this.wrapTunnelX(this.pacman.tileX, this.pacman.tileY);

      // 잔여 진행도
      this.pacman.progress -= 1.0;

      // 대기 방향 적용 시도
      if (
        LocalMaze.canMove(
          this.maze,
          this.pacman.tileX,
          this.pacman.tileY,
          this.pacman.nextDirection,
        )
      ) {
        this.pacman.direction = this.pacman.nextDirection;
      }

      // 새 방향으로 이동 불가 시 정지
      if (
        !LocalMaze.canMove(this.maze, this.pacman.tileX, this.pacman.tileY, this.pacman.direction)
      ) {
        this.pacman.progress = 0;
      }
    }
  }

  // ===== 펠릿 수집 =====

  /**
   * 팩맨이 위치한 타일의 펠릿 수집 확인
   *
   * 일반 펠릿과 파워 펠릿을 각각 처리하고
   * 점수를 가산함.
   */
  private checkPelletCollection(): void {
    const px = this.pacman.tileX;
    const py = this.pacman.tileY;

    // 범위 검사
    if (px < 0 || px >= MAZE_WIDTH || py < 0 || py >= MAZE_HEIGHT) {
      return;
    }

    const pelletRow = this.mutablePellets[py];
    if (pelletRow === undefined) {
      return;
    }

    const hasPellet = pelletRow[px];
    if (hasPellet !== true) {
      return;
    }

    // 펠릿 제거
    pelletRow[px] = false;
    this.pelletsEaten++;

    // 파워 펠릿인지 확인
    const powerIdx = this.remainingPowerPellets.findIndex((p) => p.x === px && p.y === py);

    if (powerIdx >= 0) {
      // 파워 펠릿 수집
      this.score += POWER_PELLET_POINTS;
      this.remainingPowerPellets.splice(powerIdx, 1);
      this.activatePowerMode();
    } else {
      // 일반 펠릿 수집
      this.score += REGULAR_PELLET_POINTS;
    }
  }

  // ===== 파워 모드 =====

  /**
   * 파워 모드 활성화
   *
   * 모든 추적/산개 중인 고스트를 공포 모드로 전환하고
   * 연속 처치 콤보를 초기화함.
   */
  private activatePowerMode(): void {
    this.powerActive = true;
    this.powerTimeRemaining = this.powerDurationTicks;
    this.ghostEatCombo = 0;

    for (const ghost of this.ghosts) {
      if (ghost.mode === 'chase' || ghost.mode === 'scatter') {
        ghost.mode = 'frightened';
        // 공포 상태에서는 속도 감소
        ghost.speed = BASE_PACMAN_SPEED * 0.9 * this.tierConfig.speedMultiplier * 0.5;
      }
    }
  }

  /**
   * 파워 모드 타이머 갱신
   *
   * 시간이 만료되면 공포 상태의 고스트를 추적 모드로 복원.
   */
  private updatePowerTimer(): void {
    if (!this.powerActive) {
      return;
    }

    this.powerTimeRemaining--;

    if (this.powerTimeRemaining <= 0) {
      this.powerActive = false;
      this.powerTimeRemaining = 0;
      this.ghostEatCombo = 0;

      // 공포 상태 고스트를 추적 모드로 복원
      for (const ghost of this.ghosts) {
        if (ghost.mode === 'frightened') {
          ghost.mode = 'chase';
          ghost.speed = BASE_PACMAN_SPEED * 0.9 * this.tierConfig.speedMultiplier;
        }
      }
    }
  }

  // ===== 고스트 이동 =====

  /**
   * 모든 고스트 이동 처리
   *
   * 각 고스트의 모드에 따라 이동 로직을 분기:
   * - chase/scatter/frightened: 무작위 순찰 (역방향 금지)
   * - eaten: 스폰 지점으로 고속 복귀
   */
  private moveGhosts(): void {
    for (const ghost of this.ghosts) {
      this.moveSingleGhost(ghost);
    }
  }

  /**
   * 개별 고스트 이동 처리
   * @param ghost - 이동할 고스트
   */
  private moveSingleGhost(ghost: GhostInternal): void {
    let effectiveSpeed = ghost.speed;

    // 먹힌 고스트는 2배 속도로 복귀
    if (ghost.mode === 'eaten') {
      effectiveSpeed = BASE_PACMAN_SPEED * 2;
    }

    const moveAmount = effectiveSpeed / TICK_RATE;
    ghost.progress += moveAmount;

    if (ghost.progress >= 1.0) {
      // 다음 타일로 진입
      const vec = DIRECTION_VECTORS[ghost.direction];
      ghost.tileX += vec.x;
      ghost.tileY += vec.y;

      // 터널 래핑
      ghost.tileX = this.wrapTunnelX(ghost.tileX, ghost.tileY);

      ghost.progress -= 1.0;

      // 먹힌 고스트의 스폰 복귀 확인
      if (ghost.mode === 'eaten') {
        const spawn = GHOST_SPAWNS[ghost.id];
        if (ghost.tileX === spawn.x && ghost.tileY === spawn.y) {
          ghost.mode = 'chase';
          ghost.speed = BASE_PACMAN_SPEED * 0.9 * this.tierConfig.speedMultiplier;
        }
      }

      // 새 이동 방향 결정
      ghost.direction = this.chooseGhostDirection(ghost);
    }
  }

  /**
   * 고스트의 다음 이동 방향 결정
   *
   * 현재 타일에서 이동 가능한 방향 중 하나를 무작위로 선택.
   * 역방향은 막다른 길이 아닌 한 선택하지 않음.
   *
   * 먹힌 고스트는 스폰 지점을 향해 이동.
   *
   * @param ghost - 방향을 결정할 고스트
   * @returns 선택된 이동 방향
   */
  private chooseGhostDirection(ghost: GhostInternal): Direction {
    const oppositeDir = OPPOSITE[ghost.direction];

    // 먹힌 고스트: 스폰 지점으로 향하는 방향 우선
    if (ghost.mode === 'eaten') {
      const spawn = GHOST_SPAWNS[ghost.id];
      return this.moveTowardTarget(ghost, spawn, oppositeDir);
    }

    // 이동 가능한 방향 수집 (역방향 제외)
    const validDirs: Direction[] = [];
    for (const dir of ALL_DIRECTIONS) {
      if (dir === oppositeDir) {
        continue;
      }
      if (LocalMaze.canMove(this.maze, ghost.tileX, ghost.tileY, dir)) {
        validDirs.push(dir);
      }
    }

    // 이동 가능한 방향이 없으면 역방향 허용 (막다른 길)
    if (validDirs.length === 0) {
      if (LocalMaze.canMove(this.maze, ghost.tileX, ghost.tileY, oppositeDir)) {
        return oppositeDir;
      }
      // 완전히 갇힌 경우 현재 방향 유지
      return ghost.direction;
    }

    // 무작위 방향 선택
    const idx = this.rng.nextInt(0, validDirs.length - 1);
    return validDirs[idx] ?? ghost.direction;
  }

  /**
   * 목표 지점을 향해 이동할 방향 결정 (먹힌 고스트용)
   *
   * 이동 가능한 방향 중 목표까지의 맨해튼 거리가
   * 가장 짧은 방향을 선택.
   *
   * @param ghost - 이동할 고스트
   * @param target - 목표 위치
   * @param oppositeDir - 역방향 (가능하면 회피)
   * @returns 최적 이동 방향
   */
  private moveTowardTarget(
    ghost: GhostInternal,
    target: Position,
    oppositeDir: Direction,
  ): Direction {
    let bestDir: Direction = ghost.direction;
    let bestDist = Infinity;

    // 역방향 제외하고 이동 가능한 방향 탐색
    const candidates: Direction[] = [];
    for (const dir of ALL_DIRECTIONS) {
      if (dir === oppositeDir) {
        continue;
      }
      if (LocalMaze.canMove(this.maze, ghost.tileX, ghost.tileY, dir)) {
        candidates.push(dir);
      }
    }

    // 후보가 없으면 역방향 허용
    if (candidates.length === 0) {
      if (LocalMaze.canMove(this.maze, ghost.tileX, ghost.tileY, oppositeDir)) {
        return oppositeDir;
      }
      return ghost.direction;
    }

    for (const dir of candidates) {
      const vec = DIRECTION_VECTORS[dir];
      const nx = ghost.tileX + vec.x;
      const ny = ghost.tileY + vec.y;
      const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  // ===== 충돌 감지 =====

  /**
   * 팩맨과 고스트의 충돌 확인
   *
   * 같은 타일에 위치하면 충돌로 판정:
   * - 공포 상태 고스트: 먹힘 처리 (점수 가산)
   * - 추적/산개 상태 고스트: 생명 감소
   */
  private checkCollisions(): void {
    for (const ghost of this.ghosts) {
      if (ghost.tileX !== this.pacman.tileX || ghost.tileY !== this.pacman.tileY) {
        continue;
      }

      if (ghost.mode === 'frightened') {
        // 공포 상태 고스트 먹기
        ghost.mode = 'eaten';
        ghost.speed = BASE_PACMAN_SPEED * 2;

        // 콤보에 따른 점수 가산
        const comboScore = GHOST_EAT_SCORES[this.ghostEatCombo];
        if (comboScore !== undefined) {
          this.score += comboScore;
        }
        this.ghostEatCombo = Math.min(this.ghostEatCombo + 1, GHOST_EAT_SCORES.length - 1);
      } else if (ghost.mode === 'chase' || ghost.mode === 'scatter') {
        // 고스트에게 잡힘
        this.loseLife();
        // 생명 감소 후 위치 리셋이 일어나므로 나머지 충돌 검사 불필요
        return;
      }
      // eaten 모드 고스트와는 충돌 없음
    }
  }

  /**
   * 생명 감소 처리
   *
   * 모든 엔티티를 초기 위치로 리셋.
   * 생명이 0이 되면 게임 오버.
   */
  private loseLife(): void {
    this.lives--;

    if (this.lives <= 0) {
      this.gameOverFlag = true;
      this.isDying = true;
      return;
    }

    // 사망 일시정지 시작 — 위치는 일시정지 종료 후 리셋
    this.isDying = true;
    this.deathPauseTicks = 90; // 1.5초 (60fps 기준)
  }

  /**
   * 엔티티 위치만 초기화 (미로 펠릿 상태 유지)
   *
   * 생명 감소 시 팩맨과 고스트를 스폰 지점으로 복귀.
   */
  private resetPositions(): void {
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
    this.powerActive = false;
    this.powerTimeRemaining = 0;
    this.ghostEatCombo = 0;
  }

  // ===== 과일 관리 =====

  /**
   * 과일 스폰 및 타이머 관리
   *
   * FRUIT_SPAWN_THRESHOLDS에 따라 펠릿을 일정량 먹으면
   * 과일이 스폰됨. 일정 시간이 지나면 자동으로 사라짐.
   */
  private updateFruit(): void {
    // 과일 스폰 조건 확인
    if (this.fruitInfo === null && this.fruitSpawnIndex < FRUIT_SPAWN_THRESHOLDS.length) {
      const threshold = FRUIT_SPAWN_THRESHOLDS[this.fruitSpawnIndex];
      if (threshold !== undefined && this.pelletsEaten >= threshold) {
        // 과일 스폰
        const points = this.rng.nextInt(FRUIT_POINTS_MIN, FRUIT_POINTS_MAX);
        // 50 단위로 반올림
        const roundedPoints = Math.round(points / 50) * 50;
        this.fruitInfo = {
          x: FRUIT_SPAWN_POSITION.x,
          y: FRUIT_SPAWN_POSITION.y,
          points: roundedPoints > 0 ? roundedPoints : FRUIT_POINTS_MIN,
        };
        this.fruitTimer = FRUIT_DISPLAY_TICKS;
        this.fruitSpawnIndex++;
      }
    }

    // 과일 타이머 관리
    if (this.fruitInfo !== null) {
      // 팩맨이 과일 위치에 있는지 확인
      if (this.pacman.tileX === this.fruitInfo.x && this.pacman.tileY === this.fruitInfo.y) {
        this.score += this.fruitInfo.points;
        this.fruitInfo = null;
        this.fruitTimer = 0;
        return;
      }

      this.fruitTimer--;
      if (this.fruitTimer <= 0) {
        // 시간 초과 — 과일 사라짐
        this.fruitInfo = null;
      }
    }
  }

  // ===== 라운드 관리 =====

  /**
   * 라운드 클리어 확인
   *
   * 모든 펠릿을 수집하면 다음 라운드로 진행.
   * 미로를 리셋하고 엔티티를 초기 위치로 복귀.
   */
  private checkRoundClear(): void {
    if (this.pelletsEaten < this.totalPelletsInRound) {
      return;
    }

    // 라운드 클리어
    this.round++;
    this.pelletsEaten = 0;
    this.fruitSpawnIndex = 0;
    this.fruitInfo = null;
    this.fruitTimer = 0;

    // 미로 리셋
    this.mutablePellets = this.clonePellets(this.baseMaze.pellets);
    this.remainingPowerPellets = [...this.baseMaze.powerPellets];
    this.totalPelletsInRound = this.countPellets();

    // 엔티티 위치 리셋
    this.resetPositions();
  }

  /**
   * 추가 생명 확인
   *
   * 점수가 EXTRA_LIFE_SCORE에 도달하면 생명 1 추가 (1회만).
   */
  private checkExtraLife(): void {
    if (!this.extraLifeAwarded && this.score >= EXTRA_LIFE_SCORE) {
      this.lives++;
      this.extraLifeAwarded = true;
    }
  }

  // ===== 유틸리티 =====

  /**
   * 터널 X 좌표 래핑
   *
   * 터널 행(y=14)에서 좌우 끝을 넘으면
   * 반대편으로 이동.
   *
   * @param x - 현재 X 좌표
   * @param y - 현재 Y 좌표
   * @returns 래핑된 X 좌표
   */
  private wrapTunnelX(x: number, y: number): number {
    if (y !== TUNNEL_Y) {
      return x;
    }
    if (x < 0) {
      return MAZE_WIDTH - 1;
    }
    if (x >= MAZE_WIDTH) {
      return 0;
    }
    return x;
  }

  /**
   * 펠릿 배열 깊은 복사
   *
   * 불변 원본 데이터에서 변경 가능한 복사본 생성.
   *
   * @param pellets - 원본 펠릿 2D 배열
   * @returns 복사된 변경 가능 펠릿 배열
   */
  private clonePellets(pellets: readonly (readonly boolean[])[]): boolean[][] {
    return pellets.map((row) => [...row]);
  }

  /**
   * 현재 미로의 펠릿 총 개수 계산
   * @returns 펠릿 총 개수
   */
  private countPellets(): number {
    let count = 0;
    for (const row of this.mutablePellets) {
      for (const cell of row) {
        if (cell) {
          count++;
        }
      }
    }
    return count;
  }
}
