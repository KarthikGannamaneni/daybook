import type { Config } from 'tailwindcss';

/**
 * §6.1: colour is semantic only. Three roles — expense, income, accent — and
 * neutrals. Everything is a CSS variable so light and dark share one definition.
 */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        surface: 'hsl(var(--surface))',
        border: 'hsl(var(--border))',
        fg: 'hsl(var(--fg))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        'accent-fg': 'hsl(var(--accent-fg))',
        expense: 'hsl(var(--expense))',
        income: 'hsl(var(--income))',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // §6.1: three sizes per screen. These are the three.
        label: ['0.8125rem', { lineHeight: '1.15rem', letterSpacing: '0.01em' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        amount: ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        card: '14px',
        chip: '999px',
      },
      transitionDuration: {
        feedback: '120ms',
        transition: '220ms',
      },
      keyframes: {
        drain: { from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0)' } },
        'row-enter': {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        drain: 'drain linear forwards',
        'row-enter': 'row-enter 220ms ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
