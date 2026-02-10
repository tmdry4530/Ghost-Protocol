import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    '*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        neon: {
          purple: '#7c3aed',
          yellow: '#fbbf24',
        },
        dark: {
          bg: '#0a0a0f',
          surface: '#12121a',
          'surface-2': '#1a1a28',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-space-mono)'],
        display: ['var(--font-orbitron)'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'neon-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 8px rgba(124,58,237,0.4), 0 0 24px rgba(124,58,237,0.2), 0 0 48px rgba(124,58,237,0.1)',
          },
          '50%': {
            boxShadow: '0 0 12px rgba(124,58,237,0.6), 0 0 36px rgba(124,58,237,0.35), 0 0 64px rgba(124,58,237,0.2)',
          },
        },
        'neon-pulse-yellow': {
          '0%, 100%': {
            boxShadow: '0 0 8px rgba(251,191,36,0.4), 0 0 24px rgba(251,191,36,0.2), 0 0 48px rgba(251,191,36,0.1)',
          },
          '50%': {
            boxShadow: '0 0 12px rgba(251,191,36,0.6), 0 0 36px rgba(251,191,36,0.35), 0 0 64px rgba(251,191,36,0.2)',
          },
        },
        'float-ghost': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)', opacity: '0.15' },
          '25%': { transform: 'translateY(-30px) translateX(15px)', opacity: '0.25' },
          '50%': { transform: 'translateY(-15px) translateX(-10px)', opacity: '0.1' },
          '75%': { transform: 'translateY(-40px) translateX(20px)', opacity: '0.2' },
        },
        'scroll-ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'flicker': {
          '0%, 92%, 94%, 97%, 100%': { opacity: '1' },
          '93%': { opacity: '0.7' },
          '96%': { opacity: '0.8' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'neon-pulse-yellow': 'neon-pulse-yellow 2s ease-in-out infinite',
        'float-ghost': 'float-ghost 6s ease-in-out infinite',
        'scroll-ticker': 'scroll-ticker 30s linear infinite',
        'flicker': 'flicker 4s ease-in-out infinite',
        'dot-pulse': 'dot-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
