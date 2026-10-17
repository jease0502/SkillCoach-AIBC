import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Soft-lavender workspace palette (from the earlier SkillCoach design system).
        brand: {
          50: '#f3f1fc',
          100: '#e9e6fd',
          200: '#d6d1fb',
          300: '#b9b2f7',
          400: '#9c92f5',
          500: '#7067e8',
          600: '#6158dc',
          700: '#554bc9',
          800: '#463da8',
          900: '#372f84',
        },
        // Warm neutral greys (text #303035) instead of blue slate.
        slate: {
          50: '#f7f7fa',
          100: '#f1f1f5',
          200: '#e8e8ed',
          300: '#d6d6dd',
          400: '#a3a4ac',
          500: '#6b6c74',
          600: '#66676f',
          700: '#4c4d55',
          800: '#3a3a40',
          900: '#303035',
          950: '#1e1e22',
        },
        ink: { DEFAULT: '#373739', hover: '#29292b' },
        canvas: { DEFAULT: '#ccc8fe', soft: '#f3f1fc', workspace: '#fbfafe' },
      },
      borderColor: {
        glass: 'rgba(40, 40, 60, 0.07)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(30, 30, 45, 0.025), 0 4px 12px rgba(30, 30, 45, 0.04)',
        lift: '0 2px 5px rgba(30, 30, 45, 0.03), 0 8px 20px rgba(30, 30, 45, 0.06)',
        shell: '0 20px 60px rgba(70, 60, 130, 0.14)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flash: {
          '0%': { boxShadow: '0 0 0 0 rgb(79 70 229 / 0.55)' },
          '100%': { boxShadow: '0 0 0 12px rgb(79 70 229 / 0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms ease-out both',
        flash: 'flash 900ms ease-out 2',
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
};

export default config;
