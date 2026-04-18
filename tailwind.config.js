/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{html,js}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#1e1e2e', light: '#282840' },
        accent: { DEFAULT: '#7c3aed', hover: '#6d28d9' },
      }
    },
  },
  plugins: [],
};
