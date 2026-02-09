import * as Tone from 'tone';

/**
 * 게임 및 배팅 효과음을 생성하는 클래스.
 *
 * Tone.js 신시사이저 패치를 사용하여 10가지 SFX를 합성 방식으로 생성한다.
 * 외부 오디오 파일 없이 모든 사운드를 실시간으로 합성한다.
 *
 * @example
 * ```ts
 * const engine = AudioEngine.getInstance();
 * const sfx = new SoundEffects(engine.getOutput());
 * sfx.playWaka();
 * ```
 */
export class SoundEffects {
  /** 게임 SFX용 FM 신시사이저 (와카, 과일) */
  private readonly wakaSynth: Tone.FMSynth;

  /** 유령 잡기 효과음용 신시사이저 */
  private readonly ghostSynth: Tone.Synth;

  /** 사망 효과음용 신시사이저 (삼각파) */
  private readonly deathSynth: Tone.Synth;

  /** 과일 먹기 효과음용 신시사이저 (사인파) */
  private readonly fruitSynth: Tone.Synth;

  /** 파워업 효과음용 신시사이저 */
  private readonly powerUpSynth: Tone.FMSynth;

  /** 배팅 관련 효과음용 FM 신시사이저 */
  private readonly betSynth: Tone.FMSynth;

  /** 배팅 잠금 효과음용 노이즈 신시사이저 */
  private readonly lockNoiseSynth: Tone.NoiseSynth;

  /** 배팅 잠금 보조 톤 신시사이저 */
  private readonly lockToneSynth: Tone.Synth;

  /** 배팅 승리 팡파르용 신시사이저 (사각파) */
  private readonly winSynth: Tone.Synth;

  /** 배팅 패배 효과음용 신시사이저 */
  private readonly lossSynth: Tone.Synth;

  /** 정산 수령 효과음용 MetalSynth (벨 음색) */
  private readonly payoutSynth: Tone.MetalSynth;

  /** 와카 음높이 교대 상태 (true: C4, false: E4) */
  private wakaToggle = true;

  /**
   * SoundEffects 인스턴스를 생성한다.
   *
   * @param output - 모든 효과음이 연결될 출력 노드 (보통 마스터 볼륨)
   */
  constructor(output: Tone.Volume) {
    // --- 게임 SFX 신시사이저 ---

    // 와카: FM 신시사이저, 짧은 어택, 빠른 릴리즈
    this.wakaSynth = new Tone.FMSynth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.03, sustain: 0, release: 0.01 },
      modulationIndex: 8,
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.002, decay: 0.02, sustain: 0, release: 0.01 },
      volume: -10,
    }).connect(output);

    // 유령 잡기: 톱니파, 하강 스위프
    this.ghostSynth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -8,
    }).connect(output);

    // 사망: 삼각파, 하강 아르페지오
    this.deathSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 },
      volume: -6,
    }).connect(output);

    // 과일: 사인파, 상승 아르페지오
    this.fruitSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.1, release: 0.05 },
      volume: -8,
    }).connect(output);

    // 파워업: FM 낮은 럼블 + 상승 스위프
    this.powerUpSynth = new Tone.FMSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.1, release: 0.1 },
      modulationIndex: 12,
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.1 },
      volume: -6,
    }).connect(output);

    // --- 배팅 SFX 신시사이저 ---

    // 배팅 배치: FM 메탈릭 (동전 떨어지는 소리)
    this.betSynth = new Tone.FMSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      modulationIndex: 20,
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      volume: -8,
    }).connect(output);

    // 배팅 잠금: 노이즈 버스트
    this.lockNoiseSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.04 },
      volume: -14,
    }).connect(output);

    // 배팅 잠금: 보조 저음 톤
    this.lockToneSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.04 },
      volume: -10,
    }).connect(output);

    // 배팅 승리: 사각파 팡파르
    this.winSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.15 },
      volume: -10,
    }).connect(output);

    // 배팅 패배: 하강하는 슬픈 톤
    this.lossSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.1 },
      volume: -8,
    }).connect(output);

    // 정산 수령: MetalSynth 벨 울림
    this.payoutSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.25, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 16,
      resonance: 4000,
      octaves: 1.5,
      volume: -12,
    }).connect(output);
  }

  /**
   * 와카 효과음을 재생한다.
   *
   * FM 신시사이저 처프 사운드로, 호출할 때마다 C4/E4를 교대로 재생한다.
   * 팩맨이 펠릿을 먹을 때 사용한다.
   */
  playWaka(): void {
    try {
      const now = Tone.now();
      const note = this.wakaToggle ? 'C4' : 'E4';
      this.wakaToggle = !this.wakaToggle;
      this.wakaSynth.triggerAttackRelease(note, 0.05, now);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 와카 재생 실패: ${msg}`);
    }
  }

  /**
   * 유령 잡기 효과음을 재생한다.
   *
   * 톱니파의 하강 스위프 사운드 (200ms).
   * 파워 펠릿 활성 상태에서 유령을 잡았을 때 사용한다.
   */
  playEatGhost(): void {
    try {
      const now = Tone.now();
      this.ghostSynth.triggerAttackRelease('G5', 0.2, now);
      this.ghostSynth.frequency.linearRampTo('C3', 0.18, now + 0.02);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 유령 잡기 재생 실패: ${msg}`);
    }
  }

  /**
   * 사망 효과음을 재생한다.
   *
   * 삼각파의 하강 아르페지오 C5 -> C4 (1.5초).
   * 팩맨이 유령에게 잡혔을 때 사용한다.
   */
  playDeath(): void {
    try {
      const now = Tone.now();
      const notes: readonly string[] = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'];
      const noteDuration = 0.15;
      const gap = 0.18;

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note !== undefined) {
          this.deathSynth.triggerAttackRelease(note, noteDuration, now + i * gap);
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 사망 재생 실패: ${msg}`);
    }
  }

  /**
   * 과일 먹기 효과음을 재생한다.
   *
   * 사인파의 상승 아르페지오 C4 -> C5 (300ms).
   * 보너스 과일을 획득했을 때 사용한다.
   */
  playEatFruit(): void {
    try {
      const now = Tone.now();
      const notes: readonly string[] = ['C4', 'E4', 'G4', 'C5'];
      const gap = 0.07;

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note !== undefined) {
          this.fruitSynth.triggerAttackRelease(note, 0.06, now + i * gap);
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 과일 먹기 재생 실패: ${msg}`);
    }
  }

  /**
   * 파워업 효과음을 재생한다.
   *
   * 낮은 C2 럼블에서 시작하여 상승하는 FM 스위프 사운드 (500ms).
   * 파워 펠릿을 먹었을 때 사용한다.
   */
  playPowerUp(): void {
    try {
      const now = Tone.now();
      this.powerUpSynth.triggerAttackRelease('C2', 0.5, now);
      this.powerUpSynth.frequency.linearRampTo('C4', 0.4, now + 0.1);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 파워업 재생 실패: ${msg}`);
    }
  }

  /**
   * 배팅 배치 효과음을 재생한다.
   *
   * FM 메탈릭 동전 소리 (200ms).
   * 사용자가 배팅을 확정했을 때 사용한다.
   */
  playBetPlaced(): void {
    try {
      const now = Tone.now();
      this.betSynth.triggerAttackRelease('A5', 0.2, now);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 배팅 배치 재생 실패: ${msg}`);
    }
  }

  /**
   * 배팅 잠금 효과음을 재생한다.
   *
   * 화이트 노이즈 버스트 + 저음 E2 톤 (150ms).
   * 배팅이 잠겨서 더 이상 변경할 수 없을 때 사용한다.
   */
  playBetLocked(): void {
    try {
      const now = Tone.now();
      this.lockNoiseSynth.triggerAttackRelease(0.15, now);
      this.lockToneSynth.triggerAttackRelease('E2', 0.15, now);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 배팅 잠금 재생 실패: ${msg}`);
    }
  }

  /**
   * 배팅 승리 결과 효과음을 재생한다.
   *
   * 사각파 팡파르: C4 -> E4 -> G4 -> C5 (800ms).
   * 배팅에서 이겼을 때 사용한다.
   */
  playBetResultWin(): void {
    try {
      const now = Tone.now();
      const notes: readonly string[] = ['C4', 'E4', 'G4', 'C5'];
      const gap = 0.18;

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note !== undefined) {
          this.winSynth.triggerAttackRelease(note, 0.15, now + i * gap);
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 배팅 승리 재생 실패: ${msg}`);
    }
  }

  /**
   * 배팅 패배 결과 효과음을 재생한다.
   *
   * 삼각파의 슬픈 하강 E4 -> C3 (500ms).
   * 배팅에서 졌을 때 사용한다.
   */
  playBetResultLoss(): void {
    try {
      const now = Tone.now();
      this.lossSynth.triggerAttackRelease('E4', 0.5, now);
      this.lossSynth.frequency.linearRampTo('C3', 0.45, now + 0.05);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 배팅 패배 재생 실패: ${msg}`);
    }
  }

  /**
   * 정산 수령 효과음을 재생한다.
   *
   * FM 벨 음색의 메탈릭 링 사운드 (300ms).
   * 사용자가 배팅 수익을 인출했을 때 사용한다.
   */
  playPayoutClaimed(): void {
    try {
      const now = Tone.now();
      this.payoutSynth.triggerAttackRelease('C4', 0.3, now);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[SoundEffects] 정산 수령 재생 실패: ${msg}`);
    }
  }

  /**
   * 모든 신시사이저 리소스를 정리한다.
   * 컴포넌트 언마운트 시 호출하여 메모리 누수를 방지한다.
   */
  dispose(): void {
    const safeDispose = (node: { dispose: () => void }): void => {
      try {
        node.dispose();
      } catch {
        // 이미 해제되거나 닫힌 컨텍스트 무시
      }
    };

    safeDispose(this.wakaSynth);
    safeDispose(this.ghostSynth);
    safeDispose(this.deathSynth);
    safeDispose(this.fruitSynth);
    safeDispose(this.powerUpSynth);
    safeDispose(this.betSynth);
    safeDispose(this.lockNoiseSynth);
    safeDispose(this.lockToneSynth);
    safeDispose(this.winSynth);
    safeDispose(this.lossSynth);
    safeDispose(this.payoutSynth);
  }
}
