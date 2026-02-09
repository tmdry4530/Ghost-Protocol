import { useAudioStore } from '../../stores/audioStore.js';
import { useAudio } from '../../hooks/useAudio.js';

/**
 * 오디오 음소거/해제 토글 버튼 컴포넌트.
 *
 * - 첫 클릭: Web Audio Context 초기화 + 음소거 해제
 * - 이후 클릭: 음소거 토글
 * - 음소거 해제 시 네온 글로우 효과 적용
 *
 * @example
 * ```tsx
 * <nav>
 *   <AudioToggle />
 * </nav>
 * ```
 */
export function AudioToggle() {
  const muted = useAudioStore((s) => s.muted);
  const { toggleMute } = useAudio();

  const handleToggle = () => {
    try {
      toggleMute();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[AudioToggle] Toggle failed: ${msg}`);
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`
        flex items-center justify-center
        w-10 h-10 rounded-full
        transition-all duration-200
        ${
          muted
            ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            : 'bg-ghost-violet text-ghost-neon shadow-[0_0_12px_rgba(0,255,157,0.6)] hover:shadow-[0_0_16px_rgba(0,255,157,0.8)]'
        }
      `}
      title={muted ? 'Unmute' : 'Mute'}
      aria-label={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
    </button>
  );
}

/**
 * 스피커 아이콘 (음소거 해제 상태).
 * @internal
 */
function SpeakerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

/**
 * 스피커 음소거 아이콘 (음소거 상태).
 * @internal
 */
function SpeakerMutedIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
