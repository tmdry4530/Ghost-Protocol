/**
 * Mobile touch controls (D-pad)
 * Directional input buttons displayed at bottom of screen
 */
import { useState, useEffect } from 'react';
import type { Direction } from '@ghost-protocol/shared';

interface TouchControlsProps {
  /** Direction change callback */
  onDirectionChange: (direction: Direction | null) => void;
}

/**
 * Mobile on-screen directional control component
 * Displayed only on screens smaller than 768px
 */
export function TouchControls({ onDirectionChange }: TouchControlsProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);

  // Detect screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => { window.removeEventListener('resize', checkMobile); };
  }, []);

  if (!isMobile) return null;

  const handleTouchStart = (direction: Direction) => {
    setActiveDirection(direction);
    onDirectionChange(direction);
  };

  const handleTouchEnd = () => {
    setActiveDirection(null);
    onDirectionChange(null);
  };

  const buttonClass = (direction: Direction) =>
    `w-16 h-16 rounded-lg transition-all duration-100 ${
      activeDirection === direction
        ? 'bg-ghost-neon shadow-lg shadow-ghost-neon/50 scale-110'
        : 'bg-ghost-violet/50 hover:bg-ghost-violet/70'
    }`;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div className="relative w-48 h-48">
        {/* Up */}
        <button
          onTouchStart={() => { handleTouchStart('up'); }}
          onTouchEnd={handleTouchEnd}
          className={`${buttonClass('up')} absolute top-0 left-1/2 -translate-x-1/2`}
          aria-label="Up"
        >
          <svg className="w-8 h-8 mx-auto text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 3l6 6H4l6-6z" />
          </svg>
        </button>

        {/* Down */}
        <button
          onTouchStart={() => { handleTouchStart('down'); }}
          onTouchEnd={handleTouchEnd}
          className={`${buttonClass('down')} absolute bottom-0 left-1/2 -translate-x-1/2`}
          aria-label="Down"
        >
          <svg className="w-8 h-8 mx-auto text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 17l-6-6h12l-6 6z" />
          </svg>
        </button>

        {/* Left */}
        <button
          onTouchStart={() => { handleTouchStart('left'); }}
          onTouchEnd={handleTouchEnd}
          className={`${buttonClass('left')} absolute left-0 top-1/2 -translate-y-1/2`}
          aria-label="Left"
        >
          <svg className="w-8 h-8 mx-auto text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 10l6-6v12l-6-6z" />
          </svg>
        </button>

        {/* Right */}
        <button
          onTouchStart={() => { handleTouchStart('right'); }}
          onTouchEnd={handleTouchEnd}
          className={`${buttonClass('right')} absolute right-0 top-1/2 -translate-y-1/2`}
          aria-label="Right"
        >
          <svg className="w-8 h-8 mx-auto text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17 10l-6 6V4l6 6z" />
          </svg>
        </button>

        {/* Center circle (visual guide) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-arena-bg/50 border-2 border-ghost-violet/30" />
      </div>
    </div>
  );
}
