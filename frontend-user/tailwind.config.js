/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0891B2', light: '#22D3EE', dark: '#0E7490' },
        secondary: { DEFAULT: '#D97706', light: '#FBBF24', dark: '#B45309' },
        accent: { DEFAULT: '#F97316', light: '#FB923C', dark: '#EA580C' },
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
