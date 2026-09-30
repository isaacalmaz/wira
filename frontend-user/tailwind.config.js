/** @type {import('tailwindcss').Config} */

// "Tenun Laut" design tokens. Semantic colours are CSS variables defined in
// src/index.css (light on :root, dark on .dark), so a class like `bg-card`
// or `text-ink-muted` is correct in both themes without any `dark:` prefix.
// See DESIGN.md for how to use them.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- semantic (theme-aware) ----
        ground: v('ground'),
        card: v('card'),
        sunken: v('sunken'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: { DEFAULT: v('ink'), muted: v('muted'), inverse: v('ink-inverse') },
        brand: {
          DEFAULT: v('brand'), hover: v('brand-hover'), ink: v('brand-ink'),
          soft: v('brand-soft'), line: v('brand-line'),
        },
        pay: { DEFAULT: v('pay'), ink: v('pay-ink'), soft: v('pay-soft'), line: v('pay-line') },
        danger: { DEFAULT: v('danger'), ink: v('danger-ink'), soft: v('danger-soft'), line: v('danger-line') },
        success: { DEFAULT: v('success'), ink: v('success-ink'), soft: v('success-soft'), line: v('success-line') },
        warning: { DEFAULT: v('warning'), ink: v('warning-ink'), soft: v('warning-soft'), line: v('warning-line') },

        // ---- raw palette (fixed in both themes) ----
        laut: {
          50: '#F1F6F7', 100: '#E6EFF1', 200: '#D3E2E5', 300: '#7FC4D2', 400: '#3FA3B5',
          500: '#16788C', 600: '#0F6273', 700: '#0B4F5E', 800: '#083F4C', 900: '#062F3C',
        },
        emas: {
          50: '#FAF6EC', 100: '#F5EEDD', 200: '#EADDC2', 400: '#D9A845',
          500: '#C4912F', 600: '#A8791F', 700: '#8A6318',
        },
        bara: { 50: '#FBF1EF', 100: '#F0D9D5', 600: '#A83A30', 700: '#7A2F27' },

        // ---- legacy aliases: old class names resolve to the new palette ----
        primary: { DEFAULT: v('brand'), light: v('brand-ink'), dark: v('brand-hover') },
        secondary: { DEFAULT: '#A8791F', light: '#D9A845', dark: '#8A6318' },
        accent: { DEFAULT: '#A8791F', light: '#D9A845', dark: '#8A6318' },
        // Safety net for any `slate-*` not yet migrated: warm on the light
        // end, sea-dark on the dark end, so leftovers still sit in the palette.
        slate: {
          50: '#F7F6F3', 100: '#EFEDE8', 200: '#E4E1DA', 300: '#D6D2C9', 400: '#A9A49A',
          500: '#6B6862', 600: '#4F5357', 700: '#2E3F44', 800: '#142328', 900: '#0C161A', 950: '#081114',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        control: '12px',
        card: '16px',
        tile: '15px',
        sheet: '24px',
      },
      boxShadow: {
        sheet: '0 -10px 30px rgba(6, 47, 60, 0.13)',
        pop: '0 16px 40px -12px rgba(6, 47, 60, 0.28)',
      },
      maxWidth: {
        app: '42rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
