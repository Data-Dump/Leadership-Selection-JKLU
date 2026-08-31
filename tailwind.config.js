/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f3f8',
          100: '#d9e2ef',
          200: '#b3c4df',
          300: '#8da7cf',
          400: '#6789bf',
          500: '#416baf',
          600: '#2d558c',
          700: '#1C2B4A',
          800: '#162240',
          900: '#0e1729',
          950: '#090e1a',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#B45309',
          700: '#92400e',
          800: '#78350f',
          900: '#451a03',
        },
        stone: {
          50: '#fafaf9',
          75: '#F7F6F3',
          100: '#f5f5f4',
          150: '#eeede9',
          200: '#e7e5e4',
          300: '#D4CFC8',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
}
