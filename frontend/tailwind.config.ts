import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        panel: {
          DEFAULT: '#060608',
          elevated: '#0c0d10',
          border: '#1b1d22',
          muted: '#131418',
        },
        sigma: {
          6: '#15803d',
          4: '#22c55e',
          3: '#eab308',
          2: '#f97316',
          1: '#ef4444',
        },
        brand: {
          300: '#2dd4bf',
          400: '#14b8a6',
          500: '#0d9488',
          DEFAULT: '#14b8a6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'inset-panel': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.35)',
        'glow-brand': '0 0 24px rgba(45, 212, 191, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
