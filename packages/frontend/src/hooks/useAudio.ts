import { useRef, useEffect, useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore.js';
import { AudioEngine, SoundEffects, MusicEngine } from '../audio/index.js';

/**
 * 오디오 엔진 싱글톤 라이프사이클을 관리하는 훅.
 *
 * - 첫 호출 시 AudioEngine, SoundEffects, MusicEngine 인스턴스를 생성한다.
 * - 음소거가 해제되면 AudioEngine.init()을 호출하여 Web Audio Context를 초기화한다.
 * - muted/volume 상태 변경 시 AudioEngine 상태를 동기화한다.
 *
 * @returns 효과음/음악 인스턴스 및 토글 함수
 *
 * @example
 * ```tsx
 * const { sfx, music, toggleMute, initialized } = useAudio();
 * if (initialized) {
 *   sfx.playWaka();
 * }
 * ```
 */
export function useAudio() {
  const { muted, volume, setInitialized } = useAudioStore();

  // 싱글톤 인스턴스 (컴포넌트 재렌더링 시에도 유지)
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const sfxRef = useRef<SoundEffects | null>(null);
  const musicRef = useRef<MusicEngine | null>(null);

  // 초기화 진행 중 플래그 (중복 초기화 방지)
  const initializingRef = useRef(false);

  // 인스턴스 생성 (최초 1회만)
  if (audioEngineRef.current === null) {
    audioEngineRef.current = AudioEngine.getInstance();
  }

  const audioEngine = audioEngineRef.current;
  if (sfxRef.current === null) {
    sfxRef.current = new SoundEffects(audioEngine.getOutput());
  }

  if (musicRef.current === null) {
    musicRef.current = new MusicEngine(audioEngine.getOutput());
  }

  // 음소거 해제 시 오디오 컨텍스트 초기화
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    if (!muted && !engine.isReady() && !initializingRef.current) {
      initializingRef.current = true;
      engine
        .init()
        .then(() => {
          setInitialized(true);
          initializingRef.current = false;
        })
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[useAudio] 오디오 초기화 실패: ${msg}`);
          initializingRef.current = false;
        });
    }
  }, [muted, setInitialized]);

  // muted 상태 동기화
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine || !engine.isReady()) return;

    try {
      if (muted) {
        engine.mute();
      } else {
        engine.unmute();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[useAudio] 음소거 동기화 실패: ${msg}`);
    }
  }, [muted]);

  // volume 상태 동기화 (dB 변환: 0-1 → -60 ~ 0 dB)
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine || !engine.isReady()) return;

    try {
      // 0.0 → -60dB, 1.0 → 0dB (로그 스케일)
      const db = volume === 0 ? -60 : 20 * Math.log10(volume);
      engine.setMasterVolume(db);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[useAudio] 볼륨 동기화 실패: ${msg}`);
    }
  }, [volume]);

  // 컴포넌트 언마운트 시 오디오 리소스 정리
  useEffect(() => {
    return () => {
      try {
        musicRef.current?.dispose();
        musicRef.current = null;
      } catch {
        // 이미 해제된 리소스 무시
      }
      try {
        sfxRef.current?.dispose();
        sfxRef.current = null;
      } catch {
        // 이미 해제된 리소스 무시
      }
    };
  }, []);

  const toggleMute = useCallback(() => {
    useAudioStore.getState().toggleMute();
  }, []);

  const engine = audioEngineRef.current;
  return {
    sfx: sfxRef.current,
    music: musicRef.current,
    toggleMute,
    initialized: engine.isReady(),
  };
}
