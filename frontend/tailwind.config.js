/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8F3',
        lavender: '#F0E8FA',
        violet: { DEFAULT: '#8B5CF6', dark: '#6D3FD9', soft: '#EDE4FD' },
        blush: '#F5DCE8',
        ink: { DEFAULT: '#241638', soft: '#5B4D73', faint: '#8A7FA0' },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 6px 24px -8px rgba(139, 92, 246, 0.25)',
        nav: '0 -8px 30px -12px rgba(36, 22, 56, 0.25)',
      },
      keyframes: {
        scan: { '0%,100%': { top: '8%' }, '50%': { top: '88%' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        fadeup: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        scan: 'scan 2.6s ease-in-out infinite',
        floaty: 'floaty 4s ease-in-out infinite',
        fadeup: 'fadeup .35s ease-out both',
      },
    },
  },
  plugins: [],
};
