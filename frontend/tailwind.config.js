/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        safety: {
          orange: '#FF5E0E',
          yellow: '#FFB800',
          dark: '#0F172A',
          card: '#1E293B',
          border: '#334155'
        }
      }
    },
  },
  plugins: [],
}
