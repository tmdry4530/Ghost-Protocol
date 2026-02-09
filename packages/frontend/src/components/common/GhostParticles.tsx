/**
 * GhostParticles 컴포넌트
 *
 * 페이지 전체에 떠다니는 유령 파티클 애니메이션.
 * 고정 위치로 모든 페이지에서 배경으로 표시됨.
 */

const GHOSTS = [
  { top: '8%', left: '5%', size: 28, delay: '0s', duration: '7s', color: '#7c3aed' },
  { top: '15%', left: '85%', size: 22, delay: '1.2s', duration: '8s', color: '#fbbf24' },
  { top: '35%', left: '12%', size: 18, delay: '2.4s', duration: '6s', color: '#7c3aed' },
  { top: '50%', left: '90%', size: 24, delay: '0.8s', duration: '9s', color: '#fbbf24' },
  { top: '70%', left: '8%', size: 20, delay: '3.2s', duration: '7.5s', color: '#7c3aed' },
  { top: '60%', left: '75%', size: 16, delay: '1.8s', duration: '8.5s', color: '#fbbf24' },
  { top: '85%', left: '20%', size: 14, delay: '4s', duration: '6.5s', color: '#7c3aed' },
  { top: '25%', left: '60%', size: 20, delay: '2s', duration: '7s', color: '#fbbf24' },
  { top: '45%', left: '40%', size: 12, delay: '3.5s', duration: '10s', color: '#7c3aed' },
  { top: '75%', left: '55%', size: 16, delay: '0.5s', duration: '8s', color: '#fbbf24' },
];

interface GhostSVGProps {
  size: number;
  color: string;
}

function GhostSVG({ size, color }: GhostSVGProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z"
        fill={color}
        fillOpacity={0.3}
      />
      <circle cx="9" cy="10" r="1.5" fill={color} fillOpacity={0.6} />
      <circle cx="15" cy="10" r="1.5" fill={color} fillOpacity={0.6} />
    </svg>
  );
}

export function GhostParticles() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      {GHOSTS.map((ghost, index) => (
        <div
          key={index}
          className="absolute animate-float-ghost"
          style={{
            top: ghost.top,
            left: ghost.left,
            animationDelay: ghost.delay,
            animationDuration: ghost.duration,
          }}
        >
          <GhostSVG size={ghost.size} color={ghost.color} />
        </div>
      ))}
    </div>
  );
}
