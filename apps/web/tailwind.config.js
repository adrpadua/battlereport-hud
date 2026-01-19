/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'hud-bg': '#1a1a1a',
        'hud-surface': '#242424',
        'hud-border': '#3a3a3a',
        'hud-text': '#e5e5e5',
        'hud-muted': '#888',
      },
    },
  },
  plugins: [],
};
