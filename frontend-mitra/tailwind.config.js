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
        primary: '#0891B2',
        secondary: '#D97706',
        accent: '#F97316',
        dark: '#0F172A',
        light: '#F8FAFC'
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
