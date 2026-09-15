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
      },
      borderRadius: {
        card: '0.75rem',   // matches shared Card (rounded-xl)
        modal: '1.5rem',   // matches shared Modal (rounded-3xl)
      },
      zIndex: {
        // A single managed scale instead of the five different ad-hoc
        // values (z-50, z-[100], z-[200]) modals used to carry - see
        // components/shared/UIComponents.jsx's Modal.
        dropdown: '40',
        modal: '100',
        toast: '200',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
