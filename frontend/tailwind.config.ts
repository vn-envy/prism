import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Industrial panel backgrounds
        panel: {
          DEFAULT: '#0a0a0a',
          elevated: '#141414',
          border: '#262626',
          muted: '#1f1f1f',
        },
        // Sigma level color coding
        sigma: {
          6: '#15803d', // ≥1.67 Cpk  — dark green
          4: '#22c55e', // ≥1.33 Cpk  — green
          3: '#eab308', // ≥1.00 Cpk  — yellow
          2: '#f97316', // ≥0.67 Cpk  — orange
          1: '#ef4444', // <0.67 Cpk  — red
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'inset-panel': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
