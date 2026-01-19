/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'hud-bg': '#1a1a1a',
        'hud-surface': '#242424',
        'hud-border': '#3a3a3a',
        'hud-text': '#e5e5e5',
        'hud-text-muted': '#a0a0a0',
        'confidence-high': '#22c55e',
        'confidence-medium': '#eab308',
        'confidence-low': '#ef4444',
      },
    },
  },
  plugins: [],
};
