import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
        },
        sys: {
          header:  '#1e1b4b',
          nav:     '#312e81',
          panel:   '#eef2ff',
          border:  '#c7d2fe',
          text:    '#3730a3',
        },
      },
      fontFamily: {
        sans: [
          '"Hiragino Kaku Gothic Pro"',
          'Meiryo',
          '"Yu Gothic"',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      },
    },
  },
  plugins: [],
}
export default config
