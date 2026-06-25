import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: 'hsl(var(--paper))', 2: 'hsl(var(--paper-2))' },
        ink: { DEFAULT: 'hsl(var(--ink))', 2: 'hsl(var(--ink-2))', 3: 'hsl(var(--ink-3))' },
        line: { DEFAULT: 'hsl(var(--line))', 2: 'hsl(var(--line-2))' },
        accent: { DEFAULT: 'hsl(var(--accent))', 2: 'hsl(var(--accent-2))', soft: 'hsl(var(--accent-soft))' },
        gold: 'hsl(var(--gold))',
        crimson: 'hsl(var(--crimson))',
        border: 'hsl(var(--line))',
        background: 'hsl(var(--paper))',
        foreground: 'hsl(var(--ink))',
        muted: { DEFAULT: 'hsl(var(--paper-2))', foreground: 'hsl(var(--ink-3))' },
        primary: { DEFAULT: 'hsl(var(--ink))', foreground: 'hsl(var(--paper))' },
        secondary: { DEFAULT: 'hsl(var(--paper-2))', foreground: 'hsl(var(--ink))' },
        destructive: { DEFAULT: 'hsl(var(--crimson))', foreground: 'hsl(var(--paper))' },
        ring: 'hsl(var(--ink))',
      },
      borderRadius: { lg: '8px', md: '6px', sm: '4px' },
      fontFamily: {
        sans: ['var(--font-sans)', 'Helvetica Neue', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Times New Roman', 'serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
