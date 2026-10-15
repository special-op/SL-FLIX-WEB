/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './index.tsx', './App.tsx', './router.tsx', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './services/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#00e5ff',
        'primary-glow': 'rgba(0, 229, 255, 0.4)',
        accent: '#f40af0',
        bg: '#0a0a0f',
        'card-bg': '#161625',
        border: 'rgba(255,255,255,0.1)',
      },
      fontFamily: { sans: ['Manrope', 'sans-serif'] },
      screens: { xs: '400px', '3xl': '1920px' },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'bounce-slow': 'bounce 3s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
};
