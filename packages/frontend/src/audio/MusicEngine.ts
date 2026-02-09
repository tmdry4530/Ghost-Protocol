import * as Tone from 'tone';

/** 난이도 티어 (1~5) */
type DifficultyTier = 1 | 2 | 3 | 4 | 5;

/** 게임 모드에 따른 음악 분위기 */
type MusicMode = 'normal' | 'frightened' | 'chase';

/** 티어별 BPM 매핑 */
const TIER_BPM: Readonly<Record<DifficultyTier, number>> = {
  1: 100,
  2: 110,
  3: 125,
  4: 140,
  5: 160,
};

/**
 * 장조 멜로디 시퀀스 (4마디, 16개 8분음표).
 * 팩맨 스타일의 칩튠 멜로디를 구성한다.
 */
const MELODY_NORMAL: ReadonlyArray<string | null> = [
  'C4', 'E4', 'G4', 'C5',
  'B4', 'G4', 'E4', null,
  'A4', 'C5', 'E5', 'C5',
  'G4', 'E4', 'C4', null,
];

/**
 * 단조 멜로디 시퀀스 (공포 모드).
 * E -> Eb으로 전환하여 단조 느낌을 준다.
 */
const MELODY_FRIGHTENED: ReadonlyArray<string | null> = [
  'C4', 'Eb4', 'G4', 'C5',
  'Bb4', 'G4', 'Eb4', null,
  'Ab4', 'C5', 'Eb5', 'C5',
  'G4', 'Eb4', 'C4', null,
];

/**
 * 베이스 라인 시퀀스 (4마디, 4분음표).
 * 삼각파로 재생된다.
 */
const BASS_LINE: ReadonlyArray<string | null> = [
  'C2', 'C2', 'E2', 'E2',
  'A2', 'A2', 'G2', 'G2',
];

/**
 * 아르페지오 패드 시퀀스 (티어 5 전용).
 * 부드러운 사인파로 화음을 채운다.
 */
const ARP_PAD: ReadonlyArray<string | null> = [
  'C3', 'E3', 'G3', 'E3',
  'C3', 'G3', 'E3', 'G3',
  'A2', 'C3', 'E3', 'C3',
  'G2', 'B2', 'D3', 'B2',
];

/**
 * 적응형 BGM 생성 엔진.
 *
 * 난이도 티어와 게임 모드에 따라 레이어(멜로디, 베이스, 퍼커션, 패드)를
 * 동적으로 추가/제거하고 템포를 조절한다.
 *
 * - 티어 1-2: 멜로디만
 * - 티어 3: 멜로디 + 베이스
 * - 티어 4: 멜로디 + 베이스 + 하이햇 퍼커션
 * - 티어 5: 멜로디 + 베이스 + 퍼커션 + 아르페지오 패드
 *
 * @example
 * ```ts
 * const engine = AudioEngine.getInstance();
 * const music = new MusicEngine(engine.getOutput());
 * music.start();
 * music.setTier(3); // 베이스 레이어 추가
 * music.setMode('frightened'); // 단조로 전환, 80BPM
 * ```
 */
export class MusicEngine {
  /** Tone.js 트랜스포트 인스턴스 */
  private readonly transport: ReturnType<typeof Tone.getTransport>;

  /** 멜로디 시퀀스 (사각파) */
  private melodySynth: Tone.Synth;
  private melodySequence: Tone.Sequence<string | null>;

  /** 베이스 시퀀스 (삼각파) */
  private bassSynth: Tone.Synth;
  private bassSequence: Tone.Sequence<string | null>;

  /** 퍼커션 루프 (NoiseSynth 하이햇) */
  private hihatSynth: Tone.NoiseSynth;
  private hihatLoop: Tone.Loop;

  /** 아르페지오 패드 시퀀스 (사인파) */
  private padSynth: Tone.Synth;
  private padSequence: Tone.Sequence<string | null>;

  /** 현재 난이도 티어 */
  private currentTier: DifficultyTier = 1;

  /** 현재 음악 모드 */
  private currentMode: MusicMode = 'normal';

  /** 재생 중 여부 */
  private playing = false;

  /**
   * MusicEngine 인스턴스를 생성한다.
   *
   * @param output - 모든 음악 레이어가 연결될 출력 노드 (보통 마스터 볼륨)
   */
  constructor(output: Tone.Volume) {
    this.transport = Tone.getTransport();

    // --- 멜로디 레이어: 사각파 칩튠 ---
    this.melodySynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 },
      volume: -12,
    }).connect(output);

    this.melodySequence = new Tone.Sequence(
      (time: number, note: string | null) => {
        if (note !== null) {
          try {
            this.melodySynth.triggerAttackRelease(note, '16n', time);
          } catch {
            // 재생 중 에러 무시 (게임 크래시 방지)
          }
        }
      },
      [...MELODY_NORMAL],
      '8n',
    );
    this.melodySequence.loop = true;

    // --- 베이스 레이어: 삼각파 ---
    this.bassSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.1 },
      volume: -14,
    }).connect(output);

    this.bassSequence = new Tone.Sequence(
      (time: number, note: string | null) => {
        if (note !== null) {
          try {
            this.bassSynth.triggerAttackRelease(note, '4n', time);
          } catch {
            // 재생 중 에러 무시
          }
        }
      },
      [...BASS_LINE],
      '4n',
    );
    this.bassSequence.loop = true;

    // --- 퍼커션 레이어: 하이햇 패턴 ---
    this.hihatSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
      volume: -20,
    }).connect(output);

    this.hihatLoop = new Tone.Loop((time: number) => {
      try {
        this.hihatSynth.triggerAttackRelease('16n', time);
      } catch {
        // 재생 중 에러 무시
      }
    }, '8n');

    // --- 아르페지오 패드 레이어: 사인파 ---
    this.padSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.2 },
      volume: -18,
    }).connect(output);

    this.padSequence = new Tone.Sequence(
      (time: number, note: string | null) => {
        if (note !== null) {
          try {
            this.padSynth.triggerAttackRelease(note, '8n', time);
          } catch {
            // 재생 중 에러 무시
          }
        }
      },
      [...ARP_PAD],
      '8n',
    );
    this.padSequence.loop = true;
  }

  /**
   * BGM 재생을 시작한다.
   *
   * 현재 설정된 티어와 모드에 맞게 레이어를 활성화하고
   * Tone.js 트랜스포트를 시작한다.
   */
  start(): void {
    try {
      if (this.playing) {
        return;
      }

      this.playing = true;
      this.applyTierLayers();
      this.applyMode();
      this.transport.start();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[MusicEngine] BGM 시작 실패: ${msg}`);
    }
  }

  /**
   * BGM 재생을 중지한다.
   *
   * 모든 시퀀스와 루프를 정지하고 트랜스포트를 멈춘다.
   */
  stop(): void {
    try {
      if (!this.playing) {
        return;
      }

      this.playing = false;
      this.melodySequence.stop();
      this.bassSequence.stop();
      this.hihatLoop.stop();
      this.padSequence.stop();
      this.transport.stop();
      this.transport.position = 0;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[MusicEngine] BGM 중지 실패: ${msg}`);
    }
  }

  /**
   * 난이도 티어를 설정한다.
   *
   * 티어에 따라 템포(BPM)와 활성 레이어가 변경된다:
   * - 티어 1 (100 BPM): 멜로디만
   * - 티어 2 (110 BPM): 멜로디만
   * - 티어 3 (125 BPM): 멜로디 + 베이스
   * - 티어 4 (140 BPM): 멜로디 + 베이스 + 퍼커션
   * - 티어 5 (160 BPM): 멜로디 + 베이스 + 퍼커션 + 패드
   *
   * @param tier - 난이도 티어 (1~5)
   */
  setTier(tier: DifficultyTier): void {
    try {
      this.currentTier = tier;

      if (this.playing) {
        this.applyTierLayers();
        this.applyMode();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[MusicEngine] 티어 설정 실패: ${msg}`);
    }
  }

  /**
   * 음악 모드를 설정한다.
   *
   * - normal: 장조 멜로디, 티어 기본 BPM
   * - frightened: 단조 멜로디 (Eb), 80 BPM으로 감속
   * - chase: 장조 멜로디 유지, 기본 BPM + 10, 하이햇 강제 추가
   *
   * @param mode - 음악 모드
   */
  setMode(mode: MusicMode): void {
    try {
      this.currentMode = mode;

      if (this.playing) {
        this.applyMode();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[MusicEngine] 모드 설정 실패: ${msg}`);
    }
  }

  /**
   * 현재 티어에 맞는 레이어를 활성화/비활성화한다.
   * @internal
   */
  private applyTierLayers(): void {
    // 멜로디는 항상 활성
    this.melodySequence.start(0);

    // 티어 3 이상: 베이스 추가
    if (this.currentTier >= 3) {
      this.bassSequence.start(0);
    } else {
      this.bassSequence.stop();
    }

    // 티어 4 이상: 하이햇 퍼커션 추가
    if (this.currentTier >= 4) {
      this.hihatLoop.start(0);
    } else {
      this.hihatLoop.stop();
    }

    // 티어 5: 아르페지오 패드 추가
    if (this.currentTier >= 5) {
      this.padSequence.start(0);
    } else {
      this.padSequence.stop();
    }
  }

  /**
   * 현재 모드에 맞는 멜로디와 BPM을 적용한다.
   * @internal
   */
  private applyMode(): void {
    const baseBpm = TIER_BPM[this.currentTier];

    switch (this.currentMode) {
      case 'frightened': {
        // 단조 멜로디로 전환, 80 BPM으로 감속
        this.transport.bpm.value = 80;
        this.melodySequence.events = [...MELODY_FRIGHTENED];
        break;
      }
      case 'chase': {
        // BPM +10, 하이햇 강제 추가
        this.transport.bpm.value = baseBpm + 10;
        this.melodySequence.events = [...MELODY_NORMAL];
        // 체이스 모드에서는 티어와 무관하게 하이햇 활성화
        this.hihatLoop.start(0);
        break;
      }
      case 'normal':
      default: {
        // 장조 멜로디, 티어 기본 BPM
        this.transport.bpm.value = baseBpm;
        this.melodySequence.events = [...MELODY_NORMAL];
        break;
      }
    }
  }

  /**
   * 모든 음악 리소스를 정리한다.
   * 컴포넌트 언마운트 시 호출하여 메모리 누수를 방지한다.
   */
  dispose(): void {
    try {
      this.stop();
    } catch {
      // stop 실패 무시
    }

    const safeDispose = (node: { dispose: () => void }): void => {
      try {
        node.dispose();
      } catch {
        // 이미 해제되거나 닫힌 컨텍스트 무시
      }
    };

    safeDispose(this.melodySequence);
    safeDispose(this.melodySynth);
    safeDispose(this.bassSequence);
    safeDispose(this.bassSynth);
    safeDispose(this.hihatLoop);
    safeDispose(this.hihatSynth);
    safeDispose(this.padSequence);
    safeDispose(this.padSynth);
  }
}
