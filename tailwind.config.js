/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dash: {
          bg: '#0A0A1A',
          surface: '#12122A',
          elevated: '#1A1A35',
          border: '#2A2A4A',
          primary: '#E94560',
          primaryDark: '#C73550',
          text: '#FFFFFF',
          textSec: '#8890B0',
          success: '#27AE60',
          warning: '#F39C12',
          error: '#E74C3C',
          info: '#2980B9',
        },
      },
    },
  },
  plugins: [],
};
