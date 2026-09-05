/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Menggunakan class untuk dark mode
  theme: {
    extend: {
      colors: {
        primary: '#0891B2',   // Turquoise Ocean
        secondary: '#D97706', // Sandy Gold
        accent: '#F97316',    // Coral / Sunset
        dark: {
          bg: '#0F172A',
          card: '#1E293B'
        },
        light: {
          bg: '#F8FAFC',
          card: '#FFFFFF'
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
