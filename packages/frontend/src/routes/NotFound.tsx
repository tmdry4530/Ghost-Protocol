/**
 * 404 page
 * Error page shown when accessing a non-existent route
 */
import { Link } from 'react-router-dom';

/**
 * NotFound component
 * Ghost Protocol themed 404 error page
 */
export function NotFound(): React.JSX.Element {
  return (
    <div className="scanline-overlay grid-bg relative flex min-h-screen flex-col items-center justify-center px-4">
      {/* Background decoration: floating ghost SVGs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Ghost 1 — top left */}
        <svg
          className="animate-float-ghost absolute left-[10%] top-[15%]"
          style={{ '--ghost-duration': '8s' } as React.CSSProperties}
          width="64"
          height="72"
          viewBox="0 0 64 72"
          fill="none"
        >
          <path
            d="M32 0C14.3 0 0 14.3 0 32v28c0 2 1 4 3 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s3-2 3-4V32C64 14.3 49.7 0 32 0z"
            fill="rgba(124,58,237,0.15)"
          />
          <circle cx="22" cy="28" r="5" fill="rgba(124,58,237,0.25)" />
          <circle cx="42" cy="28" r="5" fill="rgba(124,58,237,0.25)" />
        </svg>

        {/* Ghost 2 — top right */}
        <svg
          className="animate-float-ghost absolute right-[12%] top-[20%]"
          style={{ '--ghost-duration': '10s', animationDelay: '2s' } as React.CSSProperties}
          width="48"
          height="54"
          viewBox="0 0 64 72"
          fill="none"
        >
          <path
            d="M32 0C14.3 0 0 14.3 0 32v28c0 2 1 4 3 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s3-2 3-4V32C64 14.3 49.7 0 32 0z"
            fill="rgba(236,72,153,0.12)"
          />
          <circle cx="22" cy="28" r="5" fill="rgba(236,72,153,0.2)" />
          <circle cx="42" cy="28" r="5" fill="rgba(236,72,153,0.2)" />
        </svg>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Large ghost icon */}
        <svg
          className="mb-8"
          width="120"
          height="135"
          viewBox="0 0 64 72"
          fill="none"
        >
          <path
            d="M32 0C14.3 0 0 14.3 0 32v28c0 2 1 4 3 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s3-2 3-4V32C64 14.3 49.7 0 32 0z"
            fill="rgba(124,58,237,0.3)"
          />
          <circle cx="22" cy="28" r="5" fill="rgba(124,58,237,0.6)" />
          <circle cx="42" cy="28" r="5" fill="rgba(124,58,237,0.6)" />
        </svg>

        {/* 404 text */}
        <h1
          className="neon-text-purple mb-4 text-8xl font-black tracking-widest"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          404
        </h1>

        {/* Error message */}
        <p className="mb-2 text-xl font-semibold text-white">
          Page Not Found
        </p>
        <p className="mb-8 max-w-md text-sm text-gray-400">
          The page you requested does not exist or has been moved.
          <br />
          Please check the URL and try again.
        </p>

        {/* Back to home button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-ghost-violet/60 bg-ghost-violet/10 px-6 py-3 text-sm font-semibold tracking-wide text-ghost-violet transition-all hover:border-ghost-violet hover:bg-ghost-violet/20"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
