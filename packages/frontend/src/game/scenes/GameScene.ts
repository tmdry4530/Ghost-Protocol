/**
 * Ghost Protocol 팩맨 게임 씬
 * Phaser 3 Graphics API를 사용한 프로시저럴 네온-레트로 렌더링
 * 스프라이트 시트 없이 모든 그래픽을 코드로 직접 그림
 */
import Phaser from 'phaser';
import type { GameState, GhostId, GhostMode, Direction, Position } from '@ghost-protocol/shared';

/** 각 타일의 픽셀 크기 */
const TILE_SIZE = 24;

/** 네온 색상 팔레트 */
const COLORS = {
  /** 배경 (어두운 남색) */
  background: 0x0a0a1a,
  /** 보라색 네온 벽 */
  wallStroke: 0x6366f1,
  /** 벽 글로우 효과 */
  wallGlow: 0x818cf8,
  /** 노란색 일반 펠릿 */
  pellet: 0xfacc15,
  /** 밝은 노란색 파워 펠릿 */
  powerPellet: 0xfbbf24,
  /** 팩맨 노란색 */
  pacman: 0xfde047,
  /** 빨간 고스트 (블링키) */
  blinky: 0xef4444,
  /** 핑크 고스트 (핑키) */
  pinky: 0xf472b6,
  /** 시안 고스트 (잉키) */
  inky: 0x22d3ee,
  /** 주황 고스트 (클라이드) */
  clyde: 0xfb923c,
  /** 겁먹은 상태 파란색 */
  frightened: 0x3b82f6,
  /** 먹힌 상태 흰색 (눈만 표시) */
  eaten: 0xffffff,
  /** 과일 빨간색 */
  fruit: 0xf43f5e,
} as const;

/** 고스트 ID별 색상 매핑 */
const GHOST_COLORS: Record<GhostId, number> = {
  blinky: COLORS.blinky,
  pinky: COLORS.pinky,
  inky: COLORS.inky,
  clyde: COLORS.clyde,
};

/** 팩맨 입 애니메이션 최대 각도 (라디안) */
const MOUTH_MAX_ANGLE = Math.PI / 6;

/** 팩맨 입 애니메이션 속도 (프레임당 라디안) */
const MOUTH_SPEED = 0.08;

/** 팩맨 반지름 비율 (TILE_SIZE 대비) */
const PACMAN_RADIUS_RATIO = 0.4;

/** 겁먹은 상태 깜빡임 시작 시점 (남은 틱) */
const FRIGHTENED_FLASH_THRESHOLD = 120;

/**
 * 게임 씬 - 팩맨 게임의 모든 비주얼 렌더링 담당
 *
 * 외부에서 updateGameState()로 상태를 주입하고,
 * getCurrentInput()으로 플레이어 입력을 읽어감.
 * 모든 렌더링은 Phaser.GameObjects.Graphics로 프로시저럴하게 수행.
 */
export class GameScene extends Phaser.Scene {
  /** 미로 벽 렌더링용 그래픽 객체 */
  private mazeGraphics!: Phaser.GameObjects.Graphics;

  /** 펠릿 렌더링용 그래픽 객체 */
  private pelletGraphics!: Phaser.GameObjects.Graphics;

  /** 팩맨 렌더링용 그래픽 객체 */
  private pacmanGraphics!: Phaser.GameObjects.Graphics;

  /** 고스트 렌더링용 그래픽 객체 */
  private ghostGraphics!: Phaser.GameObjects.Graphics;

  /** 과일 렌더링용 그래픽 객체 */
  private fruitGraphics!: Phaser.GameObjects.Graphics;

  /** 현재 게임 상태 (외부에서 주입) */
  private currentState: GameState | null = null;

  /** 팩맨 입 벌림 각도 (0 ~ MOUTH_MAX_ANGLE) */
  private mouthAngle: number = 0;

  /** 입이 열리고 있는 중인지 여부 */
  private mouthOpening: boolean = true;

  /** 파워 펠릿/겁먹은 상태 깜빡임 타이머 */
  private powerFlashTimer: number = 0;

  /** 현재 키보드 입력 방향 */
  private currentInput: Direction | null = null;

  /** 고스트 이전 위치 (이동 방향 추정용) */
  private prevGhostPositions: Map<GhostId, Position> = new Map();

  /** 씬이 create() 완료되었는지 여부 (외부에서 상태 주입 가능 시점 판단용) */
  private sceneReady = false;

  /** 방향키 입력 객체 */
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  /** WASD 키 입력 객체 */
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super({ key: 'GameScene' });
  }

  /** 씬 초기화 - 그래픽 객체와 키보드 입력 설정 */
  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    // 그래픽 객체 생성 (렌더링 순서: 미로 → 펠릿 → 과일 → 고스트 → 팩맨)
    this.mazeGraphics = this.add.graphics();
    this.pelletGraphics = this.add.graphics();
    this.fruitGraphics = this.add.graphics();
    this.ghostGraphics = this.add.graphics();
    this.pacmanGraphics = this.add.graphics();

    // 키보드 입력 바인딩
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = {
        W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    // 씬 초기화 완료 — 외부에서 상태 주입 가능
    this.sceneReady = true;
  }

  /** 씬이 create() 완료되어 상태를 받을 준비가 되었는지 확인 */
  getIsReady(): boolean {
    return this.sceneReady;
  }

  /** 매 프레임 업데이트 - 입력 읽기, 애니메이션 갱신, 렌더링 */
  update(_time: number, _delta: number): void {
    this.readInput();

    // 상태가 없으면 렌더링 생략
    if (!this.currentState) return;

    this.updateMouthAnimation();
    this.powerFlashTimer += 1;
    this.updateBackgroundColor();

    // 매 프레임 동적 요소 다시 그리기
    this.renderPellets();
    this.renderFruit();
    this.renderGhosts();
    this.renderPacman();
  }

  /**
   * 외부에서 게임 상태를 주입하는 메서드
   * GameContainer 또는 게임 루프에서 매 틱마다 호출
   */
  updateGameState(state: GameState): void {
    const mazeChanged = !this.currentState || this.currentState.round !== state.round;

    // 고스트 이전 위치 저장 (이동 방향 추정용)
    if (this.currentState) {
      for (const ghost of this.currentState.ghosts) {
        this.prevGhostPositions.set(ghost.id, { x: ghost.x, y: ghost.y });
      }
    }

    this.currentState = state;

    // 미로 벽은 라운드가 바뀔 때만 다시 그림 (성능 최적화)
    if (mazeChanged) {
      this.renderMaze();
    }
  }

  /** 현재 키보드 입력 방향 반환 (입력 없으면 null) */
  getCurrentInput(): Direction | null {
    return this.currentInput;
  }

  // ===== 렌더링 메서드 =====

  /**
   * 미로 벽 렌더링
   * 벽 타일의 비-벽 인접 면에만 네온 라인을 그려 클래식 팩맨 미로 표현
   * 글로우 효과는 같은 라인을 반투명 두꺼운 선으로 뒤에 한번 더 그림
   */
  private renderMaze(): void {
    this.mazeGraphics.clear();

    const currentState = this.currentState;
    if (!currentState) return;

    const { walls } = currentState.maze;

    for (let y = 0; y < walls.length; y++) {
      const wallRow = walls[y];
      if (!wallRow) continue;
      for (let x = 0; x < wallRow.length; x++) {
        if (!wallRow[x]) continue;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // 벽 배경 채우기 (약간 밝은 어두운색)
        this.mazeGraphics.fillStyle(0x111133, 0.5);
        this.mazeGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // 비-벽 타일과 인접한 면에만 네온 라인 그리기
        const adjacentDirs = [
          { dx: 0, dy: -1, x1: px, y1: py, x2: px + TILE_SIZE, y2: py }, // 위
          { dx: 0, dy: 1, x1: px, y1: py + TILE_SIZE, x2: px + TILE_SIZE, y2: py + TILE_SIZE }, // 아래
          { dx: -1, dy: 0, x1: px, y1: py, x2: px, y2: py + TILE_SIZE }, // 왼쪽
          { dx: 1, dy: 0, x1: px + TILE_SIZE, y1: py, x2: px + TILE_SIZE, y2: py + TILE_SIZE }, // 오른쪽
        ];

        for (const dir of adjacentDirs) {
          const nx = x + dir.dx;
          const ny = y + dir.dy;

          // 미로 범위 밖이거나 인접 타일이 벽이 아닌 경우에만 라인 그리기
          const neighborRow = ny >= 0 && ny < walls.length ? walls[ny] : undefined;
          const isNeighborWall =
            neighborRow !== undefined && nx >= 0 && nx < neighborRow.length && neighborRow[nx];

          if (!isNeighborWall) {
            // 글로우 효과 (뒤쪽, 두꺼운 반투명 라인)
            this.mazeGraphics.lineStyle(4, COLORS.wallGlow, 0.3);
            this.mazeGraphics.beginPath();
            this.mazeGraphics.moveTo(dir.x1, dir.y1);
            this.mazeGraphics.lineTo(dir.x2, dir.y2);
            this.mazeGraphics.strokePath();

            // 메인 네온 라인
            this.mazeGraphics.lineStyle(2, COLORS.wallStroke, 1);
            this.mazeGraphics.beginPath();
            this.mazeGraphics.moveTo(dir.x1, dir.y1);
            this.mazeGraphics.lineTo(dir.x2, dir.y2);
            this.mazeGraphics.strokePath();
          }
        }
      }
    }
  }

  /**
   * 펠릿(점) 렌더링
   * 일반 펠릿: 작은 노란 원
   * 파워 펠릿: 큰 노란 원 + 사인파 기반 펄싱 알파
   */
  private renderPellets(): void {
    this.pelletGraphics.clear();

    const currentState = this.currentState;
    if (!currentState) return;

    const { pellets, powerPellets } = currentState.maze;

    // 파워 펠릿 위치를 Set으로 변환 (빠른 조회용)
    const powerPelletSet = new Set<string>();
    for (const pp of powerPellets) {
      powerPelletSet.add(`${String(pp.x)},${String(pp.y)}`);
    }

    // 일반 펠릿 렌더링
    this.pelletGraphics.fillStyle(COLORS.pellet, 1);
    for (let y = 0; y < pellets.length; y++) {
      const pelletRow = pellets[y];
      if (!pelletRow) continue;
      for (let x = 0; x < pelletRow.length; x++) {
        if (!pelletRow[x]) continue;

        const centerX = x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = y * TILE_SIZE + TILE_SIZE / 2;

        if (powerPelletSet.has(`${String(x)},${String(y)}`)) {
          // 파워 펠릿: 펄싱 알파 효과
          const alpha = 0.5 + 0.5 * Math.sin(this.powerFlashTimer * 0.1);
          this.pelletGraphics.fillStyle(COLORS.powerPellet, alpha);
          this.pelletGraphics.fillCircle(centerX, centerY, 5);
          // 다음 일반 펠릿을 위해 스타일 복원
          this.pelletGraphics.fillStyle(COLORS.pellet, 1);
        } else {
          // 일반 펠릿
          this.pelletGraphics.fillCircle(centerX, centerY, 2);
        }
      }
    }
  }

  /**
   * 팩맨 렌더링
   * 방향에 따라 회전하는 파이 슬라이스(입 벌린 원)로 표현
   */
  private renderPacman(): void {
    this.pacmanGraphics.clear();

    const currentState = this.currentState;
    if (!currentState) return;

    const { pacman } = currentState;
    const centerX = pacman.x * TILE_SIZE + TILE_SIZE / 2;
    const centerY = pacman.y * TILE_SIZE + TILE_SIZE / 2;
    const radius = TILE_SIZE * PACMAN_RADIUS_RATIO;

    // 방향별 기준 각도 계산
    const baseAngle = this.getDirectionAngle(pacman.direction);
    const startAngle = baseAngle + this.mouthAngle;
    const endAngle = baseAngle + (Math.PI * 2 - this.mouthAngle);

    this.pacmanGraphics.fillStyle(COLORS.pacman, 1);
    this.pacmanGraphics.slice(centerX, centerY, radius, startAngle, endAngle, false);
    this.pacmanGraphics.fillPath();
  }

  /**
   * 고스트 렌더링
   * 모드별 색상 분기:
   * - chase/scatter: 고유 색상
   * - frightened: 파란색 (파워 잔여시간 적으면 흰색 깜빡임)
   * - eaten: 눈만 표시
   *
   * 몸체: 둥근 상단 + 사각 중간 + 물결 하단
   * 눈: 방향에 따라 동공 위치 변경
   */
  private renderGhosts(): void {
    this.ghostGraphics.clear();

    const currentState = this.currentState;
    if (!currentState) return;

    const { ghosts, powerTimeRemaining } = currentState;

    for (const ghost of ghosts) {
      const centerX = ghost.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = ghost.y * TILE_SIZE + TILE_SIZE / 2;

      // 먹힌 상태: 눈만 그리기
      if (ghost.mode === 'eaten') {
        this.drawGhostEyes(centerX, centerY, ghost.id);
        continue;
      }

      // 고스트 색상 결정
      const color = this.getGhostColor(ghost.id, ghost.mode, powerTimeRemaining);

      this.drawGhostBody(centerX, centerY, color);
      this.drawGhostEyes(centerX, centerY, ghost.id);
    }
  }

  /**
   * 과일 렌더링
   * 간단한 체리 아이콘 (원 + 줄기)
   */
  private renderFruit(): void {
    this.fruitGraphics.clear();

    const currentState = this.currentState;
    if (!currentState) return;

    const fruit = currentState.fruitAvailable;
    if (!fruit) return;

    const centerX = fruit.x * TILE_SIZE + TILE_SIZE / 2;
    const centerY = fruit.y * TILE_SIZE + TILE_SIZE / 2;

    // 체리 열매 (빨간 원 2개)
    this.fruitGraphics.fillStyle(COLORS.fruit, 1);
    this.fruitGraphics.fillCircle(centerX - 3, centerY + 2, 4);
    this.fruitGraphics.fillCircle(centerX + 3, centerY + 2, 4);

    // 줄기 (초록색 선)
    this.fruitGraphics.lineStyle(1.5, 0x22c55e, 1);
    this.fruitGraphics.beginPath();
    this.fruitGraphics.moveTo(centerX - 2, centerY - 1);
    this.fruitGraphics.lineTo(centerX, centerY - 6);
    this.fruitGraphics.lineTo(centerX + 2, centerY - 1);
    this.fruitGraphics.strokePath();
  }

  // ===== 고스트 그리기 헬퍼 =====

  /**
   * 고스트 몸체 그리기
   * 둥근 상단(반원) + 직사각 몸통 + 물결 하단(3개 반원)
   */
  private drawGhostBody(cx: number, cy: number, color: number): void {
    const halfSize = TILE_SIZE * 0.4;
    const top = cy - halfSize;
    const bottom = cy + halfSize;
    const left = cx - halfSize;
    const right = cx + halfSize;
    const bodyWidth = right - left;

    this.ghostGraphics.fillStyle(color, 1);

    // 상단 반원
    this.ghostGraphics.beginPath();
    this.ghostGraphics.arc(cx, top + halfSize * 0.4, halfSize, Math.PI, 0, false);

    // 양쪽 직선으로 몸통 연결
    this.ghostGraphics.lineTo(right, bottom - 3);

    // 하단 물결 (3개 작은 반원)
    const waveCount = 3;
    const waveWidth = bodyWidth / waveCount;
    for (let i = 0; i < waveCount; i++) {
      const waveX = right - i * waveWidth;
      const waveEndX = waveX - waveWidth;
      const waveCenterX = (waveX + waveEndX) / 2;
      this.ghostGraphics.arc(waveCenterX, bottom - 3, waveWidth / 2, 0, Math.PI, false);
    }

    this.ghostGraphics.lineTo(left, top + halfSize * 0.4);
    this.ghostGraphics.closePath();
    this.ghostGraphics.fillPath();
  }

  /**
   * 고스트 눈 그리기
   * 흰색 안구 + 어두운 동공
   * 이전 프레임 위치와 비교하여 이동 방향으로 동공 오프셋
   */
  private drawGhostEyes(cx: number, cy: number, ghostId: GhostId): void {
    const eyeOffsetX = 3;
    const eyeY = cy - 2;
    const eyeRadius = 3;
    const pupilRadius = 1.5;

    // 이전 위치와 현재 위치 비교로 이동 방향 추정
    const ghost = this.currentState?.ghosts.find((g) => g.id === ghostId);
    const prev = this.prevGhostPositions.get(ghostId);
    const dir = this.deriveGhostDirection(ghost, prev);

    // 흰색 안구
    this.ghostGraphics.fillStyle(0xffffff, 1);
    this.ghostGraphics.fillCircle(cx - eyeOffsetX, eyeY, eyeRadius);
    this.ghostGraphics.fillCircle(cx + eyeOffsetX, eyeY, eyeRadius);

    // 동공 (이동 방향에 따라 오프셋)
    const pupilOffsetX = dir.dx * 1.5;
    const pupilOffsetY = dir.dy * 1.5;
    this.ghostGraphics.fillStyle(0x1e1b4b, 1);
    this.ghostGraphics.fillCircle(cx - eyeOffsetX + pupilOffsetX, eyeY + pupilOffsetY, pupilRadius);
    this.ghostGraphics.fillCircle(cx + eyeOffsetX + pupilOffsetX, eyeY + pupilOffsetY, pupilRadius);
  }

  /**
   * 이전/현재 위치 비교로 고스트 이동 방향 벡터 추정
   * 위치 변화가 없으면 왼쪽 기본값 (클래식 팩맨 스타일)
   */
  private deriveGhostDirection(
    ghost: { readonly x: number; readonly y: number } | undefined,
    prev: Position | undefined,
  ): { dx: number; dy: number } {
    if (!ghost || !prev) return { dx: -1, dy: 0 }; // 기본: 왼쪽

    const deltaX = ghost.x - prev.x;
    const deltaY = ghost.y - prev.y;

    // 이동이 없으면 마지막 방향 유지 (기본 왼쪽)
    if (deltaX === 0 && deltaY === 0) return { dx: -1, dy: 0 };

    // 수평/수직 중 큰 쪽 우선 (정규화)
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      return { dx: deltaX > 0 ? 1 : -1, dy: 0 };
    }
    return { dx: 0, dy: deltaY > 0 ? 1 : -1 };
  }

  /**
   * 고스트 모드에 따른 색상 결정
   * frightened 모드에서 파워 잔여시간이 적으면 흰색/파란색 교대 깜빡임
   */
  private getGhostColor(ghostId: GhostId, mode: GhostMode, powerTimeRemaining: number): number {
    if (mode === 'frightened') {
      // 파워 잔여시간 적으면 깜빡임 (흰색 ↔ 파란색)
      if (powerTimeRemaining < FRIGHTENED_FLASH_THRESHOLD) {
        const flashOn = Math.floor(this.powerFlashTimer / 8) % 2 === 0;
        return flashOn ? COLORS.frightened : COLORS.eaten;
      }
      return COLORS.frightened;
    }

    // chase 또는 scatter 모드: 고유 색상
    return GHOST_COLORS[ghostId];
  }

  // ===== 애니메이션 =====

  /** 팩맨 입 벌림 애니메이션 업데이트 (0 ~ PI/6 사이 왕복) */
  private updateMouthAnimation(): void {
    if (this.mouthOpening) {
      this.mouthAngle += MOUTH_SPEED;
      if (this.mouthAngle >= MOUTH_MAX_ANGLE) {
        this.mouthAngle = MOUTH_MAX_ANGLE;
        this.mouthOpening = false;
      }
    } else {
      this.mouthAngle -= MOUTH_SPEED;
      if (this.mouthAngle <= 0) {
        this.mouthAngle = 0;
        this.mouthOpening = true;
      }
    }
  }

  /**
   * 난이도에 따른 배경색 점진적 변경
   * 티어 1: 쿨 블루 (0x0a0a2a) → 티어 5: 웜 레드 (0x1a0a0a)
   */
  private updateBackgroundColor(): void {
    const state = this.currentState;
    if (!state) return;

    // 라운드에서 난이도 티어 추정 (라운드 5 단위로 티어 증가, 최대 5)
    const tier = Math.min(5, Math.floor((state.round - 1) / 5) + 1);

    const r = Math.floor(0x0a + ((tier - 1) * (0x1a - 0x0a)) / 4);
    const g = 0x0a;
    const b = Math.floor(0x2a - ((tier - 1) * (0x2a - 0x0a)) / 4);

    this.cameras.main.setBackgroundColor((r << 16) | (g << 8) | b);
  }

  // ===== 입력 처리 =====

  /**
   * 키보드 입력 읽기
   * 방향키와 WASD 모두 지원, 마지막 누른 키 우선
   */
  private readInput(): void {
    if (this.cursors.up.isDown || this.wasd['W']?.isDown) {
      this.currentInput = 'up';
    } else if (this.cursors.down.isDown || this.wasd['S']?.isDown) {
      this.currentInput = 'down';
    } else if (this.cursors.left.isDown || this.wasd['A']?.isDown) {
      this.currentInput = 'left';
    } else if (this.cursors.right.isDown || this.wasd['D']?.isDown) {
      this.currentInput = 'right';
    }
    // 아무 키도 안 눌렸으면 마지막 입력 유지
  }

  // ===== 유틸리티 =====

  /**
   * 방향을 라디안 각도로 변환 (팩맨 회전용)
   * right=0, down=PI/2, left=PI, up=-PI/2
   */
  private getDirectionAngle(direction: Direction): number {
    switch (direction) {
      case 'right':
        return 0;
      case 'down':
        return Math.PI / 2;
      case 'left':
        return Math.PI;
      case 'up':
        return -Math.PI / 2;
    }
  }
}
