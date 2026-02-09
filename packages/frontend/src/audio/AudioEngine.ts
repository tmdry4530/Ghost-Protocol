import * as Tone from 'tone';

/**
 * 오디오 엔진 싱글톤 클래스.
 *
 * Tone.js 라이프사이클(Web Audio Context 초기화, 마스터 볼륨, 음소거)을 관리한다.
 * 사용자 제스처(클릭/터치) 후에 {@link init}을 호출해야 Web Audio가 활성화된다.
 *
 * @example
 * ```ts
 * const engine = AudioEngine.getInstance();
 * await engine.init(); // 사용자 제스처 핸들러 안에서 호출
 * engine.setMasterVolume(-6);
 * ```
 */
export class AudioEngine {
  /** 싱글톤 인스턴스 */
  private static instance: AudioEngine | null = null;

  /** 초기화 완료 여부 */
  private initialized = false;

  /** 마스터 볼륨 노드 */
  private masterVolume: Tone.Volume;

  /** 음소거 전 볼륨 값(dB)을 보존하기 위한 변수 */
  private previousVolume = 0;

  /** 현재 음소거 상태 */
  private muted = false;

  private constructor() {
    this.masterVolume = new Tone.Volume(0);
    this.masterVolume.toDestination();
  }

  /**
   * Tone.js 컨텍스트가 유효한지 확인한다.
   * 컨텍스트가 닫혀있거나 접근 불가능하면 false를 반환한다.
   *
   * @returns 컨텍스트가 유효하면 true
   */
  private isContextValid(): boolean {
    try {
      return Tone.getContext().state !== 'closed';
    } catch {
      return false;
    }
  }

  /**
   * 싱글톤 인스턴스를 반환한다.
   * 인스턴스가 없으면 새로 생성한다.
   *
   * @returns AudioEngine 싱글톤 인스턴스
   */
  static getInstance(): AudioEngine {
    if (AudioEngine.instance === null) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /**
   * Tone.js 오디오 컨텍스트를 초기화한다.
   *
   * Web Audio API 정책상 사용자 제스처(클릭, 터치 등) 이벤트 핸들러 내에서
   * 호출해야 한다. 이미 초기화된 경우 아무 동작도 하지 않는다.
   *
   * @throws 초기화 실패 시 콘솔에 경고를 출력하지만 예외를 던지지 않는다.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 컨텍스트가 닫혀있으면 새 볼륨 노드 생성
      if (!this.isContextValid()) {
        this.masterVolume = new Tone.Volume(0);
        this.masterVolume.toDestination();
      }
      await Tone.start();
      this.initialized = true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AudioEngine] 오디오 컨텍스트 초기화 실패: ${message}`);
    }
  }

  /**
   * 마스터 볼륨을 설정한다.
   *
   * @param db - 데시벨 단위의 볼륨 값 (예: -6, -12, 0)
   */
  setMasterVolume(db: number): void {
    if (!this.initialized || !this.isContextValid()) {
      return;
    }

    try {
      this.masterVolume.volume.value = db;
      if (!this.muted) {
        this.previousVolume = db;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AudioEngine] 볼륨 설정 실패: ${message}`);
    }
  }

  /**
   * 오디오 출력을 음소거한다.
   * 현재 볼륨 값을 보존하여 {@link unmute} 시 복원한다.
   */
  mute(): void {
    if (!this.initialized || !this.isContextValid()) {
      return;
    }

    try {
      if (!this.muted) {
        this.previousVolume = this.masterVolume.volume.value;
        this.muted = true;
        this.masterVolume.mute = true;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AudioEngine] 음소거 실패: ${message}`);
    }
  }

  /**
   * 음소거를 해제하고 이전 볼륨으로 복원한다.
   */
  unmute(): void {
    if (!this.initialized || !this.isContextValid()) {
      return;
    }

    try {
      if (this.muted) {
        this.muted = false;
        this.masterVolume.mute = false;
        this.masterVolume.volume.value = this.previousVolume;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AudioEngine] 음소거 해제 실패: ${message}`);
    }
  }

  /**
   * 현재 음소거 상태를 반환한다.
   *
   * @returns 음소거 중이면 true
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * 오디오 엔진이 초기화되어 사운드를 재생할 준비가 되었는지 반환한다.
   *
   * @returns 초기화 완료 시 true
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * 마스터 볼륨 출력 노드를 반환한다.
   * SoundEffects, MusicEngine 등이 이 노드에 연결하여 통합 볼륨 제어를 받는다.
   *
   * @returns 마스터 볼륨 Tone.Volume 노드
   */
  getOutput(): Tone.Volume {
    return this.masterVolume;
  }

  /**
   * 모든 오디오 리소스를 정리하고 싱글톤 인스턴스를 제거한다.
   * 애플리케이션 종료 또는 페이지 언로드 시 호출한다.
   */
  dispose(): void {
    try {
      if (this.isContextValid()) {
        this.masterVolume.dispose();
      }
      this.initialized = false;
      this.muted = false;
      this.previousVolume = 0;
      AudioEngine.instance = null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AudioEngine] 리소스 해제 실패: ${message}`);
    }
  }
}
